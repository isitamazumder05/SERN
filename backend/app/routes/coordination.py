from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.emergency import Emergency
from app.schemas.notification import NotificationResponse
from app.schemas.coordination import (
    CoordinatedEmergencyCase,
    CoordinationAnalyticsSummary,
    RegisteredContactAlertRequest,
    HospitalAlertRequest,
    SimulationScenarioRequest,
)
from app.services.coordination_service import CoordinationService

router = APIRouter(prefix="/coordination", tags=["Hospital Coordination & Integration (Member 5)"])


@router.get("/emergencies", response_model=List[CoordinatedEmergencyCase])
def list_coordinated_emergencies(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by emergency status"),
    hospital_id: Optional[int] = Query(None, description="Filter by assigned destination hospital ID"),
    active_only: bool = Query(False, description="Filter only active/inbound emergencies"),
    db: Session = Depends(get_db),
):
    """
    Retrieve enriched emergency cases combining AI/ML telemetry, patient triage details,
    ambulance dispatch, hospital assignment, Member 4 route/ETA, notifications, and
    the 6-stage emergency lifecycle timeline.
    """
    return CoordinationService.list_coordinated_cases(
        db=db,
        status_filter=status_filter,
        hospital_id=hospital_id,
        active_only=active_only,
    )


@router.get("/emergencies/{emergency_id}", response_model=CoordinatedEmergencyCase)
def get_coordinated_emergency(emergency_id: int, db: Session = Depends(get_db)):
    """Retrieve full lifecycle and hospital coordination details for a single emergency."""
    emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency with ID {emergency_id} not found.",
        )
    return CoordinationService.serialize_coordinated_case(db, emergency)


@router.get("/analytics", response_model=CoordinationAnalyticsSummary)
def get_coordination_analytics(db: Session = Depends(get_db)):
    """
    Retrieve response history metrics, operational logs summary, ETA averages,
    hospital admission loads, and notification distribution.
    """
    return CoordinationService.get_analytics_summary(db)


@router.post("/notify-contact", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def trigger_registered_contact_alert(
    payload: RegisteredContactAlertRequest,
    db: Session = Depends(get_db),
):
    """Send a simulated emergency notification to a registered patient contact or first responder."""
    try:
        return CoordinationService.notify_registered_contact(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/hospital-alert", response_model=CoordinatedEmergencyCase)
def trigger_hospital_pre_arrival_alert(
    payload: HospitalAlertRequest,
    db: Session = Depends(get_db),
):
    """
    Assign destination hospital, ensure route/ETA calculation, record a trauma pre-arrival
    HOSPITAL_ALERT notification, and optionally notify registered family contacts.
    """
    try:
        return CoordinationService.coordinate_hospital_pre_arrival(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/simulate", status_code=status.HTTP_201_CREATED)
def run_e2e_simulation(
    payload: SimulationScenarioRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Execute an end-to-end simulation integrating:
    - Member 3 AI/ML Sensor Accident Detection
    - Member 2 Explicit Validation & Nearest Ambulance Dispatch
    - Member 4 Road-Network Route & ETA Boundary
    - Member 5 Hospital Pre-Arrival Coordination & Registered Contact Notification
    """
    try:
        return CoordinationService.run_e2e_simulation_scenario(db, payload)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/seed-demo")
def seed_realistic_demo_data(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Seed realistic Bengaluru hospitals, ambulances, and multi-stage emergencies for live dashboard testing."""
    return CoordinationService.seed_realistic_demo_dataset(db)
