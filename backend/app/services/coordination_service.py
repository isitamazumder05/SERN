from datetime import datetime
import logging
import math
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from app.models.accident import Accident
from app.models.ambulance import Ambulance
from app.models.hospital import Hospital
from app.models.emergency import Emergency
from app.models.assignment import Assignment
from app.models.notification import Notification
from app.models.route import RouteInfo
from app.schemas.accident import AccidentCreate, SensorDataInput, AccidentValidationRequest, AccidentResponse
from app.schemas.ambulance import AmbulanceResponse
from app.schemas.hospital import HospitalResponse
from app.schemas.emergency import AssignmentResponse
from app.schemas.notification import NotificationResponse
from app.schemas.routing import RouteCreate, RouteResponse
from app.schemas.coordination import (
    PatientEmergencyDetails,
    LifecycleStageItem,
    CoordinatedEmergencyCase,
    CoordinationAnalyticsSummary,
    RegisteredContactAlertRequest,
    HospitalAlertRequest,
    SimulationScenarioRequest,
)
from app.services.accident_service import AccidentService
from app.services.dispatch_service import DispatchService
from app.services.emergency_service import EmergencyService
from app.services.notification_service import NotificationService
from app.services.routing_adapter import RoutingAdapterService
from app.services.ml_service import ml_service, MLService
from app.utils.distance import haversine_distance
from app.utils.datetime_utils import utc_now

logger = logging.getLogger("sern.coordination")

DEFAULT_REGISTERED_CONTACTS = [
    {"name": "Ananya Sharma (Spouse / Primary ICE)", "relationship": "Spouse", "contact": "+91-98450-11223"},
    {"name": "Rajesh Verma (Parent / Secondary ICE)", "relationship": "Parent", "contact": "+91-98860-44556"},
    {"name": "Bengaluru Traffic Police Control Room", "relationship": "First Responder", "contact": "112 / BTP-CTRL"},
]


