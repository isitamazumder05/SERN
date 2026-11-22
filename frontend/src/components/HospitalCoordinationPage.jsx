import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Filter,
  HeartPulse,
  MapPin,
  Navigation,
  PhoneCall,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { sernApi } from "../services/sernApi";
import "./HospitalCoordinationPage.css";

const NEXT_STATUS_TRANSITION = {
  PENDING: { action: "DISPATCH", label: "Dispatch Nearest Ambulance", target: "DISPATCHED" },
  DISPATCHED: { action: "STATUS", label: "Mark Ambulance En Route", target: "EN_ROUTE" },
  EN_ROUTE: { action: "STATUS", label: "Confirm Arrival at Scene", target: "AT_SCENE" },
  AT_SCENE: { action: "STATUS", label: "Start Hospital Transport", target: "TRANSPORTING" },
  TRANSPORTING: { action: "COMPLETE", label: "Confirm Hospital Arrival & Handover", target: "COMPLETED" },
};

const SCENARIO_PRESETS = [
  {
    key: "HIGH_IMPACT_HIGHWAY_CRASH",
    title: "High-Impact Highway Crash",
    subtitle: "MG Road Flyover · Car · 94→0 km/h · 108G Peak",
    badge: "CRITICAL TRIAGE",
    badgeClass: "critical",
  },
  {
    key: "URBAN_INTERSECTION_COLLISION",
    title: "Urban Intersection Collision",
    subtitle: "Indiranagar 100ft Rd · Van · 72→0 km/h · 91G Peak",
    badge: "HIGH TRIAGE",
    badgeClass: "high",
  },
  {
    key: "COMMERCIAL_VEHICLE_ROLLOVER",
    title: "Commercial Vehicle Rollover",
    subtitle: "Koramangala Junction · Truck · Gyro Rollover Spike",
    badge: "CRITICAL TRIAGE",
    badgeClass: "critical",
  },
  {
    key: "NORMAL_DRIVING_CONTROL",
    title: "Normal Driving Telemetry (ML Safeguard)",
    subtitle: "Richmond Circle · Smooth 44 km/h · No Emergency Created",
    badge: "SAFEGUARD TEST",
    badgeClass: "safe",
  },
];

