from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.accident import AccidentResponse
from app.schemas.ambulance import AmbulanceResponse
from app.schemas.hospital import HospitalResponse
from app.schemas.emergency import AssignmentResponse
from app.schemas.notification import NotificationResponse
from app.schemas.routing import RouteResponse


class PatientEmergencyDetails(BaseModel):
    triage_level: str = Field(..., description="Derived clinical triage classification (CRITICAL, HIGH, MODERATE)")
    accident_probability: float
    model_threshold: float
    vehicle_size: str
    gyro_is_hd: bool
    peak_g_force: float
    peak_speed_kmh: float
    speed_drop_kmh: float
    incident_coordinates: str
    validation_notes: Optional[str] = None
    registered_contacts: List[Dict[str, str]] = []


class LifecycleStageItem(BaseModel):
    stage_key: str
    label: str
    description: str
    status: str  # COMPLETED, CURRENT, UPCOMING, CANCELLED
    timestamp: Optional[datetime] = None
    actor: str


class CoordinatedEmergencyCase(BaseModel):
    id: int
    case_code: str
    status: str
    created_at: datetime
    updated_at: datetime
    completion_timestamp: Optional[datetime] = None
    eta_minutes: Optional[float] = None
    distance_km: Optional[float] = None
    route_source: Optional[str] = None

    accident: Optional[AccidentResponse] = None
    assigned_ambulance: Optional[AmbulanceResponse] = None
    hospital: Optional[HospitalResponse] = None
    route: Optional[RouteResponse] = None
    assignments: List[AssignmentResponse] = []
    notifications: List[NotificationResponse] = []
    patient_details: Optional[PatientEmergencyDetails] = None
    lifecycle_stages: List[LifecycleStageItem] = []

    model_config = ConfigDict(from_attributes=True)


class CoordinationAnalyticsSummary(BaseModel):
    total_accidents_evaluated: int
    detected_accidents: int
    normal_driving_events: int
    rejected_false_alarms: int
    total_emergencies: int
    active_emergencies: int
    completed_emergencies: int
    cancelled_emergencies: int
    incoming_ambulances_count: int
    total_ambulances: int
    available_ambulances: int
    assigned_ambulances: int
    total_hospitals: int
    active_hospitals: int
    total_notifications_sent: int
    hospital_alerts_count: int
    contact_alerts_count: int
    dispatch_notices_count: int
    avg_eta_minutes: float
    avg_distance_km: float
    avg_resolution_minutes: float
    status_breakdown: Dict[str, int]
    hospital_load_breakdown: List[Dict[str, Any]]
    notification_type_breakdown: Dict[str, int]


class RegisteredContactAlertRequest(BaseModel):
    emergency_id: int
    contact_name: str = Field(..., min_length=2, max_length=150)
    relationship: str = Field(default="Emergency Contact", max_length=100)
    phone_or_channel: str = Field(..., min_length=3, max_length=100)
    custom_message: Optional[str] = None


class HospitalAlertRequest(BaseModel):
    emergency_id: int
    hospital_id: int
    triage_notes: Optional[str] = None
    eta_minutes: Optional[float] = None
    notify_registered_contacts: bool = True


class SimulationScenarioRequest(BaseModel):
    scenario_type: str = Field(
        default="HIGH_IMPACT_HIGHWAY_CRASH",
        description="HIGH_IMPACT_HIGHWAY_CRASH, URBAN_INTERSECTION_COLLISION, COMMERCIAL_VEHICLE_ROLLOVER, NORMAL_DRIVING_CONTROL"
    )
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    auto_validate: bool = True
    auto_dispatch: bool = True
    auto_assign_hospital: bool = True
    auto_calculate_route: bool = True
    auto_notify_contacts: bool = True