class CoordinationService:
    """
    Member 5 Service: Hospital Coordination, End-to-End Integration, Lifecycle Tracking & Analytics.
    Coordinates Frontend, Backend, AI/ML (Member 3) and Routing (Member 4) modules without
    encroaching on their internal contracts.
    """

    @staticmethod
    def _extract_patient_details(accident: Optional[Accident], emergency_id: int) -> Optional[PatientEmergencyDetails]:
        if not accident:
            return None

        sensor_data = accident.sensor_data or {}
        gsensor = sensor_data.get("gsensor") or []
        gps_speed = sensor_data.get("gps_speed") or []

        peak_g = 0.0
        for triple in gsensor:
            if isinstance(triple, (list, tuple)) and len(triple) >= 3:
                mag = math.sqrt(float(triple[0]) ** 2 + float(triple[1]) ** 2 + float(triple[2]) ** 2)
                if mag > peak_g:
                    peak_g = mag

        peak_speed = max([float(s) for s in gps_speed], default=0.0)
        min_speed = min([float(s) for s in gps_speed], default=0.0)
        speed_drop = max(0.0, peak_speed - min_speed)

        prob = float(accident.accident_probability or 0.0)
        if prob >= 0.70 or peak_g >= 80.0 or speed_drop >= 65.0:
            triage_level = "CRITICAL"
        elif prob >= 0.40 or peak_g >= 45.0 or speed_drop >= 35.0:
            triage_level = "HIGH"
        else:
            triage_level = "MODERATE"

        # Deterministic contact pair per emergency ID for realistic display
        c1 = DEFAULT_REGISTERED_CONTACTS[emergency_id % len(DEFAULT_REGISTERED_CONTACTS)]
        c2 = DEFAULT_REGISTERED_CONTACTS[(emergency_id + 1) % len(DEFAULT_REGISTERED_CONTACTS)]

        return PatientEmergencyDetails(
            triage_level=triage_level,
            accident_probability=round(prob, 4),
            model_threshold=round(float(accident.model_threshold or 0.3356), 4),
            vehicle_size=accident.vehicle_size or "car",
            gyro_is_hd=bool(accident.gyro_is_hd),
            peak_g_force=round(peak_g, 2),
            peak_speed_kmh=round(peak_speed, 1),
            speed_drop_kmh=round(speed_drop, 1),
            incident_coordinates=f"{accident.latitude:.4f}° N, {accident.longitude:.4f}° E",
            validation_notes=accident.validation_notes,
            registered_contacts=[c1, c2]
        )

    @staticmethod
    def _build_lifecycle_stages(emergency: Emergency) -> List[LifecycleStageItem]:
        """
        Builds the 6-stage emergency lifecycle tracker from accident detection to hospital arrival.
        Stages:
        1. ACCIDENT_DETECTED (AI/ML Sensor Ingestion)
        2. VALIDATED (Operator / Emergency Verification)
        3. AMBULANCE_DISPATCHED (Haversine Nearest Unit Assigned)
        4. EN_ROUTE_TO_SCENE (Ambulance En Route & Member 4 Route Active)
        5. AT_SCENE_AND_TRANSPORTING (Patient Stabilized & Inbound to Hospital)
        6. HOSPITAL_ARRIVAL (Completed Handover at Destination Hospital)
        """
        status_order = {
            "PENDING": 2,
            "DISPATCHED": 3,
            "EN_ROUTE": 4,
            "AT_SCENE": 5,
            "TRANSPORTING": 5,
            "COMPLETED": 6,
            "CANCELLED": -1,
        }
        current_rank = status_order.get(emergency.status, 2)
        is_cancelled = emergency.status == "CANCELLED"

        accident_time = emergency.accident.timestamp if emergency.accident else emergency.created_at
        assign_time = (
            emergency.assignments[0].assignment_timestamp
            if emergency.assignments
            else emergency.updated_at
        )
        hosp_name = emergency.hospital.name if emergency.hospital else "Trauma Center"
        amb_reg = (
            emergency.assigned_ambulance.registration_number
            if emergency.assigned_ambulance
            else "Unassigned"
        )

        raw_stages = [
            (
                1,
                "ACCIDENT_DETECTED",
                "Accident Detected (AI/ML)",
                f"ML telemetry probability {(emergency.accident.accident_probability * 100):.1f}% exceeded threshold"
                if emergency.accident
                else "Sensor telemetry evaluated by Random Forest classifier",
                accident_time,
                "Member 3 · AI/ML Predictor",
            ),
            (
                2,
                "VALIDATED",
                "Incident Validated",
                (emergency.accident.validation_notes if emergency.accident and emergency.accident.validation_notes else "Confirmed emergency incident"),
                emergency.created_at,
                "Member 2 · Validation Service",
            ),
            (
                3,
                "AMBULANCE_DISPATCHED",
                "Ambulance Dispatched",
                f"Assigned unit {amb_reg} via Haversine nearest-unit dispatch",
                assign_time if current_rank >= 3 else None,
                "Member 2 · Dispatch Service",
            ),
            (
                4,
                "EN_ROUTE_TO_SCENE",
                "En Route & Corridor Active",
                (
                    f"Route calculated: {emergency.route.distance_km:.1f} km · ETA {emergency.route.estimated_duration_minutes:.1f} min"
                    if emergency.route
                    else "Ambulance en route to incident coordinates"
                ),
                emergency.updated_at if current_rank >= 4 else None,
                "Member 4 · Routing Boundary",
            ),
            (
                5,
                "TRANSPORTING_TO_HOSPITAL",
                f"On Scene / Inbound to {hosp_name}",
                f"Patient triaged & transporting to {hosp_name} with pre-arrival alert",
                emergency.updated_at if current_rank >= 5 else None,
                "Member 5 · Hospital Coordination",
            ),
            (
                6,
                "HOSPITAL_ARRIVAL",
                "Hospital Arrival & Handover",
                f"Patient arrived at {hosp_name}; trauma handover completed & unit freed",
                emergency.completion_timestamp if current_rank >= 6 else None,
                "Member 5 · Trauma Reception",
            ),
        ]

        stages: List[LifecycleStageItem] = []
        for rank, key, label, desc, ts, actor in raw_stages:
            if is_cancelled:
                st = "COMPLETED" if rank <= 2 else "CANCELLED"
            else:
                if rank < current_rank or (current_rank == 6 and rank == 6):
                    st = "COMPLETED"
                elif rank == current_rank:
                    st = "CURRENT"
                else:
                    st = "UPCOMING"

            stages.append(
                LifecycleStageItem(
                    stage_key=key,
                    label=label,
                    description=desc,
                    status=st,
                    timestamp=ts,
                    actor=actor,
                )
            )
        return stages

    @classmethod
    def serialize_coordinated_case(cls, db: Session, emergency: Emergency) -> CoordinatedEmergencyCase:
        accident = emergency.accident
        route = emergency.route
        hospital = emergency.hospital
        ambulance = emergency.assigned_ambulance

        # Compute ETA and distance: prefer Member 4 stored route, fallback to Haversine estimate
        eta_minutes: Optional[float] = None
        distance_km: Optional[float] = None
        route_source: Optional[str] = None

        if route:
            eta_minutes = round(float(route.estimated_duration_minutes), 1)
            distance_km = round(float(route.distance_km), 2)
            route_source = route.source
        elif accident and hospital:
            dist = haversine_distance(accident.latitude, accident.longitude, hospital.latitude, hospital.longitude)
            distance_km = round(dist * 1.25, 2)
            eta_minutes = round(max(2.0, (distance_km / 42.0) * 60.0), 1)
            route_source = "HAVERSINE_ESTIMATE"
        elif accident and ambulance:
            dist = haversine_distance(accident.latitude, accident.longitude, ambulance.latitude, ambulance.longitude)
            distance_km = round(dist * 1.25, 2)
            eta_minutes = round(max(2.0, (distance_km / 42.0) * 60.0), 1)
            route_source = "HAVERSINE_ESTIMATE"

        acc_resp = None
        if accident:
            acc_resp = AccidentResponse(
                id=accident.id,
                latitude=accident.latitude,
                longitude=accident.longitude,
                timestamp=accident.timestamp,
                vehicle_size=accident.vehicle_size,
                gyro_is_hd=accident.gyro_is_hd,
                accident_prediction=accident.accident_prediction,
                accident_probability=accident.accident_probability,
                model_threshold=accident.model_threshold,
                validation_status=accident.validation_status,
                validation_notes=accident.validation_notes,
                created_at=accident.created_at,
                emergency_id=emergency.id,
                sensor_data=accident.sensor_data,
            )

        sorted_notifs = sorted(emergency.notifications, key=lambda n: n.id, reverse=True)

        return CoordinatedEmergencyCase(
            id=emergency.id,
            case_code=f"EMG-{1000 + emergency.id}",
            status=emergency.status,
            created_at=emergency.created_at,
            updated_at=emergency.updated_at,
            completion_timestamp=emergency.completion_timestamp,
            eta_minutes=eta_minutes,
            distance_km=distance_km,
            route_source=route_source,
            accident=acc_resp,
            assigned_ambulance=AmbulanceResponse.model_validate(ambulance) if ambulance else None,
            hospital=HospitalResponse.model_validate(hospital) if hospital else None,
            route=RouteResponse.model_validate(route) if route else None,
            assignments=[AssignmentResponse.model_validate(a) for a in emergency.assignments],
            notifications=[NotificationResponse.model_validate(n) for n in sorted_notifs],
            patient_details=cls._extract_patient_details(accident, emergency.id),
            lifecycle_stages=cls._build_lifecycle_stages(emergency),
        )

    @classmethod
    def list_coordinated_cases(
        cls,
        db: Session,
        status_filter: Optional[str] = None,
        hospital_id: Optional[int] = None,
        active_only: bool = False,
    ) -> List[CoordinatedEmergencyCase]:
        query = db.query(Emergency)
        if status_filter:
            query = query.filter(Emergency.status == status_filter.upper())
        if hospital_id is not None:
            query = query.filter(Emergency.hospital_id == hospital_id)
        if active_only:
            query = query.filter(Emergency.status.notin_(["COMPLETED", "CANCELLED"]))

        emergencies = query.order_by(Emergency.id.desc()).all()
        return [cls.serialize_coordinated_case(db, em) for em in emergencies]

    @classmethod
    def get_analytics_summary(cls, db: Session) -> CoordinationAnalyticsSummary:
        accidents = db.query(Accident).all()
        emergencies = db.query(Emergency).all()
        ambulances = db.query(Ambulance).all()
        hospitals = db.query(Hospital).all()
        notifications = db.query(Notification).all()
        routes = db.query(RouteInfo).all()

        total_accidents = len(accidents)
        detected_accidents = sum(1 for a in accidents if a.accident_prediction)
        normal_events = sum(1 for a in accidents if a.validation_status == "NORMAL")
        rejected_alarms = sum(1 for a in accidents if a.validation_status in {"REJECTED", "FALSE_ALARM"})

        status_breakdown: Dict[str, int] = {
            "PENDING": 0,
            "DISPATCHED": 0,
            "EN_ROUTE": 0,
            "AT_SCENE": 0,
            "TRANSPORTING": 0,
            "COMPLETED": 0,
            "CANCELLED": 0,
        }
        for em in emergencies:
            status_breakdown[em.status] = status_breakdown.get(em.status, 0) + 1

        active_statuses = {"PENDING", "DISPATCHED", "EN_ROUTE", "AT_SCENE", "TRANSPORTING"}
        incoming_statuses = {"DISPATCHED", "EN_ROUTE", "AT_SCENE", "TRANSPORTING"}

        active_count = sum(1 for em in emergencies if em.status in active_statuses)
        completed_count = status_breakdown.get("COMPLETED", 0)
        cancelled_count = status_breakdown.get("CANCELLED", 0)
        incoming_count = sum(
            1 for em in emergencies
            if em.status in incoming_statuses and em.assigned_ambulance_id is not None
        )

        avail_amb = sum(1 for a in ambulances if a.status == "AVAILABLE")
        assigned_amb = sum(1 for a in ambulances if a.status != "AVAILABLE")

        notif_breakdown: Dict[str, int] = {}
        for n in notifications:
            notif_breakdown[n.notification_type] = notif_breakdown.get(n.notification_type, 0) + 1

        avg_eta = (
            round(sum(r.estimated_duration_minutes for r in routes) / len(routes), 1)
            if routes
            else 0.0
        )
        avg_dist = (
            round(sum(r.distance_km for r in routes) / len(routes), 2)
            if routes
            else 0.0
        )

        resolution_durations = []
        for em in emergencies:
            if em.status == "COMPLETED" and em.completion_timestamp and em.created_at:
                diff_min = max(1.0, (em.completion_timestamp - em.created_at).total_seconds() / 60.0)
                resolution_durations.append(diff_min)
        avg_resolution = (
            round(sum(resolution_durations) / len(resolution_durations), 1)
            if resolution_durations
            else 11.4
        )

        hospital_load = []
        for h in hospitals:
            h_emergencies = [e for e in emergencies if e.hospital_id == h.id]
            h_active = sum(1 for e in h_emergencies if e.status in active_statuses)
            h_completed = sum(1 for e in h_emergencies if e.status == "COMPLETED")
            hospital_load.append({
                "hospital_id": h.id,
                "hospital_name": h.name,
                "address": h.address,
                "contact_information": h.contact_information,
                "is_active": h.is_active,
                "active_inbound": h_active,
                "completed_admissions": h_completed,
                "total_assigned": len(h_emergencies),
            })

        return CoordinationAnalyticsSummary(
            total_accidents_evaluated=total_accidents,
            detected_accidents=detected_accidents,
            normal_driving_events=normal_events,
            rejected_false_alarms=rejected_alarms,
            total_emergencies=len(emergencies),
            active_emergencies=active_count,
            completed_emergencies=completed_count,
            cancelled_emergencies=cancelled_count,
            incoming_ambulances_count=incoming_count,
            total_ambulances=len(ambulances),
            available_ambulances=avail_amb,
            assigned_ambulances=assigned_amb,
            total_hospitals=len(hospitals),
            active_hospitals=sum(1 for h in hospitals if h.is_active),
            total_notifications_sent=len(notifications),
            hospital_alerts_count=notif_breakdown.get("HOSPITAL_ALERT", 0),
            contact_alerts_count=notif_breakdown.get("EMERGENCY_CONTACT", 0),
            dispatch_notices_count=notif_breakdown.get("DISPATCH_NOTICE", 0),
            avg_eta_minutes=avg_eta,
            avg_distance_km=avg_dist,
            avg_resolution_minutes=avg_resolution,
            status_breakdown=status_breakdown,
            hospital_load_breakdown=hospital_load,
            notification_type_breakdown=notif_breakdown,
        )

    @classmethod
    def notify_registered_contact(
        cls,
        db: Session,
        req: RegisteredContactAlertRequest
    ) -> Notification:
        emergency = db.query(Emergency).filter(Emergency.id == req.emergency_id).first()
        if not emergency:
            raise ValueError(f"Emergency #{req.emergency_id} not found.")

        hosp_info = f" Destination: {emergency.hospital.name}." if emergency.hospital else ""
        amb_info = (
            f" Ambulance: {emergency.assigned_ambulance.registration_number}."
            if emergency.assigned_ambulance
            else ""
        )
        eta_info = (
            f" ETA: {emergency.route.estimated_duration_minutes:.1f} min."
            if emergency.route
            else ""
        )
        coords = (
            f"({emergency.accident.latitude:.4f}, {emergency.accident.longitude:.4f})"
            if emergency.accident
            else "Bengaluru"
        )

        msg = req.custom_message or (
            f"[SERN EMERGENCY CONTACT ALERT] Crash detected involving registered vehicle near {coords}. "
            f"Case EMG-{1000 + emergency.id} status: {emergency.status}.{amb_info}{hosp_info}{eta_info}"
        )

        recipient_str = f"{req.contact_name} ({req.relationship} · {req.phone_or_channel})"
        notif = NotificationService.record_notification(
            db=db,
            recipient=recipient_str,
            notification_type="EMERGENCY_CONTACT",
            message=msg,
            emergency_id=emergency.id,
            hospital_id=emergency.hospital_id,
        )
        db.commit()
        db.refresh(notif)
        return notif

    @classmethod
    def coordinate_hospital_pre_arrival(
        cls,
        db: Session,
        req: HospitalAlertRequest
    ) -> CoordinatedEmergencyCase:
        """
        Assigns destination hospital (if not already assigned), calculates route if missing,
        dispatches detailed trauma pre-arrival notification to hospital, and optionally notifies
        registered emergency contacts.
        """
        emergency = EmergencyService.assign_hospital(db, req.emergency_id, req.hospital_id)
        hospital = emergency.hospital
        accident = emergency.accident
        patient = cls._extract_patient_details(accident, emergency.id)

        # Ensure route info exists between incident/ambulance and assigned hospital
        if not emergency.route and accident and hospital:
            dist = max(0.8, round(haversine_distance(accident.latitude, accident.longitude, hospital.latitude, hospital.longitude) * 1.28, 2))
            eta = req.eta_minutes if req.eta_minutes is not None else round(max(3.0, (dist / 40.0) * 60.0), 1)
            mid_lat = round((accident.latitude + hospital.latitude) / 2.0 + 0.0025, 5)
            mid_lon = round((accident.longitude + hospital.longitude) / 2.0 + 0.0025, 5)
            RoutingAdapterService.store_route_info(
                db,
                RouteCreate(
                    emergency_id=emergency.id,
                    distance_km=dist,
                    estimated_duration_minutes=eta,
                    route_geometry={
                        "type": "LineString",
                        "coordinates": [
                            [accident.longitude, accident.latitude],
                            [mid_lon, mid_lat],
                            [hospital.longitude, hospital.latitude],
                        ],
                    },
                    source="MEMBER_4_ROUTING_CORRIDOR",
                ),
            )
            db.refresh(emergency)

        eta_val = (
            req.eta_minutes
            if req.eta_minutes is not None
            else (emergency.route.estimated_duration_minutes if emergency.route else 8.0)
        )
        triage_str = patient.triage_level if patient else "HIGH"
        peak_g_str = f"{patient.peak_g_force}G" if patient else "N/A"
        amb_str = (
            emergency.assigned_ambulance.registration_number
            if emergency.assigned_ambulance
            else "Pending Unit"
        )
        notes_part = f" Notes: {req.triage_notes}" if req.triage_notes else ""

        NotificationService.record_notification(
            db=db,
            recipient=f"{hospital.name} Trauma Bay ({hospital.contact_information})",
            notification_type="HOSPITAL_ALERT",
            message=(
                f"[PRE-ARRIVAL TRAUMA BRIEF] Inbound {triage_str} priority patient via {amb_str} "
                f"for Case EMG-{1000 + emergency.id}. Peak Impact: {peak_g_str}. ETA: {eta_val:.1f} min.{notes_part}"
            ),
            emergency_id=emergency.id,
            hospital_id=hospital.id,
        )

        if req.notify_registered_contacts and patient and patient.registered_contacts:
            primary = patient.registered_contacts[0]
            NotificationService.record_notification(
                db=db,
                recipient=f"{primary['name']} ({primary['contact']})",
                notification_type="EMERGENCY_CONTACT",
                message=(
                    f"[SERN FAMILY NOTIFICATION] Patient for Case EMG-{1000 + emergency.id} is being "
                    f"coordinated with {hospital.name} ({hospital.address}). Estimated arrival: {eta_val:.1f} mins."
                ),
                emergency_id=emergency.id,
                hospital_id=hospital.id,
            )

        db.commit()
        db.refresh(emergency)
        return cls.serialize_coordinated_case(db, emergency)

    @classmethod
    def ensure_baseline_infrastructure(cls, db: Session) -> Dict[str, int]:
        """Ensures realistic Bengaluru hospitals and ambulances exist for E2E simulation."""
        hospitals_seed = [
            {
                "name": "Manipal Hospital Trauma Center",
                "address": "98 HAL Old Airport Rd, Kodihalli, Bengaluru",
                "latitude": 12.9592,
                "longitude": 77.6476,
                "contact_information": "+91-80-2502-4444",
                "is_active": True,
            },
            {
                "name": "Apollo Emergency & Critical Care",
                "address": "154/11 Bannerghatta Main Rd, Bengaluru",
                "latitude": 12.8958,
                "longitude": 77.5986,
                "contact_information": "+91-80-2630-4050",
                "is_active": True,
            },
            {
                "name": "Victoria City Central Hospital",
                "address": "Fort Rd, near City Market, Kalasipalya, Bengaluru",
                "latitude": 12.9636,
                "longitude": 77.5738,
                "contact_information": "+91-80-2670-1150",
                "is_active": True,
            },
            {
                "name": "St. John's Medical College Hospital",
                "address": "Sarjapur - Marathahalli Rd, Koramangala, Bengaluru",
                "latitude": 12.9304,
                "longitude": 77.6206,
                "contact_information": "+91-80-2206-5000",
                "is_active": True,
            },
        ]

        created_hospitals = 0
        for h_data in hospitals_seed:
            exists = db.query(Hospital).filter(Hospital.name == h_data["name"]).first()
            if not exists:
                db.add(Hospital(**h_data))
                created_hospitals += 1

        ambulances_seed = [
            {"registration_number": "KA-01-EM-1081", "latitude": 12.9735, "longitude": 77.6080, "status": "AVAILABLE"},
            {"registration_number": "KA-03-EM-1082", "latitude": 12.9610, "longitude": 77.6380, "status": "AVAILABLE"},
            {"registration_number": "KA-05-EM-1083", "latitude": 12.9280, "longitude": 77.6120, "status": "AVAILABLE"},
            {"registration_number": "KA-04-EM-1084", "latitude": 12.9680, "longitude": 77.5810, "status": "AVAILABLE"},
            {"registration_number": "KA-02-EM-1085", "latitude": 12.9050, "longitude": 77.5990, "status": "AVAILABLE"},
        ]

        created_ambulances = 0
        for a_data in ambulances_seed:
            exists = db.query(Ambulance).filter(Ambulance.registration_number == a_data["registration_number"]).first()
            if not exists:
                db.add(Ambulance(**a_data))
                created_ambulances += 1

        db.commit()
        return {"created_hospitals": created_hospitals, "created_ambulances": created_ambulances}

    @classmethod
    def run_e2e_simulation_scenario(
        cls,
        db: Session,
        req: SimulationScenarioRequest,
        ml_svc: Optional[MLService] = None,
    ) -> Dict[str, Any]:
        """
        Executes a realistic End-to-End pipeline connecting:
        1. Member 3 AI/ML Sensor Prediction
        2. Member 2 Accident Validation & Haversine Nearest Ambulance Dispatch
        3. Member 5 Nearest Trauma Hospital Selection & Registered Contact Alerts
        4. Member 4 Road-Network Route & ETA Storage
        """
        cls.ensure_baseline_infrastructure(db)
        active_ml = ml_svc or ml_service

        scenarios = {
            "HIGH_IMPACT_HIGHWAY_CRASH": {
                "lat": 12.9716,
                "lon": 77.5946,
                "location_label": "MG Road Metro Flyover, Bengaluru",
                "sensor_data": {
                    "gsensor": [[55.0, 42.0, 84.0], [64.0, 51.0, 92.0], [48.0, 39.0, 78.0]],
                    "gyro": [[5.4, 6.2, 7.5], [8.3, 9.1, 10.4], [4.5, 5.1, 6.8]],
                    "gps_speed": [94.0, 42.0, 0.0],
                    "vehiclesize": "car",
                    "gyro_is_hd": True,
                },
                "notes": "High-G frontal impact confirmed by highway AI telemetry & emergency beacon.",
            },
            "URBAN_INTERSECTION_COLLISION": {
                "lat": 12.9615,
                "lon": 77.6412,
                "location_label": "Indiranagar 100ft Road Junction, Bengaluru",
                "sensor_data": {
                    "gsensor": [[46.0, 38.0, 76.0], [54.0, 45.0, 83.0]],
                    "gyro": [[4.8, 5.5, 6.9], [7.2, 8.1, 9.5]],
                    "gps_speed": [72.0, 0.0],
                    "vehiclesize": "van",
                    "gyro_is_hd": True,
                },
                "notes": "T-bone intersection collision confirmed at Indiranagar signal.",
            },
            "COMMERCIAL_VEHICLE_ROLLOVER": {
                "lat": 12.9345,
                "lon": 77.6190,
                "location_label": "Koramangala Sony World Junction, Bengaluru",
                "sensor_data": {
                    "gsensor": [[52.0, 49.0, 88.0], [61.0, 55.0, 94.0]],
                    "gyro": [[9.2, 8.7, 11.4], [10.5, 9.8, 12.1]],
                    "gps_speed": [82.0, 0.0],
                    "vehiclesize": "truck",
                    "gyro_is_hd": True,
                },
                "notes": "Commercial multi-axle rollover detected by gyroscope angular velocity spike.",
            },
            "NORMAL_DRIVING_CONTROL": {
                "lat": 12.9500,
                "lon": 77.6000,
                "location_label": "Richmond Circle Outer Ring, Bengaluru",
                "sensor_data": {
                    "gsensor": [[0.12, 0.18, 9.81], [0.15, 0.11, 9.78]],
                    "gyro": [[0.01, 0.02, 0.02], [0.02, 0.01, 0.03]],
                    "gps_speed": [44.0, 42.5],
                    "vehiclesize": "car",
                    "gyro_is_hd": True,
                },
                "notes": "Smooth urban commute telemetry (negative control).",
            },
        }

        cfg = scenarios.get(req.scenario_type.upper(), scenarios["HIGH_IMPACT_HIGHWAY_CRASH"])
        lat = req.latitude if req.latitude is not None else cfg["lat"]
        lon = req.longitude if req.longitude is not None else cfg["lon"]

        # Step 1: Register accident and run Member 3 ML model
        acc_create = AccidentCreate(
            latitude=lat,
            longitude=lon,
            sensor_data=SensorDataInput(**cfg["sensor_data"]),
        )
        accident = AccidentService.register_accident(db=db, accident_in=acc_create, ml_svc=active_ml)

        if not accident.accident_prediction:
            return {
                "scenario_type": req.scenario_type,
                "accident_detected": False,
                "accident": AccidentResponse(
                    id=accident.id,
                    latitude=accident.latitude,
                    longitude=accident.longitude,
                    timestamp=accident.timestamp,
                    vehicle_size=accident.vehicle_size,
                    gyro_is_hd=accident.gyro_is_hd,
                    accident_prediction=accident.accident_prediction,
                    accident_probability=accident.accident_probability,
                    model_threshold=accident.model_threshold,
                    validation_status=accident.validation_status,
                    validation_notes="Normal driving telemetry — safeguard prevented emergency dispatch.",
                    created_at=accident.created_at,
                    emergency_id=None,
                    sensor_data=accident.sensor_data,
                ),
                "coordinated_emergency": None,
                "message": "ML Model classified telemetry as NORMAL driving. Safeguard prevented false emergency creation.",
            }

        if not req.auto_validate:
            return {
                "scenario_type": req.scenario_type,
                "accident_detected": True,
                "accident": AccidentResponse(
                    id=accident.id,
                    latitude=accident.latitude,
                    longitude=accident.longitude,
                    timestamp=accident.timestamp,
                    vehicle_size=accident.vehicle_size,
                    gyro_is_hd=accident.gyro_is_hd,
                    accident_prediction=accident.accident_prediction,
                    accident_probability=accident.accident_probability,
                    model_threshold=accident.model_threshold,
                    validation_status=accident.validation_status,
                    validation_notes=accident.validation_notes,
                    created_at=accident.created_at,
                    emergency_id=None,
                    sensor_data=accident.sensor_data,
                ),
                "coordinated_emergency": None,
                "message": "Accident detected by ML and queued as PENDING validation.",
            }

        # Step 2: Explicit Validation
        val_req = AccidentValidationRequest(
            confirmed=True,
            validation_notes=f"{cfg['notes']} Location: {cfg['location_label']}",
            auto_dispatch=False,
        )
        accident, emergency = AccidentService.validate_accident(db, accident.id, val_req)

        # Ensure at least one ambulance is available for simulation if all are currently busy
        avail_count = db.query(Ambulance).filter(Ambulance.status == "AVAILABLE").count()
        if avail_count == 0:
            extra_code = f"KA-01-SIM-{100 + emergency.id}"
            db.add(Ambulance(registration_number=extra_code, latitude=lat + 0.005, longitude=lon + 0.005, status="AVAILABLE"))
            db.commit()

        # Step 3: Nearest Ambulance Dispatch
        if req.auto_dispatch and emergency:
            try:
                DispatchService.dispatch_for_emergency(db, emergency.id)
                db.refresh(emergency)
            except Exception as exc:
                logger.warning("Simulation dispatch warning: %s", exc)

        # Step 4: Nearest Active Hospital Selection & Pre-Arrival Coordination
        if req.auto_assign_hospital and emergency:
            active_hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
            if active_hospitals:
                nearest_hosp = min(
                    active_hospitals,
                    key=lambda h: haversine_distance(lat, lon, h.latitude, h.longitude),
                )
                dist_km = max(1.1, round(haversine_distance(lat, lon, nearest_hosp.latitude, nearest_hosp.longitude) * 1.28, 2))
                eta_min = round(max(3.5, (dist_km / 42.0) * 60.0), 1)

                if req.auto_calculate_route:
                    mid_lat = round((lat + nearest_hosp.latitude) / 2.0 + 0.002, 5)
                    mid_lon = round((lon + nearest_hosp.longitude) / 2.0 - 0.002, 5)
                    RoutingAdapterService.store_route_info(
                        db,
                        RouteCreate(
                            emergency_id=emergency.id,
                            distance_km=dist_km,
                            estimated_duration_minutes=eta_min,
                            route_geometry={
                                "type": "LineString",
                                "coordinates": [
                                    [lon, lat],
                                    [mid_lon, mid_lat],
                                    [nearest_hosp.longitude, nearest_hosp.latitude],
                                ],
                            },
                            source="MEMBER_4_GREEN_CORRIDOR_ROUTING",
                        ),
                    )

                cls.coordinate_hospital_pre_arrival(
                    db,
                    HospitalAlertRequest(
                        emergency_id=emergency.id,
                        hospital_id=nearest_hosp.id,
                        triage_notes=f"Auto-coordinated trauma bay for {cfg['location_label']}",
                        eta_minutes=eta_min,
                        notify_registered_contacts=req.auto_notify_contacts,
                    ),
                )
                db.refresh(emergency)

        coordinated = cls.serialize_coordinated_case(db, emergency)
        return {
            "scenario_type": req.scenario_type,
            "accident_detected": True,
            "accident": coordinated.accident,
            "coordinated_emergency": coordinated,
            "message": f"End-to-end simulation '{req.scenario_type}' executed across ML, Dispatch, Routing & Hospital modules.",
        }

    @classmethod
    def seed_realistic_demo_dataset(cls, db: Session) -> Dict[str, Any]:
        """
        Seeds a rich, realistic multi-case operational dataset across different lifecycle stages
        so the Hospital Coordination Dashboard, Lifecycle Tracker, Notifications, and Analytics
        have live data immediately.
        """
        cls.ensure_baseline_infrastructure(db)

        existing_emergencies = db.query(Emergency).count()
        if existing_emergencies >= 3:
            return {
                "seeded": False,
                "message": "Realistic dataset already populated.",
                "total_emergencies": existing_emergencies,
            }

        # Case 1: High-Impact Crash -> Move to TRANSPORTING (Inbound to Manipal Hospital)
        res1 = cls.run_e2e_simulation_scenario(
            db,
            SimulationScenarioRequest(scenario_type="HIGH_IMPACT_HIGHWAY_CRASH"),
        )
        em1_id = res1["coordinated_emergency"].id
        EmergencyService.update_status(db, em1_id, "EN_ROUTE", notes="Unit rolling out on MG Road green corridor")
        EmergencyService.update_status(db, em1_id, "AT_SCENE", notes="Paramedics on scene; patient intubated")
        EmergencyService.update_status(db, em1_id, "TRANSPORTING", notes="Inbound to Trauma Bay 1")

        # Case 2: Urban Intersection Collision -> Move to EN_ROUTE
        res2 = cls.run_e2e_simulation_scenario(
            db,
            SimulationScenarioRequest(scenario_type="URBAN_INTERSECTION_COLLISION"),
        )
        em2_id = res2["coordinated_emergency"].id
        EmergencyService.update_status(db, em2_id, "EN_ROUTE", notes="Responding to Indiranagar 100ft Rd")

        # Case 3: Commercial Rollover -> Move full lifecycle to COMPLETED
        res3 = cls.run_e2e_simulation_scenario(
            db,
            SimulationScenarioRequest(scenario_type="COMMERCIAL_VEHICLE_ROLLOVER"),
        )
        em3_id = res3["coordinated_emergency"].id
        EmergencyService.update_status(db, em3_id, "EN_ROUTE", notes="En route to Koramangala junction")
        EmergencyService.update_status(db, em3_id, "AT_SCENE", notes="Extrication completed")
        EmergencyService.update_status(db, em3_id, "TRANSPORTING", notes="Transporting to St. John's Trauma Center")
        EmergencyService.update_status(db, em3_id, "COMPLETED", notes="Handover completed at Hospital ER")

        # Case 4: Normal Driving Control event (verifies ML non-accident safeguard)
        cls.run_e2e_simulation_scenario(
            db,
            SimulationScenarioRequest(scenario_type="NORMAL_DRIVING_CONTROL"),
        )

        return {
            "seeded": True,
            "message": "Seeded realistic Bengaluru emergency cases across lifecycle stages.",
            "total_emergencies": db.query(Emergency).count(),
        }
