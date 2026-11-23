import pytest
from app.services.ml_service import MLService, MLServiceError
from tests.conftest import MockPredictor


def test_ml_service_adapter_with_mock():
    """Verify ML adapter processes input contract and returns expected format."""
    mock_pred = MockPredictor(detected=True, probability=0.91, threshold=0.3356)
    svc = MLService(predictor_instance=mock_pred)

    sensor_data = {
        "gsensor": [[0.5, 0.2, 9.8], [0.4, 0.1, 9.7]],
        "gyro": [[0.01, 0.02, 0.03], [0.02, 0.01, 0.04]],
        "gps_speed": [45.0, 42.0],
        "vehiclesize": "car",
        "gyro_is_hd": False
    }

    result = svc.predict(sensor_data)
    assert result["accident_detected"] is True
    assert result["accident_probability"] == 0.91
    assert result["threshold"] == 0.3356


def test_ml_service_invalid_contract_raises_error():
    """Verify ML adapter raises MLServiceError on invalid input contracts."""
    mock_pred = MockPredictor()
    svc = MLService(predictor_instance=mock_pred)

    # Missing gps_speed
    invalid_data = {
        "gsensor": [[0.1, 0.2, 9.8]],
        "gyro": [[0.01, 0.02, 0.03]],
        "gps_speed": []
    }
    with pytest.raises(MLServiceError):
        svc.predict(invalid_data)

    # Accelerometer and Gyroscope mismatched lengths
    mismatched_data = {
        "gsensor": [[0.1, 0.2, 9.8], [0.2, 0.3, 9.9]],
        "gyro": [[0.01, 0.02, 0.03]],
        "gps_speed": [30.0]
    }
    with pytest.raises(MLServiceError):
        svc.predict(mismatched_data)


def test_ml_service_controlled_error_on_predictor_failure():
    """Verify that predictor failure raises controlled MLServiceError and does not classify silently as accident."""
    class FailingPredictor:
        def predict(self, sensor_data):
            raise RuntimeError("Underlying model failed during matrix multiplication.")

    svc = MLService(predictor_instance=FailingPredictor())
    sensor_data = {
        "gsensor": [[0.1, 0.2, 9.8]],
        "gyro": [[0.01, 0.02, 0.03]],
        "gps_speed": [30.0],
        "vehiclesize": "car",
        "gyro_is_hd": False
    }

    with pytest.raises(MLServiceError) as exc_info:
        svc.predict(sensor_data)
    assert "Prediction execution failed" in str(exc_info.value)


def test_real_ml_model_integration():
    """Verify the real ML model loads from disk and predicts accurately."""
    real_svc = MLService()  # Loads actual model from AccidentDetectionML
    assert real_svc.is_available is True

    normal_reading = {
        "gsensor": [[0.1, 0.2, 9.8], [0.2, 0.1, 9.7]],
        "gyro": [[0.01, 0.02, 0.03], [0.02, 0.01, 0.04]],
        "gps_speed": [40.0, 38.0],
        "vehiclesize": "car",
        "gyro_is_hd": True
    }
    result = real_svc.predict(normal_reading)
    assert isinstance(result["accident_detected"], bool)
    assert isinstance(result["accident_probability"], float)
    assert result["accident_detected"] is False  # Normal smooth driving

    crash_reading = {
        "gsensor": [[50.0, 40.0, 80.0], [60.0, 50.0, 90.0]],
        "gyro": [[5.0, 6.0, 7.0], [8.0, 9.0, 10.0]],
        "gps_speed": [90.0, 0.0],
        "vehiclesize": "car",
        "gyro_is_hd": True
    }
    crash_result = real_svc.predict(crash_reading)
    assert crash_result["accident_detected"] is True
    assert crash_result["accident_probability"] >= crash_result["threshold"]
    assert abs(crash_result["threshold"] - 0.33567089961170193) < 1e-6


def test_sklearn_compatibility_shim_and_direct_predictor():
    """
    Verify the scikit-learn compatibility workaround (_RemainderColsList shim)
    and test direct AccidentPredictor loading and prediction across vehicle types.
    """
    import sklearn.compose._column_transformer as _ct

    MLService._apply_sklearn_compat_shim()
    assert hasattr(_ct, "_RemainderColsList")
    assert issubclass(_ct._RemainderColsList, list)

    from ml_module.predictor import AccidentPredictor

    predictor = AccidentPredictor()
    assert predictor.model is not None
    assert len(predictor.feature_columns) == 29

    for vehicle_type in ["car", "van", "truck"]:
        sample = {
            "gsensor": [[48.0, 39.0, 78.0], [62.0, 51.0, 88.0]],
            "gyro": [[5.2, 6.1, 7.4], [8.1, 9.0, 10.2]],
            "gps_speed": [85.0, 0.0],
            "vehiclesize": vehicle_type,
            "gyro_is_hd": True,
        }
        res = predictor.predict(sample)
        assert set(res.keys()) == {"accident_detected", "accident_probability", "threshold"}
        assert res["accident_detected"] is True
        assert 0.0 <= res["accident_probability"] <= 1.0

