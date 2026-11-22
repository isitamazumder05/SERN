import logging
import sys
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger("sern.ml_service")

# Ensure AccidentDetectionML is on sys.path if not already present
REPO_ROOT = Path(__file__).resolve().parents[3]
ML_DIR = REPO_ROOT / "AccidentDetectionML"
if str(ML_DIR) not in sys.path and ML_DIR.exists():
    sys.path.append(str(ML_DIR))


class MLServiceError(Exception):
    """Raised when ML model loading or prediction fails."""
    pass


class MLService:
    """
    Adapter service for the AccidentDetectionML predictor.

    IMPORTANT:
    The ML model performs binary accident detection (Accident / No Accident).
    It DOES NOT provide injury severity classification. No injury severity
    is fabricated or claimed.
    """

    def __init__(self, predictor_instance: Optional[Any] = None):
        self._predictor = predictor_instance
        self._load_error: Optional[str] = None

        if self._predictor is None:
            self._init_predictor()

    def _init_predictor(self) -> None:
        try:
            # Compatibility shim for unpickling scikit-learn 1.6.x ColumnTransformer artifacts on newer scikit-learn (1.7+)
            try:
                import sklearn.compose._column_transformer as _ct
                if not hasattr(_ct, "_RemainderColsList"):
                    setattr(_ct, "_RemainderColsList", type("_RemainderColsList", (list,), {}))
            except Exception:
                pass

            from ml_module.predictor import AccidentPredictor
            self._predictor = AccidentPredictor()
            logger.info("AccidentPredictor successfully loaded.")
        except Exception as exc:
            self._load_error = str(exc)
            logger.error("Failed to initialize AccidentPredictor: %s", exc, exc_info=True)
            self._predictor = None

    @property
    def is_available(self) -> bool:
        return self._predictor is not None

    def predict(self, sensor_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Invoke the existing ML predictor with its exact expected input contract:
        - gsensor: list of (x, y, z)
        - gyro: list of (x, y, z)
        - gps_speed: list of floats
        - vehiclesize: vehicle size category (e.g. 'car')
        - gyro_is_hd: bool

        Returns:
            dict containing:
            - accident_detected: bool
            - accident_probability: float
            - threshold: float
        """
        if not self.is_available:
            error_msg = f"ML Predictor is not available. Initialization error: {self._load_error}"
            logger.error(error_msg)
            raise MLServiceError(error_msg)

        # Validate input contract before passing to predictor
        required_keys = ["gsensor", "gyro", "gps_speed"]
        for key in required_keys:
            if key not in sensor_data or not sensor_data[key]:
                raise MLServiceError(f"Missing or empty required sensor data field: '{key}'")

        if len(sensor_data["gsensor"]) != len(sensor_data["gyro"]):
            raise MLServiceError("Accelerometer and gyroscope reading counts must match.")

        try:
            result = self._predictor.predict(sensor_data)
            return {
                "accident_detected": bool(result["accident_detected"]),
                "accident_probability": float(result["accident_probability"]),
                "threshold": float(result["threshold"])
            }
        except Exception as exc:
            logger.error("Prediction execution failed: %s", exc, exc_info=True)
            # Must return a controlled error and log failure.
            # Do NOT silently classify an event as an accident.
            raise MLServiceError(f"Prediction execution failed: {str(exc)}") from exc


# Global singleton instance for application use
ml_service = MLService()