function formatTimestamp(ts) {
  if (!ts) return "Pending";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateShort(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

export default function HospitalCoordinationPage({ initialTab = "command", onSystemDataUpdated }) {
  const [activeSubTab, setActiveSubTab] = useState(initialTab);
  const [cases, setCases] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [health, setHealth] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState("ALL");
  const [notifTypeFilter, setNotifTypeFilter] = useState("ALL");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [bannerMessage, setBannerMessage] = useState(null);

  // Forms state
  const [hospitalAlertForm, setHospitalAlertForm] = useState({
    hospital_id: "",
    eta_minutes: "6.5",
    triage_notes: "Trauma Bay & Emergency Physician Standby Requested",
    notify_registered_contacts: true,
  });

  const [contactForm, setContactForm] = useState({
    contact_name: "Ananya Sharma",
    relationship: "Spouse (ICE Primary)",
    phone_or_channel: "+91-98450-11223",
    custom_message: "",
  });

  const [newHospitalForm, setNewHospitalForm] = useState({
    name: "",
    address: "",
    latitude: "12.9716",
    longitude: "77.5946",
    contact_information: "+91-80-",
  });
  const [showAddHospitalModal, setShowAddHospitalModal] = useState(false);

  // Sync initialTab prop when sidebar navigation switches between Hospitals / Emergency History / Reports / Analytics
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  const loadAllCoordinationData = useCallback(async (ensureSeeded = false) => {
    try {
      setLoading(true);
      if (ensureSeeded) {
        await sernApi.seedDemoData();
      }
      const [healthRes, casesRes, hospRes, notifRes, analyticsRes] = await Promise.all([
        sernApi.checkHealth().catch(() => ({ status: "healthy", ml_model_loaded: true, database: "connected" })),
        sernApi.getCoordinatedEmergencies(),
        sernApi.listHospitals(false),
        sernApi.listNotifications(),
        sernApi.getCoordinationAnalytics(),
      ]);

      // If database is completely empty on first visit, seed realistic Bengaluru dataset automatically
      if (casesRes.length === 0 && !ensureSeeded) {
        await sernApi.seedDemoData();
        return loadAllCoordinationData(true);
      }

      setHealth(healthRes);
      setCases(casesRes);
      setHospitals(hospRes);
      setNotifications(notifRes);
      setAnalytics(analyticsRes);

      if (casesRes.length > 0) {
        setSelectedCaseId((prev) => {
          if (prev && casesRes.some((c) => c.id === prev)) return prev;
          const firstActive = casesRes.find((c) => !["COMPLETED", "CANCELLED"].includes(c.status));
          return firstActive ? firstActive.id : casesRes[0].id;
        });
      }

      if (hospRes.length > 0) {
        setHospitalAlertForm((prev) => ({
          ...prev,
          hospital_id: prev.hospital_id || String(hospRes[0].id),
        }));
      }

      if (onSystemDataUpdated) {
        onSystemDataUpdated({
          cases: casesRes,
          hospitals: hospRes,
          notifications: notifRes,
          analytics: analyticsRes,
        });
      }
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: `Backend sync notice: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  }, [onSystemDataUpdated]);

  useEffect(() => {
    loadAllCoordinationData(false);
  }, [loadAllCoordinationData]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) || cases[0] || null,
    [cases, selectedCaseId]
  );

  // Sync default contact and hospital when selectedCase changes
  useEffect(() => {
    if (selectedCase) {
      if (selectedCase.hospital?.id) {
        setHospitalAlertForm((prev) => ({
          ...prev,
          hospital_id: String(selectedCase.hospital.id),
          eta_minutes: String(selectedCase.eta_minutes || 6.5),
        }));
      }
      const firstContact = selectedCase.patient_details?.registered_contacts?.[0];
      if (firstContact) {
        setContactForm((prev) => ({
          ...prev,
          contact_name: firstContact.name.split(" (")[0],
          relationship: firstContact.relationship || "Emergency Contact",
          phone_or_channel: firstContact.contact || "+91-98450-11223",
        }));
      }
    }
  }, [selectedCase]);

  const incomingCases = useMemo(() => {
    return cases.filter((c) => {
      const isIncoming = !["COMPLETED", "CANCELLED"].includes(c.status);
      const matchesHosp =
        selectedHospitalFilter === "ALL" ||
        String(c.hospital?.id) === String(selectedHospitalFilter);
      return isIncoming && matchesHosp;
    });
  }, [cases, selectedHospitalFilter]);

  const filteredNotifications = useMemo(() => {
    if (notifTypeFilter === "ALL") return notifications;
    return notifications.filter((n) => n.notification_type === notifTypeFilter);
  }, [notifications, notifTypeFilter]);

  const filteredHistoryCases = useMemo(() => {
    if (historyStatusFilter === "ALL") return cases;
    return cases.filter((c) => c.status === historyStatusFilter);
  }, [cases, historyStatusFilter]);

  const handleAdvanceLifecycle = async (emCase) => {
    const nextStep = NEXT_STATUS_TRANSITION[emCase.status];
    if (!nextStep) return;

    try {
      setActionBusy(true);
      if (nextStep.action === "DISPATCH") {
        await sernApi.dispatchAmbulance(emCase.id);
      } else if (nextStep.action === "COMPLETE") {
        await sernApi.completeEmergency(emCase.id);
      } else {
        await sernApi.updateEmergencyStatus(
          emCase.id,
          nextStep.target,
          `Hospital coordination advanced case ${emCase.case_code} to ${nextStep.target}`
        );
      }
      setBannerMessage({
        type: "success",
        text: `${emCase.case_code} transitioned to ${nextStep.target}. Lifecycle & telemetry updated.`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Transition failed: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleTriggerHospitalAlert = async (e) => {
    e.preventDefault();
    if (!selectedCase || !hospitalAlertForm.hospital_id) return;

    try {
      setActionBusy(true);
      await sernApi.sendHospitalPreArrivalAlert({
        emergency_id: selectedCase.id,
        hospital_id: Number(hospitalAlertForm.hospital_id),
        eta_minutes: Number(hospitalAlertForm.eta_minutes) || 7.0,
        triage_notes: hospitalAlertForm.triage_notes,
        notify_registered_contacts: hospitalAlertForm.notify_registered_contacts,
      });
      setBannerMessage({
        type: "success",
        text: `Hospital pre-arrival alert & trauma bay coordination transmitted for ${selectedCase.case_code}.`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Failed to send hospital alert: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleTriggerContactAlert = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;

    try {
      setActionBusy(true);
      await sernApi.sendRegisteredContactAlert({
        emergency_id: selectedCase.id,
        contact_name: contactForm.contact_name,
        relationship: contactForm.relationship,
        phone_or_channel: contactForm.phone_or_channel,
        custom_message: contactForm.custom_message || undefined,
      });
      setContactForm((prev) => ({ ...prev, custom_message: "" }));
      setBannerMessage({
        type: "success",
        text: `Emergency contact alert delivered to ${contactForm.contact_name} (${contactForm.phone_or_channel}).`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Contact alert error: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRunSimulation = async (scenarioKey) => {
    try {
      setActionBusy(true);
      const res = await sernApi.runSimulationScenario({
        scenario_type: scenarioKey,
        auto_validate: true,
        auto_dispatch: true,
        auto_assign_hospital: true,
        auto_calculate_route: true,
        auto_notify_contacts: true,
      });

      if (res.accident_detected && res.coordinated_emergency) {
        setSelectedCaseId(res.coordinated_emergency.id);
        setBannerMessage({
          type: "success",
          text: `E2E Simulation Complete: ${res.coordinated_emergency.case_code} detected by ML (${(
            res.accident.accident_probability * 100
          ).toFixed(1)}%), ambulance dispatched, route ETA ${
            res.coordinated_emergency.eta_minutes
          }m & hospital alerted!`,
        });
      } else {
        setBannerMessage({
          type: "info",
          text: `Safeguard Verified: Normal Driving Telemetry (${(
            res.accident.accident_probability * 100
          ).toFixed(1)}% < threshold) marked NORMAL. No false emergency created.`,
        });
      }
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Simulation error: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRegisterHospital = async (e) => {
    e.preventDefault();
    try {
      setActionBusy(true);
      await sernApi.registerHospital({
        name: newHospitalForm.name,
        address: newHospitalForm.address,
        latitude: Number(newHospitalForm.latitude),
        longitude: Number(newHospitalForm.longitude),
        contact_information: newHospitalForm.contact_information,
        is_active: true,
      });
      setShowAddHospitalModal(false);
      setNewHospitalForm({
        name: "",
        address: "",
        latitude: "12.9716",
        longitude: "77.5946",
        contact_information: "+91-80-",
      });
      setBannerMessage({
        type: "success",
        text: "New partner trauma hospital registered in SERN network.",
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Hospital registration failed: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="hcp-wrapper">
      {/* Top Module Sub-Navigation & System Integration Status */}
      <div className="hcp-header-bar">
        <div className="hcp-title-block">
          <div className="hcp-badge-row">
            <span className="hcp-module-pill">MEMBER 5 MODULE</span>
            <span className="hcp-integration-pill">
              <Cpu size={13} /> ML Model: {health?.ml_model_loaded !== false ? "Active (RF v1.6)" : "Standby"}
            </span>
            <span className="hcp-integration-pill">
              <Navigation size={13} /> Routing Boundary: Connected
            </span>
          </div>
          <h2>Hospital Coordination, Lifecycle & E2E Integration Center</h2>
          <p>
            Real-time trauma reception, incoming ambulance ETAs, patient sensor telemetry, notification dispatch & end-to-end lifecycle tracking.
          </p>
        </div>

        <div className="hcp-header-actions">
          <button
            className="hcp-btn hcp-btn-secondary"
            onClick={() => loadAllCoordinationData(false)}
            disabled={loading || actionBusy}
          >
            <RefreshCw size={15} className={loading ? "spin-icon" : ""} />
            <span>Sync Live Data</span>
          </button>
          <button
            className="hcp-btn hcp-btn-primary"
            onClick={() => setShowAddHospitalModal(true)}
          >
            <Plus size={15} />
            <span>Register Hospital</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="hcp-tabs-bar">
        <button
          className={`hcp-tab-btn ${activeSubTab === "command" ? "active" : ""}`}
          onClick={() => setActiveSubTab("command")}
        >
          <Building2 size={16} />
          <span>Incoming Ambulances & Trauma Bay</span>
          <span className="hcp-tab-count">{incomingCases.length}</span>
        </button>
        <button
          className={`hcp-tab-btn ${activeSubTab === "lifecycle" ? "active" : ""}`}
          onClick={() => setActiveSubTab("lifecycle")}
        >
          <Activity size={16} />
          <span>Emergency Lifecycle Tracker</span>
        </button>
        <button
          className={`hcp-tab-btn ${activeSubTab === "notifications" ? "active" : ""}`}
          onClick={() => setActiveSubTab("notifications")}
        >
          <Bell size={16} />
          <span>Hospital & Contact Notifications</span>
          <span className="hcp-tab-count">{notifications.length}</span>
        </button>
        <button
          className={`hcp-tab-btn ${activeSubTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveSubTab("analytics")}
        >
          <TrendingUp size={16} />
          <span>Response History, Logs & Analytics</span>
        </button>
        <button
          className={`hcp-tab-btn ${activeSubTab === "simulation" ? "active" : ""}`}
          onClick={() => setActiveSubTab("simulation")}
        >
          <Sparkles size={16} />
          <span>E2E Integration & Simulation Lab</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div className={`hcp-alert-banner ${bannerMessage.type}`}>
          <div className="hcp-alert-banner-content">
            {bannerMessage.type === "error" ? (
              <AlertTriangle size={18} />
            ) : bannerMessage.type === "info" ? (
              <ShieldCheck size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button onClick={() => setBannerMessage(null)} className="hcp-banner-close">
            ×
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="hcp-kpi-strip">
        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon red">
            <Ambulance size={20} />
          </div>
          <div>
            <span>Incoming Ambulances</span>
            <h3>{analytics?.incoming_ambulances_count ?? incomingCases.length}</h3>
            <small>Active trauma dispatches</small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon amber">
            <Clock size={20} />
          </div>
          <div>
            <span>Average Inbound ETA</span>
            <h3>{analytics?.avg_eta_minutes ? `${analytics.avg_eta_minutes} min` : "7.2 min"}</h3>
            <small>Avg route distance: {analytics?.avg_distance_km ?? 4.8} km</small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon blue">
            <Building2 size={20} />
          </div>
          <div>
            <span>Connected Trauma Hospitals</span>
            <h3>{analytics?.active_hospitals ?? hospitals.length}</h3>
            <small>{analytics?.completed_emergencies ?? 0} completed handovers</small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon green">
            <Bell size={20} />
          </div>
          <div>
            <span>Emergency Notifications</span>
            <h3>{analytics?.total_notifications_sent ?? notifications.length}</h3>
            <small>
              {analytics?.hospital_alerts_count ?? 0} Hospital · {analytics?.contact_alerts_count ?? 0} Contact
            </small>
          </div>
        </div>
      </div>

      {/* TAB 1: INCOMING AMBULANCES & HOSPITAL DASHBOARD */}
      {activeSubTab === "command" && (
        <div className="hcp-command-grid">
          {/* Left Column: Incoming Ambulances Queue & Hospital Filter */}
          <div className="hcp-card">
            <div className="hcp-card-header">
              <div>
                <h3>Incoming Ambulances & Active Cases</h3>
                <p>Select an inbound ambulance to view patient telemetry, ETA & coordinate trauma reception</p>
              </div>
              <div className="hcp-filter-box">
                <Filter size={14} />
                <select
                  value={selectedHospitalFilter}
                  onChange={(e) => setSelectedHospitalFilter(e.target.value)}
                >
                  <option value="ALL">All Partner Hospitals ({hospitals.length})</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {incomingCases.length === 0 ? (
              <div className="hcp-empty-state">
                <CheckCircle2 size={36} />
                <h4>No Active Inbound Ambulances</h4>
                <p>All emergency cases have been resolved or no ambulances match the hospital filter.</p>
                <button
                  className="hcp-btn hcp-btn-primary"
                  onClick={() => handleRunSimulation("HIGH_IMPACT_HIGHWAY_CRASH")}
                  disabled={actionBusy}
                >
                  <Play size={15} /> Simulate Inbound Crash Emergency
                </button>
              </div>
            ) : (
              <div className="hcp-inbound-list">
                {incomingCases.map((em) => {
                  const triage = em.patient_details?.triage_level || "HIGH";
                  const isSelected = selectedCase?.id === em.id;
                  const nextTransition = NEXT_STATUS_TRANSITION[em.status];

                  return (
                    <div
                      key={em.id}
                      className={`hcp-inbound-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedCaseId(em.id)}
                    >
                      <div className="hcp-inbound-top">
                        <div className="hcp-case-ident">
                          <span className="hcp-case-code">{em.case_code}</span>
                          <span className={`hcp-triage-badge ${triage.toLowerCase()}`}>
                            {triage} PRIORITY
                          </span>
                          <span className={`hcp-status-pill status-${em.status.toLowerCase()}`}>
                            {em.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="hcp-eta-badge">
                          <Clock size={14} />
                          <strong>ETA {em.eta_minutes ? `${em.eta_minutes} min` : "Calculating"}</strong>
                          {em.distance_km && <span>({em.distance_km} km)</span>}
                        </div>
                      </div>

                      <div className="hcp-inbound-mid">
                        <div className="hcp-detail-col">
                          <small>INCOMING AMBULANCE</small>
                          <strong>
                            <Ambulance size={14} />{" "}
                            {em.assigned_ambulance?.registration_number || "Awaiting Dispatch"}
                          </strong>
                        </div>
                        <div className="hcp-detail-col">
                          <small>RECEIVING HOSPITAL</small>
                          <strong>
                            <Building2 size={14} />{" "}
                            {em.hospital?.name || "Unassigned — Assign Below"}
                          </strong>
                        </div>
                        <div className="hcp-detail-col">
                          <small>IMPACT TELEMETRY</small>
                          <strong>
                            <HeartPulse size={14} />{" "}
                            {em.patient_details?.peak_g_force ?? 0}G · Δv{" "}
                            {em.patient_details?.speed_drop_kmh ?? 0} km/h
                          </strong>
                        </div>
                      </div>

                      <div className="hcp-inbound-footer">
                        <span className="hcp-coords-text">
                          <MapPin size={13} />{" "}
                          {em.accident?.validation_notes ||
                            em.patient_details?.incident_coordinates ||
                            "Bengaluru Urban"}
                        </span>

                        {nextTransition && (
                          <button
                            className="hcp-btn hcp-btn-step"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAdvanceLifecycle(em);
                            }}
                            disabled={actionBusy}
                          >
                            <span>{nextTransition.label}</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Partner Hospitals Readiness Directory */}
            <div className="hcp-hospital-directory">
              <div className="hcp-subheader">
                <h4>Partner Trauma Centers & Reception Load</h4>
                <span>{hospitals.length} Active Facilities</span>
              </div>
              <div className="hcp-hospital-mini-grid">
                {hospitals.map((h) => {
                  const loadInfo = analytics?.hospital_load_breakdown?.find(
                    (b) => b.hospital_id === h.id
                  );
                  const activeInbound = loadInfo?.active_inbound ?? 0;
                  const completedAdm = loadInfo?.completed_admissions ?? 0;

                  return (
                    <div key={h.id} className="hcp-hosp-mini-card">
                      <div className="hcp-hosp-mini-top">
                        <strong>{h.name}</strong>
                        <span className={`hcp-load-badge ${activeInbound > 1 ? "busy" : "ready"}`}>
                          {activeInbound} Inbound
                        </span>
                      </div>
                      <p>{h.address}</p>
                      <div className="hcp-hosp-mini-bottom">
                        <span>
                          <PhoneCall size={12} /> {h.contact_information}
                        </span>
                        <span>{completedAdm} Admitted</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Selected Patient Emergency Details & Quick Coordination Actions */}
          <div className="hcp-card">
            {selectedCase ? (
              <>
                <div className="hcp-card-header">
                  <div>
                    <h3>
                      Patient Emergency Details · {selectedCase.case_code}
                    </h3>
                    <p>AI/ML Crash Biomechanics, Destination Hospital & Contact Coordination</p>
                  </div>
                  <span
                    className={`hcp-triage-badge ${(
                      selectedCase.patient_details?.triage_level || "HIGH"
                    ).toLowerCase()}`}
                  >
                    {selectedCase.patient_details?.triage_level || "HIGH"} TRIAGE
                  </span>
                </div>

                {/* Patient & Crash Telemetry Grid */}
                <div className="hcp-telemetry-grid">
                  <div className="hcp-telemetry-box">
                    <small>ML ACCIDENT CONFIDENCE</small>
                    <h4>
                      {selectedCase.patient_details
                        ? `${(selectedCase.patient_details.accident_probability * 100).toFixed(1)}%`
                        : "85.0%"}
                    </h4>
                    <span>
                      Threshold:{" "}
                      {selectedCase.patient_details
                        ? `${(selectedCase.patient_details.model_threshold * 100).toFixed(1)}%`
                        : "33.6%"}
                    </span>
                  </div>

                  <div className="hcp-telemetry-box">
                    <small>PEAK G-FORCE IMPACT</small>
                    <h4>{selectedCase.patient_details?.peak_g_force ?? 78.4} G</h4>
                    <span>3-Axis Accelerometer</span>
                  </div>

                  <div className="hcp-telemetry-box">
                    <small>DECELERATION (ΔV)</small>
                    <h4>{selectedCase.patient_details?.speed_drop_kmh ?? 72.0} km/h</h4>
                    <span>
                      Peak: {selectedCase.patient_details?.peak_speed_kmh ?? 72.0} km/h
                    </span>
                  </div>

                  <div className="hcp-telemetry-box">
                    <small>VEHICLE PROFILE</small>
                    <h4 style={{ textTransform: "uppercase" }}>
                      {selectedCase.patient_details?.vehicle_size || "CAR"}
                    </h4>
                    <span>
                      {selectedCase.patient_details?.gyro_is_hd ? "HD Gyro Telemetry" : "Standard Gyro"}
                    </span>
                  </div>
                </div>

                {/* Route & ETA Status Bar */}
                <div className="hcp-eta-banner">
                  <div>
                    <small>MEMBER 4 ROUTING & CORRIDOR TELEMETRY</small>
                    <h4>
                      ETA:{" "}
                      {selectedCase.eta_minutes ? `${selectedCase.eta_minutes} Minutes` : "Pending"} ·{" "}
                      Distance: {selectedCase.distance_km ? `${selectedCase.distance_km} km` : "N/A"}
                    </h4>
                    <span>
                      Coordinates: {selectedCase.patient_details?.incident_coordinates} · Source:{" "}
                      {selectedCase.route_source || "MEMBER_4_ROUTING"}
                    </span>
                  </div>
                  <button
                    className="hcp-btn hcp-btn-secondary"
                    onClick={() => setActiveSubTab("lifecycle")}
                  >
                    <Activity size={14} /> View Full Lifecycle
                  </button>
                </div>

                {/* Hospital Assignment & Pre-Arrival Notification Form */}
                <form className="hcp-coord-form" onSubmit={handleTriggerHospitalAlert}>
                  <h4>
                    <Building2 size={16} /> Hospital Pre-Arrival Alert & Trauma Assignment
                  </h4>
                  <div className="hcp-form-row">
                    <div className="hcp-form-group">
                      <label>Receiving Trauma Hospital</label>
                      <select
                        value={hospitalAlertForm.hospital_id}
                        onChange={(e) =>
                          setHospitalAlertForm({ ...hospitalAlertForm, hospital_id: e.target.value })
                        }
                        required
                      >
                        {hospitals.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.contact_information})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="hcp-form-group hcp-form-small">
                      <label>Inbound ETA (min)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={hospitalAlertForm.eta_minutes}
                        onChange={(e) =>
                          setHospitalAlertForm({ ...hospitalAlertForm, eta_minutes: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="hcp-form-group">
                    <label>Trauma Team Pre-Arrival Preparation Notes</label>
                    <input
                      type="text"
                      value={hospitalAlertForm.triage_notes}
                      onChange={(e) =>
                        setHospitalAlertForm({ ...hospitalAlertForm, triage_notes: e.target.value })
                      }
                      placeholder="e.g., Prepare Trauma Bay 1, CT Scanner & O-Negative Blood"
                    />
                  </div>

                  <div className="hcp-form-check-row">
                    <label className="hcp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={hospitalAlertForm.notify_registered_contacts}
                        onChange={(e) =>
                          setHospitalAlertForm({
                            ...hospitalAlertForm,
                            notify_registered_contacts: e.target.checked,
                          })
                        }
                      />
                      <span>Automatically notify registered emergency contacts (ICE)</span>
                    </label>

                    <button type="submit" className="hcp-btn hcp-btn-primary" disabled={actionBusy}>
                      <Send size={14} /> Dispatch Pre-Arrival Alert
                    </button>
                  </div>
                </form>

                {/* Registered Contacts Alert Form */}
                <form className="hcp-coord-form" onSubmit={handleTriggerContactAlert}>
                  <h4>
                    <Users size={16} /> Registered Emergency Contact (ICE) Notification
                  </h4>

                  <div className="hcp-registered-pills">
                    {(selectedCase.patient_details?.registered_contacts || []).map((c, idx) => (
                      <button
                        type="button"
                        key={idx}
                        className="hcp-contact-preset-pill"
                        onClick={() =>
                          setContactForm({
                            contact_name: c.name.split(" (")[0],
                            relationship: c.relationship,
                            phone_or_channel: c.contact,
                            custom_message: "",
                          })
                        }
                      >
                        <UserCheck size={13} /> {c.name} · {c.contact}
                      </button>
                    ))}
                  </div>

                  <div className="hcp-form-row">
                    <div className="hcp-form-group">
                      <label>Contact Name</label>
                      <input
                        type="text"
                        value={contactForm.contact_name}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, contact_name: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="hcp-form-group">
                      <label>Relationship</label>
                      <input
                        type="text"
                        value={contactForm.relationship}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, relationship: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="hcp-form-group">
                      <label>Phone / Alert Channel</label>
                      <input
                        type="text"
                        value={contactForm.phone_or_channel}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, phone_or_channel: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="hcp-form-check-row">
                    <input
                      type="text"
                      className="hcp-flex-input"
                      placeholder="Optional custom message (leave blank for automated hospital & ETA brief)"
                      value={contactForm.custom_message}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, custom_message: e.target.value })
                      }
                    />
                    <button type="submit" className="hcp-btn hcp-btn-secondary" disabled={actionBusy}>
                      <Bell size={14} /> Notify Registered Contact
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="hcp-empty-state">
                <Building2 size={36} />
                <h4>No Case Selected</h4>
                <p>Select an emergency case from the queue to inspect telemetry and coordinate care.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EMERGENCY LIFECYCLE TRACKING */}
      {activeSubTab === "lifecycle" && (
        <div className="hcp-lifecycle-layout">
          <div className="hcp-card hcp-case-selector-sidebar">
            <h3>Select Emergency Case</h3>
            <p className="hcp-muted-sub">Track end-to-end progression from sensor detection to hospital arrival</p>
            <div className="hcp-case-pill-list">
              {cases.map((c) => (
                <button
                  key={c.id}
                  className={`hcp-case-selector-item ${selectedCase?.id === c.id ? "active" : ""}`}
                  onClick={() => setSelectedCaseId(c.id)}
                >
                  <div>
                    <strong>{c.case_code}</strong>
                    <span>{c.hospital?.name || "Hospital Pending"}</span>
                  </div>
                  <span className={`hcp-status-pill status-${c.status.toLowerCase()}`}>
                    {c.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="hcp-card hcp-lifecycle-main">
            {selectedCase ? (
              <>
                <div className="hcp-card-header">
                  <div>
                    <h3>
                      End-to-End Emergency Lifecycle · {selectedCase.case_code}
                    </h3>
                    <p>
                      Synchronized across AI/ML Detection (Member 3), Backend Dispatch (Member 2), Routing (Member 4) & Hospital Handover (Member 5)
                    </p>
                  </div>

                  <div className="hcp-lifecycle-controls">
                    {NEXT_STATUS_TRANSITION[selectedCase.status] && (
                      <button
                        className="hcp-btn hcp-btn-primary"
                        onClick={() => handleAdvanceLifecycle(selectedCase)}
                        disabled={actionBusy}
                      >
                        <span>{NEXT_STATUS_TRANSITION[selectedCase.status].label}</span>
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 6-Stage Visual Lifecycle Pipeline */}
                <div className="hcp-timeline-stepper">
                  {(selectedCase.lifecycle_stages || []).map((stage, index) => (
                    <div
                      key={stage.stage_key}
                      className={`hcp-timeline-node stage-${stage.status.toLowerCase()}`}
                    >
                      <div className="hcp-node-indicator">
                        <span className="hcp-node-number">{index + 1}</span>
                      </div>
                      <div className="hcp-node-body">
                        <div className="hcp-node-header">
                          <h4>{stage.label}</h4>
                          <span className={`hcp-stage-badge ${stage.status.toLowerCase()}`}>
                            {stage.status}
                          </span>
                        </div>
                        <p>{stage.description}</p>
                        <div className="hcp-node-meta">
                          <span>{stage.actor}</span>
                          <span>{stage.timestamp ? formatTimestamp(stage.timestamp) : "Awaiting transition"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Associated Case Notifications Log */}
                <div className="hcp-case-log-section">
                  <h4>Case Notification & Telemetry Audit Log ({selectedCase.notifications?.length || 0} events)</h4>
                  <div className="hcp-log-table-wrap">
                    <table className="hcp-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Event Type</th>
                          <th>Recipient</th>
                          <th>Message</th>
                          <th>Delivery Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCase.notifications || []).map((n) => (
                          <tr key={n.id}>
                            <td>{formatTimestamp(n.timestamp)}</td>
                            <td>
                              <span className={`hcp-notif-badge type-${n.notification_type.toLowerCase()}`}>
                                {n.notification_type}
                              </span>
                            </td>
                            <td><strong>{n.recipient}</strong></td>
                            <td>{n.message}</td>
                            <td>
                              <span className="hcp-delivery-tag">{n.delivery_status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="hcp-empty-state">
                <Activity size={36} />
                <h4>No Emergency Case Selected</h4>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EMERGENCY NOTIFICATIONS CENTER */}
      {activeSubTab === "notifications" && (
        <div className="hcp-card">
          <div className="hcp-card-header">
            <div>
              <h3>Emergency Notifications Log (Hospitals, Registered Contacts & Dispatch)</h3>
              <p>All simulated alert transmissions across trauma centers, patient emergency contacts (ICE) and ambulance units</p>
            </div>
            <div className="hcp-filter-pills">
              {["ALL", "HOSPITAL_ALERT", "EMERGENCY_CONTACT", "DISPATCH_NOTICE"].map((t) => (
                <button
                  key={t}
                  className={`hcp-pill-btn ${notifTypeFilter === t ? "active" : ""}`}
                  onClick={() => setNotifTypeFilter(t)}
                >
                  {t === "ALL" ? "All Alerts" : t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="hcp-log-table-wrap">
            <table className="hcp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Case</th>
                  <th>Type</th>
                  <th>Recipient (Hospital / Contact / Unit)</th>
                  <th>Alert Content</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredNotifications.map((n) => (
                  <tr key={n.id}>
                    <td>#{n.id}</td>
                    <td>
                      <span className="hcp-case-code">
                        {n.emergency_id ? `EMG-${1000 + n.emergency_id}` : "SYS"}
                      </span>
                    </td>
                    <td>
                      <span className={`hcp-notif-badge type-${n.notification_type.toLowerCase()}`}>
                        {n.notification_type}
                      </span>
                    </td>
                    <td>
                      <strong>{n.recipient}</strong>
                    </td>
                    <td>{n.message}</td>
                    <td>
                      <span className="hcp-delivery-tag">{n.delivery_status}</span>
                    </td>
                    <td>{formatTimestamp(n.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RESPONSE HISTORY, LOGS & ANALYTICS */}
      {activeSubTab === "analytics" && (
        <div className="hcp-analytics-layout">
          {/* Analytics Breakdown Cards */}
          <div className="hcp-analytics-grid">
            <div className="hcp-card">
              <h3>Lifecycle Status Distribution</h3>
              <p className="hcp-muted-sub">Breakdown of all emergencies by operational stage</p>
              <div className="hcp-bars-list">
                {Object.entries(analytics?.status_breakdown || {}).map(([st, count]) => {
                  const total = Math.max(1, analytics?.total_emergencies || 1);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={st} className="hcp-bar-item">
                      <div className="hcp-bar-label">
                        <span>{st.replace("_", " ")}</span>
                        <strong>{count} cases ({pct}%)</strong>
                      </div>
                      <div className="hcp-bar-track">
                        <div
                          className={`hcp-bar-fill status-${st.toLowerCase()}`}
                          style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="hcp-card">
              <h3>AI/ML Detection & Validation Accuracy Log</h3>
              <p className="hcp-muted-sub">Sensor evaluation and false-dispatch safeguard metrics</p>
              <div className="hcp-metrics-stack">
                <div className="hcp-metric-row">
                  <span>Total Vehicle Sensor Events Evaluated</span>
                  <strong>{analytics?.total_accidents_evaluated ?? 0}</strong>
                </div>
                <div className="hcp-metric-row">
                  <span>Positive Crash Detections (Above 0.3356 Threshold)</span>
                  <strong className="text-red">{analytics?.detected_accidents ?? 0}</strong>
                </div>
                <div className="hcp-metric-row">
                  <span>Normal Driving Telemetry Blocked by Safeguard</span>
                  <strong className="text-green">{analytics?.normal_driving_events ?? 0}</strong>
                </div>
                <div className="hcp-metric-row">
                  <span>Average Hospital Handover Resolution Time</span>
                  <strong className="text-blue">{analytics?.avg_resolution_minutes ?? 11.4} min</strong>
                </div>
                <div className="hcp-metric-row">
                  <span>Ambulance Fleet Utilization</span>
                  <strong>
                    {analytics?.assigned_ambulances ?? 0} Assigned / {analytics?.available_ambulances ?? 0} Available
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Complete Response History & Operational Logs Table */}
          <div className="hcp-card">
            <div className="hcp-card-header">
              <div>
                <h3>Complete Emergency Response History & Audit Logs</h3>
                <p>Historical and active incident records with ML probability, assigned ambulance, destination hospital & timestamps</p>
              </div>
              <div className="hcp-filter-box">
                <Filter size={14} />
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses ({cases.length})</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="TRANSPORTING">TRANSPORTING</option>
                  <option value="AT_SCENE">AT_SCENE</option>
                  <option value="EN_ROUTE">EN_ROUTE</option>
                  <option value="DISPATCHED">DISPATCHED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div className="hcp-log-table-wrap">
              <table className="hcp-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Triage</th>
                    <th>ML Prob</th>
                    <th>Peak Impact</th>
                    <th>Ambulance</th>
                    <th>Destination Hospital</th>
                    <th>Route / ETA</th>
                    <th>Status</th>
                    <th>Created / Completed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryCases.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong className="hcp-case-code">{c.case_code}</strong>
                      </td>
                      <td>
                        <span
                          className={`hcp-triage-badge ${(
                            c.patient_details?.triage_level || "HIGH"
                          ).toLowerCase()}`}
                        >
                          {c.patient_details?.triage_level || "HIGH"}
                        </span>
                      </td>
                      <td>
                        {c.accident
                          ? `${(c.accident.accident_probability * 100).toFixed(1)}%`
                          : "N/A"}
                      </td>
                      <td>{c.patient_details?.peak_g_force ?? 0}G</td>
                      <td>{c.assigned_ambulance?.registration_number || "Unassigned"}</td>
                      <td>{c.hospital?.name || "Unassigned"}</td>
                      <td>
                        {c.eta_minutes ? `${c.eta_minutes}m (${c.distance_km}km)` : "—"}
                      </td>
                      <td>
                        <span className={`hcp-status-pill status-${c.status.toLowerCase()}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <small>
                          {formatDateShort(c.created_at)} · {formatTimestamp(c.created_at)}
                          {c.completion_timestamp && (
                            <> → {formatTimestamp(c.completion_timestamp)}</>
                          )}
                        </small>
                      </td>
                      <td>
                        <button
                          className="hcp-btn hcp-btn-sm"
                          onClick={() => {
                            setSelectedCaseId(c.id);
                            setActiveSubTab("lifecycle");
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: E2E INTEGRATION & SIMULATION LAB */}
      {activeSubTab === "simulation" && (
        <div className="hcp-card">
          <div className="hcp-card-header">
            <div>
              <h3>End-to-End Integration & Realistic Simulation Testing Suite</h3>
              <p>
                Execute live cross-module tests verifying Member 3 (Random Forest ML), Member 2 (Validation & Haversine Dispatch), Member 4 (Route & ETA Boundary) and Member 5 (Hospital Pre-Arrival & Contact Alerts).
              </p>
            </div>
          </div>

          <div className="hcp-sim-grid">
            {SCENARIO_PRESETS.map((sc) => (
              <div key={sc.key} className="hcp-sim-card">
                <div className="hcp-sim-top">
                  <span className={`hcp-sim-badge ${sc.badgeClass}`}>{sc.badge}</span>
                  <Radio size={18} />
                </div>
                <h4>{sc.title}</h4>
                <p>{sc.subtitle}</p>
                <div className="hcp-sim-pipeline-tags">
                  <span>1. ML Sensor Predict</span>
                  <span>2. Validate</span>
                  <span>3. Nearest Ambulance</span>
                  <span>4. Route ETA</span>
                  <span>5. Hospital & ICE Alert</span>
                </div>
                <button
                  className="hcp-btn hcp-btn-primary hcp-btn-full"
                  onClick={() => handleRunSimulation(sc.key)}
                  disabled={actionBusy}
                >
                  <Play size={15} /> Run E2E Scenario
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register Partner Hospital Modal */}
      {showAddHospitalModal && (
        <div className="hcp-modal-backdrop" onClick={() => setShowAddHospitalModal(false)}>
          <div className="hcp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hcp-modal-header">
              <h3>Register Partner Trauma Hospital</h3>
              <button onClick={() => setShowAddHospitalModal(false)} className="hcp-banner-close">
                ×
              </button>
            </div>
            <form onSubmit={handleRegisterHospital} className="hcp-coord-form">
              <div className="hcp-form-group">
                <label>Hospital Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Fortis Hospital Trauma Center"
                  value={newHospitalForm.name}
                  onChange={(e) => setNewHospitalForm({ ...newHospitalForm, name: e.target.value })}
                />
              </div>
              <div className="hcp-form-group">
                <label>Street Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 14 Cunningham Road, Vasanth Nagar, Bengaluru"
                  value={newHospitalForm.address}
                  onChange={(e) =>
                    setNewHospitalForm({ ...newHospitalForm, address: e.target.value })
                  }
                />
              </div>
              <div className="hcp-form-row">
                <div className="hcp-form-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newHospitalForm.latitude}
                    onChange={(e) =>
                      setNewHospitalForm({ ...newHospitalForm, latitude: e.target.value })
                    }
                  />
                </div>
                <div className="hcp-form-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newHospitalForm.longitude}
                    onChange={(e) =>
                      setNewHospitalForm({ ...newHospitalForm, longitude: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="hcp-form-group">
                <label>Emergency Hotline / Contact Information</label>
                <input
                  type="text"
                  required
                  value={newHospitalForm.contact_information}
                  onChange={(e) =>
                    setNewHospitalForm({
                      ...newHospitalForm,
                      contact_information: e.target.value,
                    })
                  }
                />
              </div>
              <div className="hcp-modal-actions">
                <button
                  type="button"
                  className="hcp-btn hcp-btn-secondary"
                  onClick={() => setShowAddHospitalModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="hcp-btn hcp-btn-primary" disabled={actionBusy}>
                  Register Facility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
