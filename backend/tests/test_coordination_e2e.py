def test_e2e_hospital_coordination_full_lifecycle(client):
    """
    Member 5 End-to-End Integration Test:
    Verifies full lifecycle from AI/ML sensor detection -> explicit validation ->
    nearest ambulance dispatch -> Member 4 route/ETA -> hospital pre-arrival coordination ->
    registered contact notification -> lifecycle progression to HOSPITAL_ARRIVAL (COMPLETED).
    """
    # 1. Trigger realistic E2E simulation for a high-impact highway crash
    sim_resp = client.post(
        "/api/coordination/simulate",
        json={
            "scenario_type": "HIGH_IMPACT_HIGHWAY_CRASH",
            "auto_validate": True,
            "auto_dispatch": True,
            "auto_assign_hospital": True,
            "auto_calculate_route": True,
            "auto_notify_contacts": True,
        },
    )
    assert sim_resp.status_code == 201
    sim_data = sim_resp.json()
    assert sim_data["accident_detected"] is True
    case = sim_data["coordinated_emergency"]
    assert case is not None
    em_id = case["id"]

    # Verify ML and Experimental Sensor Severity / Demo Placeholder Contacts details
    assert case["accident"]["accident_prediction"] is True
    assert case["patient_details"]["triage_level"] in {"CRITICAL", "HIGH"}
    assert case["patient_details"]["severity_classification_type"] == "EXPERIMENTAL_SENSOR_INDICATOR"
    assert "not clinically validated medical triage" in case["patient_details"]["severity_disclaimer"].lower()
    assert case["patient_details"]["peak_g_force"] > 50.0
    assert case["patient_details"]["speed_drop_kmh"] >= 50.0
    assert case["patient_details"]["contacts_are_demo_placeholders"] is True
    assert len(case["patient_details"]["registered_contacts"]) >= 2
    assert all(c["is_demo_placeholder"] is True for c in case["patient_details"]["registered_contacts"])

    # Verify Ambulance dispatched & Hospital assigned & Simulated Route ETA calculated
    assert case["status"] == "DISPATCHED"
    assert case["assigned_ambulance"] is not None
    assert case["hospital"] is not None
    assert case["eta_minutes"] is not None and case["eta_minutes"] > 0
    assert case["distance_km"] is not None and case["distance_km"] > 0
    assert case["is_route_simulated"] is True
    assert "simulated" in case["route_type_label"].lower()

    # Verify notifications generated (DISPATCH_NOTICE, HOSPITAL_ALERT, EMERGENCY_CONTACT) and labeled simulated
    notif_types = {n["notification_type"] for n in case["notifications"]}
    assert "DISPATCH_NOTICE" in notif_types
    assert "HOSPITAL_ALERT" in notif_types
    assert "EMERGENCY_CONTACT" in notif_types
    assert all(n["is_simulated"] is True for n in case["notifications"])
    assert all(n["delivery_status"] == "SIMULATED_DELIVERED" for n in case["notifications"])

    # 2. Progress lifecycle: DISPATCHED -> EN_ROUTE -> AT_SCENE -> TRANSPORTING -> COMPLETED
    for next_stage in ["EN_ROUTE", "AT_SCENE", "TRANSPORTING"]:
        patch_resp = client.patch(
            f"/api/emergencies/{em_id}/status",
            json={"status": next_stage, "notes": f"Transitioned to {next_stage}"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == next_stage

    # Verify lifecycle stages while TRANSPORTING
    coord_get = client.get(f"/api/coordination/emergencies/{em_id}")
    assert coord_get.status_code == 200
    stages = coord_get.json()["lifecycle_stages"]
    assert len(stages) == 6
    stage_map = {s["stage_key"]: s["status"] for s in stages}
    assert stage_map["ACCIDENT_DETECTED"] == "COMPLETED"
    assert stage_map["VALIDATED"] == "COMPLETED"
    assert stage_map["AMBULANCE_DISPATCHED"] == "COMPLETED"
    assert stage_map["EN_ROUTE_TO_SCENE"] == "COMPLETED"
    assert stage_map["TRANSPORTING_TO_HOSPITAL"] == "CURRENT"
    assert stage_map["HOSPITAL_ARRIVAL"] == "UPCOMING"

    # 3. Complete hospital arrival handover
    comp_resp = client.post(f"/api/emergencies/{em_id}/complete")
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "COMPLETED"

    # Verify all 6 lifecycle stages are now COMPLETED and have valid timestamps
    final_case = client.get(f"/api/coordination/emergencies/{em_id}").json()
    assert final_case["status"] == "COMPLETED"
    assert all(s["status"] == "COMPLETED" for s in final_case["lifecycle_stages"])
    assert all(s["timestamp"] is not None for s in final_case["lifecycle_stages"])
    stage_by_key = {s["stage_key"]: s for s in final_case["lifecycle_stages"]}
    assert stage_by_key["AMBULANCE_DISPATCHED"]["timestamp"] == final_case["assignments"][0]["assignment_timestamp"]
    assert stage_by_key["HOSPITAL_ARRIVAL"]["timestamp"] == final_case["completion_timestamp"]


def test_normal_driving_simulation_safeguard(client):
    """
    Verify that simulating normal driving telemetry through the real ML model
    classifies as NORMAL and does NOT trigger an emergency, dispatch, or hospital alert.
    """
    sim_resp = client.post(
        "/api/coordination/simulate",
        json={"scenario_type": "NORMAL_DRIVING_CONTROL"},
    )
    assert sim_resp.status_code == 201
    data = sim_resp.json()
    assert data["accident_detected"] is False
    assert data["accident"]["validation_status"] == "NORMAL"
    assert data["coordinated_emergency"] is None

    # Confirm zero emergencies exist
    emergencies = client.get("/api/emergencies").json()
    assert len(emergencies) == 0


def test_registered_contact_and_hospital_pre_arrival_notifications(client):
    """
    Verify Member 5 manual hospital alert and registered contact alert endpoints.
    """
    # Create an initial un-dispatched accident and validate
    sim_resp = client.post(
        "/api/coordination/simulate",
        json={
            "scenario_type": "URBAN_INTERSECTION_COLLISION",
            "auto_validate": True,
            "auto_dispatch": True,
            "auto_assign_hospital": False,
        },
    )
    assert sim_resp.status_code == 201
    em_id = sim_resp.json()["coordinated_emergency"]["id"]

    hospitals = client.get("/api/hospitals").json()
    assert len(hospitals) >= 1
    target_hosp = hospitals[0]

    # Trigger Hospital Pre-Arrival Alert
    hosp_alert_resp = client.post(
        "/api/coordination/hospital-alert",
        json={
            "emergency_id": em_id,
            "hospital_id": target_hosp["id"],
            "triage_notes": "Requesting Neuro-Trauma Team Standby at Bay 2",
            "eta_minutes": 6.5,
            "notify_registered_contacts": True,
        },
    )
    assert hosp_alert_resp.status_code == 200
    updated_case = hosp_alert_resp.json()
    assert updated_case["hospital"]["id"] == target_hosp["id"]
    assert updated_case["eta_minutes"] == 6.5

    # Trigger explicit Registered Contact notification
    contact_resp = client.post(
        "/api/coordination/notify-contact",
        json={
            "emergency_id": em_id,
            "contact_name": "Priya Nair",
            "relationship": "Sister",
            "phone_or_channel": "+91-99001-22334",
            "custom_message": "Patient en route to Manipal Hospital Trauma Center. ETA 6.5 mins.",
        },
    )
    assert contact_resp.status_code == 201
    c_notif = contact_resp.json()
    assert c_notif["notification_type"] == "EMERGENCY_CONTACT"
    assert "Priya Nair" in c_notif["recipient"]
    assert c_notif["delivery_status"] == "SIMULATED_DELIVERED"


def test_coordination_analytics_and_seed_demo(client):
    """
    Verify empty-state analytics (no hardcoded fallback numbers), explicit demo seeding,
    and simulated vs. actual Member 4 route distinction.
    """
    # 1. Verify empty state before any demo seeding (no hardcoded 11.4, 7.2, or 4.8 values)
    empty_analytics = client.get("/api/coordination/analytics").json()
    assert empty_analytics["total_emergencies"] == 0
    assert empty_analytics["avg_eta_minutes"] is None
    assert empty_analytics["avg_distance_km"] is None
    assert empty_analytics["avg_resolution_minutes"] is None
    assert empty_analytics["simulated_routes_count"] == 0
    assert empty_analytics["actual_member4_routes_count"] == 0

    # 2. Explicitly seed demo data via /api/coordination/seed-demo
    seed_resp = client.post("/api/coordination/seed-demo")
    assert seed_resp.status_code == 200
    seed_data = seed_resp.json()
    assert seed_data["seeded"] is True
    assert seed_data["total_emergencies"] >= 3

    # Verify idempotency of seed-demo
    seed_again = client.post("/api/coordination/seed-demo")
    assert seed_again.status_code == 200
    assert seed_again.json()["seeded"] is False

    # 3. Verify analytics endpoint after explicit seeding
    analytics_resp = client.get("/api/coordination/analytics")
    assert analytics_resp.status_code == 200
    summary = analytics_resp.json()
    assert summary["total_accidents_evaluated"] >= 4
    assert summary["detected_accidents"] >= 3
    assert summary["normal_driving_events"] >= 1
    assert summary["total_emergencies"] >= 3
    assert summary["active_emergencies"] >= 2
    assert summary["completed_emergencies"] >= 1
    assert summary["incoming_ambulances_count"] >= 2
    assert summary["total_notifications_sent"] >= 6
    assert summary["hospital_alerts_count"] >= 3
    assert summary["contact_alerts_count"] >= 3
    assert summary["avg_eta_minutes"] is not None and summary["avg_eta_minutes"] > 0
    assert summary["avg_distance_km"] is not None and summary["avg_distance_km"] > 0
    assert summary["avg_resolution_minutes"] is not None and summary["avg_resolution_minutes"] > 0
    assert summary["simulated_routes_count"] >= 3
    assert summary["actual_member4_routes_count"] == 0
    assert len(summary["hospital_load_breakdown"]) >= 4


def test_member4_routing_distinction_simulated_vs_actual(client):
    """
    Verify that simulated fallback routes and actual Member 4 road-network routes
    are clearly distinguished in CoordinatedEmergencyCase and analytics.
    """
    sim_resp = client.post(
        "/api/coordination/simulate",
        json={
            "scenario_type": "HIGH_IMPACT_HIGHWAY_CRASH",
            "auto_validate": True,
            "auto_dispatch": True,
            "auto_assign_hospital": True,
            "auto_calculate_route": True,
        },
    )
    assert sim_resp.status_code == 201
    case_sim = sim_resp.json()["coordinated_emergency"]
    em_id = case_sim["id"]

    # Initially uses a simulated route estimate
    assert case_sim["is_route_simulated"] is True
    assert case_sim["route_source"] == "SIMULATED_E2E_ROUTE_ESTIMATE"
    assert "simulated" in case_sim["route_type_label"].lower()

    # Now Member 4 pushes an actual OSMnx road-network route via POST /api/routing/{em_id}
    m4_resp = client.post(
        f"/api/routing/{em_id}",
        json={
            "emergency_id": em_id,
            "distance_km": 4.2,
            "estimated_duration_minutes": 6.1,
            "source": "MEMBER_4_OSMNX_ROUTING",
            "route_geometry": {
                "type": "LineString",
                "coordinates": [[77.5946, 12.9716], [77.6476, 12.9592]],
            },
        },
    )
    assert m4_resp.status_code == 201

    # Verify CoordinatedEmergencyCase now reports actual Member 4 routing (is_route_simulated=False)
    case_actual = client.get(f"/api/coordination/emergencies/{em_id}").json()
    assert case_actual["is_route_simulated"] is False
    assert case_actual["route_source"] == "MEMBER_4_OSMNX_ROUTING"
    assert "actual member 4" in case_actual["route_type_label"].lower()
    assert case_actual["distance_km"] == 4.2
    assert case_actual["eta_minutes"] == 6.1

    analytics = client.get("/api/coordination/analytics").json()
    assert analytics["actual_member4_routes_count"] == 1
    assert analytics["simulated_routes_count"] == 0
