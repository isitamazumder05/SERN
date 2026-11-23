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
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
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
    badge: "EXPERIMENTAL CRITICAL SEVERITY",
    badgeClass: "critical",
  },
  {
    key: "URBAN_INTERSECTION_COLLISION",
    title: "Urban Intersection Collision",
    subtitle: "Indiranagar 100ft Rd · Van · 72→0 km/h · 91G Peak",
    badge: "EXPERIMENTAL HIGH SEVERITY",
    badgeClass: "high",
  },
  {
    key: "COMMERCIAL_VEHICLE_ROLLOVER",
    title: "Commercial Vehicle Rollover",
    subtitle: "Koramangala Junction · Truck · Gyro Rollover Spike",
    badge: "EXPERIMENTAL CRITICAL SEVERITY",
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
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  if (initialTab && initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveSubTab(initialTab);
  }

  const [cases, setCases] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [health, setHealth] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [prevSyncedCaseId, setPrevSyncedCaseId] = useState(null);
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
    contact_name: "Demo Contact — Ananya Sharma (Placeholder)",
    relationship: "Spouse (Demo Placeholder)",
    phone_or_channel: "+91-00000-11223 (Demo)",
    custom_message: "",
  });

  const [member4RouteForm, setMember4RouteForm] = useState({
    distance_km: "4.6",
    estimated_duration_minutes: "6.8",
    source: "MEMBER_4_OSMNX_ROUTING",
  });

  const [newHospitalForm, setNewHospitalForm] = useState({
    name: "",
    address: "",
    latitude: "12.9716",
    longitude: "77.5946",
    contact_information: "+91-80-",
  });
  const [showAddHospitalModal, setShowAddHospitalModal] = useState(false);

  const loadAllCoordinationData = useCallback(async (explicitSeedDemo = false) => {
    try {
      setLoading(true);
      if (explicitSeedDemo) {
        await sernApi.seedDemoData();
      }
      const healthRes = await sernApi.checkHealth();
      const [casesRes, hospRes, notifRes, analyticsRes] = await Promise.all([
        sernApi.getCoordinatedEmergencies(),
        sernApi.listHospitals(false),
        sernApi.listNotifications(),
        sernApi.getCoordinationAnalytics(),
      ]);

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
      } else {
        setSelectedCaseId(null);
      }

      if (hospRes.length > 0) {
        setHospitalAlertForm((prev) => ({
          ...prev,
          hospital_id: prev.hospital_id || String(hospRes[0].id),
        }));
      }

      if (onSystemDataUpdated) {
        onSystemDataUpdated({
          health: healthRes,
          cases: casesRes,
          hospitals: hospRes,
          notifications: notifRes,
          analytics: analyticsRes,
        });
      }
    } catch (err) {
      const disconnectedHealth = {
        status: "disconnected",
        database: "disconnected",
        ml_model_loaded: false,
        error: err.message,
      };
      setHealth(disconnectedHealth);
      if (onSystemDataUpdated) {
        onSystemDataUpdated({
          health: disconnectedHealth,
          cases: [],
          hospitals: [],
          notifications: [],
          analytics: null,
        });
      }
      setBannerMessage({
        type: "error",
        text: `Backend Disconnected: Unable to reach SERN API (${err.message}). Verify the backend server is running.`,
      });
    } finally {
      setLoading(false);
    }
  }, [onSystemDataUpdated]);

  const handleExplicitLoadDemoData = async () => {
    try {
      setActionBusy(true);
      const res = await sernApi.seedDemoData();
      await loadAllCoordinationData(false);
      setBannerMessage({
        type: "info",
        text: res.seeded
          ? `Demo Data Loaded: Seeded ${res.total_emergencies} sample Bengaluru emergency cases for demonstration.`
          : `Demo dataset is already loaded (${res.total_emergencies} cases present).`,
      });
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: `Failed to load demo data (Backend unavailable): ${err.message}`,
      });
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        loadAllCoordinationData(false);
      }
    });
    return () => {
      active = false;
    };
  }, [loadAllCoordinationData]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) || cases[0] || null,
    [cases, selectedCaseId]
  );

  // Sync default contact and hospital when selectedCase changes
  if (selectedCase && selectedCase.id !== prevSyncedCaseId) {
    setPrevSyncedCaseId(selectedCase.id);
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
        contact_name: firstContact.name,
        relationship: firstContact.relationship || "Demo Placeholder Contact",
        phone_or_channel: firstContact.contact || "+91-00000-11223 (Demo)",
      }));
    }
  }

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
        text: `Simulated hospital pre-arrival notification recorded for ${selectedCase.case_code} (no live SMS/hospital transmission).`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Failed to record hospital alert: ${err.message}` });
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
        text: `Simulated contact notification recorded for ${contactForm.contact_name} (${contactForm.phone_or_channel}) — logged in database only.`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Contact alert error: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handlePostMember4Route = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    try {
      setActionBusy(true);
      await sernApi.postRouteCalculation(selectedCase.id, {
        distance_km: Number(member4RouteForm.distance_km) || 4.5,
        estimated_duration_minutes: Number(member4RouteForm.estimated_duration_minutes) || 6.5,
        source: member4RouteForm.source || "MEMBER_4_OSMNX_ROUTING",
        route_geometry: {
          type: "LineString",
          coordinates: [
            [selectedCase.accident?.longitude || 77.5946, selectedCase.accident?.latitude || 12.9716],
            [selectedCase.hospital?.longitude || 77.6476, selectedCase.hospital?.latitude || 12.9592],
          ],
        },
      });
      setBannerMessage({
        type: "success",
        text: `Member 4 Road-Network Route synced for ${selectedCase.case_code} (${member4RouteForm.distance_km} km, ETA ${member4RouteForm.estimated_duration_minutes} min, Source: ${member4RouteForm.source}).`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Member 4 route integration error: ${err.message}` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleGenerateMockRoute = async () => {
    if (!selectedCase) return;
    try {
      setActionBusy(true);
      await sernApi.generateMockRoute(selectedCase.id);
      setBannerMessage({
        type: "info",
        text: `Simulated Mock Route stored for ${selectedCase.case_code} via /api/routing/${selectedCase.id}/mock (Source: MEMBER_4_ROUTING_MOCK_DEV).`,
      });
      await loadAllCoordinationData(false);
    } catch (err) {
      setBannerMessage({ type: "error", text: `Mock route error: ${err.message}` });
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

  const isBackendDisconnected = !health || health.status === "disconnected";
  const isBackendHealthy = health?.status === "healthy";

  return (
    <div className="hcp-wrapper">
      {/* Top Module Sub-Navigation & System Integration Status */}
      <div className="hcp-header-bar">
        <div className="hcp-title-block">
          <div className="hcp-badge-row">
            <span className="hcp-module-pill">MEMBER 5 MODULE</span>
            <span
              className={`hcp-integration-pill ${
                isBackendDisconnected ? "pill-disconnected" : isBackendHealthy ? "" : "pill-warning"
              }`}
            >
              <Activity size={13} /> Backend API:{" "}
              {loading && !health
                ? "Checking..."
                : isBackendDisconnected
                ? "Disconnected (Unavailable)"
                : health.status === "healthy"
                ? "Connected (Healthy)"
                : `Degraded (${health.database})`}
            </span>
            <span
              className={`hcp-integration-pill ${
                isBackendDisconnected || !health?.ml_model_loaded ? "pill-disconnected" : ""
              }`}
            >
              <Cpu size={13} /> ML Model:{" "}
              {isBackendDisconnected
                ? "Unavailable (Backend Offline)"
                : health?.ml_model_loaded
                ? "Loaded (Binary Crash Classifier)"
                : "Not Loaded"}
            </span>
            <span
              className={`hcp-integration-pill ${
                isBackendDisconnected
                  ? "pill-disconnected"
                  : (analytics?.actual_member4_routes_count ?? 0) > 0
                  ? ""
                  : "pill-warning"
              }`}
            >
              <Navigation size={13} /> Member 4 Routing:{" "}
              {isBackendDisconnected
                ? "Disconnected"
                : (analytics?.actual_member4_routes_count ?? 0) > 0
                ? `${analytics.actual_member4_routes_count} Actual Road Route(s) (${analytics?.simulated_routes_count ?? 0} Simulated)`
                : "Simulated Fallback Mode (Awaiting Member 4 Route Push)"}
            </span>
          </div>
          <h2>Hospital Coordination, Lifecycle & E2E Integration Center</h2>
          <p>
            Trauma reception coordination, route/ETA boundary inspection, experimental sensor telemetry, simulated notification logs & lifecycle tracking.
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
            className="hcp-btn hcp-btn-secondary"
            onClick={handleExplicitLoadDemoData}
            disabled={loading || actionBusy || isBackendDisconnected}
            title="Explicitly load sample Bengaluru demo dataset into the database"
          >
            <Sparkles size={15} />
            <span>Load Demo Data</span>
          </button>
          <button
            className="hcp-btn hcp-btn-primary"
            onClick={() => setShowAddHospitalModal(true)}
            disabled={isBackendDisconnected}
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
            <h3>{analytics ? analytics.incoming_ambulances_count : incomingCases.length}</h3>
            <small>Active trauma dispatches</small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon amber">
            <Clock size={20} />
          </div>
          <div>
            <span>Average Inbound ETA</span>
            <h3>
              {analytics?.avg_eta_minutes != null ? `${analytics.avg_eta_minutes} min` : "No route data"}
            </h3>
            <small>
              {analytics?.avg_distance_km != null
                ? `Avg distance: ${analytics.avg_distance_km} km (${analytics.actual_member4_routes_count || 0} actual / ${analytics.simulated_routes_count || 0} sim)`
                : "No routes recorded yet"}
            </small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon blue">
            <Building2 size={20} />
          </div>
          <div>
            <span>Connected Trauma Hospitals</span>
            <h3>{analytics ? analytics.active_hospitals : hospitals.length}</h3>
            <small>{analytics?.completed_emergencies ?? 0} completed handovers</small>
          </div>
        </div>

        <div className="hcp-kpi-card">
          <div className="hcp-kpi-icon green">
            <Bell size={20} />
          </div>
          <div>
            <span>Simulated Notifications Logged</span>
            <h3>{analytics ? analytics.total_notifications_sent : notifications.length}</h3>
            <small>
              {analytics?.hospital_alerts_count ?? 0} Hospital · {analytics?.contact_alerts_count ?? 0} Contact (Simulated)
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
                <p>
                  {isBackendDisconnected
                    ? "Backend API is currently disconnected. Start the backend server and click Sync Live Data."
                    : cases.length === 0
                    ? "No emergency cases exist in the database yet. Demo data is not auto-seeded on load — click 'Load Demo Data' or run a single simulation scenario."
                    : "All emergency cases have been resolved or no ambulances match the selected hospital filter."}
                </p>
                <div className="hcp-empty-actions">
                  <button
                    className="hcp-btn hcp-btn-secondary"
                    onClick={handleExplicitLoadDemoData}
                    disabled={actionBusy || isBackendDisconnected}
                  >
                    <Sparkles size={15} /> Load Demo Data Explicitly
                  </button>
                  <button
                    className="hcp-btn hcp-btn-primary"
                    onClick={() => handleRunSimulation("HIGH_IMPACT_HIGHWAY_CRASH")}
                    disabled={actionBusy || isBackendDisconnected}
                  >
                    <Play size={15} /> Simulate Single Crash Scenario
                  </button>
                </div>
              </div>
            ) : (
              <div className="hcp-inbound-list">
                {incomingCases.map((em) => {
                  const triage = em.patient_details?.triage_level || "HIGH";
                  const isSelected = selectedCase?.id === em.id;
                  const nextTransition = NEXT_STATUS_TRANSITION[em.status];
                  const isSimRoute = em.is_route_simulated !== false;

                  return (
                    <div
                      key={em.id}
                      className={`hcp-inbound-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedCaseId(em.id)}
                    >
                      <div className="hcp-inbound-top">
                        <div className="hcp-case-ident">
                          <span className="hcp-case-code">{em.case_code}</span>
                          <span
                            className={`hcp-triage-badge ${triage.toLowerCase()}`}
                            title="Experimental sensor-derived severity indicator — NOT clinically validated medical triage"
                          >
                            EXP. SENSOR SEVERITY: {triage}
                          </span>
                          <span className={`hcp-status-pill status-${em.status.toLowerCase()}`}>
                            {em.status.replace("_", " ")}
                          </span>
                        </div>
                        <div
                          className={`hcp-eta-badge ${isSimRoute ? "eta-simulated" : "eta-actual"}`}
                          title={em.route_type_label}
                        >
                          <Clock size={14} />
                          <strong>
                            {isSimRoute ? "Sim. ETA" : "Member 4 ETA"}{" "}
                            {em.eta_minutes ? `${em.eta_minutes} min` : "Pending"}
                          </strong>
                          {em.distance_km && <span>({em.distance_km} km)</span>}
                          <span className="hcp-route-tag">
                            {isSimRoute ? "SIMULATED ROUTE" : "ACTUAL ROUTE"}
                          </span>
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
              {hospitals.length === 0 ? (
                <div className="hcp-empty-inline">
                  No partner hospitals registered yet. Click &ldquo;Register Hospital&rdquo; or &ldquo;Load Demo Data&rdquo; to populate facilities.
                </div>
              ) : (
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
              )}
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
                    <p>AI/ML Binary Crash Detection, Experimental Kinematics Indicators & Coordination</p>
                  </div>
                  <span
                    className={`hcp-triage-badge ${(
                      selectedCase.patient_details?.triage_level || "HIGH"
                    ).toLowerCase()}`}
                    title="Experimental sensor-derived severity indicator — NOT clinically validated medical triage"
                  >
                    EXP. SENSOR SEVERITY: {selectedCase.patient_details?.triage_level || "HIGH"}
                  </span>
                </div>

                {/* Medical Triage Disclaimer Note */}
                <div className="hcp-disclaimer-note">
                  <AlertTriangle size={14} />
                  <span>
                    <strong>Experimental Sensor Indicator:</strong>{" "}
                    {selectedCase.patient_details?.severity_disclaimer ||
                      "Severity level is derived from vehicle accelerometer G-force, speed drop (Δv) and binary ML crash probability. It is an experimental indicator and NOT clinically validated medical triage."}
                  </span>
                </div>

                {/* Patient & Crash Telemetry Grid */}
                <div className="hcp-telemetry-grid">
                  <div className="hcp-telemetry-box">
                    <small>ML BINARY ACCIDENT PROBABILITY</small>
                    <h4>
                      {selectedCase.patient_details
                        ? `${(selectedCase.patient_details.accident_probability * 100).toFixed(1)}%`
                        : "N/A"}
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
                    <h4>
                      {selectedCase.patient_details?.peak_g_force != null
                        ? `${selectedCase.patient_details.peak_g_force} G`
                        : "N/A"}
                    </h4>
                    <span>3-Axis Accelerometer</span>
                  </div>

                  <div className="hcp-telemetry-box">
                    <small>DECELERATION (ΔV)</small>
                    <h4>
                      {selectedCase.patient_details?.speed_drop_kmh != null
                        ? `${selectedCase.patient_details.speed_drop_kmh} km/h`
                        : "N/A"}
                    </h4>
                    <span>
                      Peak: {selectedCase.patient_details?.peak_speed_kmh ?? "N/A"} km/h
                    </span>
                  </div>

                  <div className="hcp-telemetry-box">
                    <small>VEHICLE PROFILE</small>
                    <h4 style={{ textTransform: "uppercase" }}>
                      {selectedCase.patient_details?.vehicle_size || "N/A"}
                    </h4>
                    <span>
                      {selectedCase.patient_details?.gyro_is_hd ? "HD Gyro Telemetry" : "Standard Gyro"}
                    </span>
                  </div>
                </div>

                {/* Route & ETA Status Bar */}
                <div
                  className={`hcp-eta-banner ${
                    selectedCase.is_route_simulated !== false ? "banner-simulated" : "banner-actual"
                  }`}
                >
                  <div>
                    <small>
                      {selectedCase.is_route_simulated !== false
                        ? "⚠️ SIMULATED / FALLBACK ROUTE & ETA (NOT ACTUAL MEMBER 4 ROUTING)"
                        : "✅ ACTUAL MEMBER 4 ROAD-NETWORK ROUTING"}
                    </small>
                    <h4>
                      {selectedCase.is_route_simulated !== false ? "Simulated ETA: " : "Actual Route ETA: "}
                      {selectedCase.eta_minutes ? `${selectedCase.eta_minutes} Minutes` : "Pending"} ·{" "}
                      Distance: {selectedCase.distance_km ? `${selectedCase.distance_km} km` : "N/A"}
                    </h4>
                    <span>
                      {selectedCase.route_type_label || "Simulated Estimate"} · Source:{" "}
                      <strong>{selectedCase.route_source || "HAVERSINE_ESTIMATE"}</strong>
                    </span>
                  </div>
                  <button
                    className="hcp-btn hcp-btn-secondary"
                    onClick={() => setActiveSubTab("lifecycle")}
                  >
                    <Activity size={14} /> View Full Lifecycle
                  </button>
                </div>

                {/* Member 4 Routing Module Integration Boundary Form */}
                <form className="hcp-coord-form" onSubmit={handlePostMember4Route}>
                  <div className="hcp-form-header-row">
                    <h4>
                      <Navigation size={16} /> Member 4 Routing Module Boundary (
                      <code>POST /api/routing/{selectedCase.id}</code>)
                    </h4>
                    <span
                      className={`hcp-route-tag ${
                        selectedCase.is_route_simulated !== false ? "tag-sim" : "tag-actual"
                      }`}
                    >
                      {selectedCase.is_route_simulated !== false ? "SIMULATED FALLBACK" : "MEMBER 4 ROUTE ACTIVE"}
                    </span>
                  </div>
                  <p className="hcp-form-subnote">
                    Distinguish simulated fallback estimates from actual road-network routing pushed by Member 4&apos;s module.
                  </p>
                  <div className="hcp-form-row">
                    <div className="hcp-form-group">
                      <label>Road Distance (km)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={member4RouteForm.distance_km}
                        onChange={(e) =>
                          setMember4RouteForm({ ...member4RouteForm, distance_km: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="hcp-form-group">
                      <label>Calculated ETA (min)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        value={member4RouteForm.estimated_duration_minutes}
                        onChange={(e) =>
                          setMember4RouteForm({
                            ...member4RouteForm,
                            estimated_duration_minutes: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="hcp-form-group">
                      <label>Routing Source Identifier</label>
                      <select
                        value={member4RouteForm.source}
                        onChange={(e) =>
                          setMember4RouteForm({ ...member4RouteForm, source: e.target.value })
                        }
                      >
                        <option value="MEMBER_4_OSMNX_ROUTING">
                          MEMBER_4_OSMNX_ROUTING (Actual Module)
                        </option>
                        <option value="MEMBER_4_ROUTING_MODULE">
                          MEMBER_4_ROUTING_MODULE (Actual Module)
                        </option>
                        <option value="SIMULATED_HAVERSINE_FALLBACK">
                          SIMULATED_HAVERSINE_FALLBACK (Simulated)
                        </option>
                      </select>
                    </div>
                  </div>
                  <div className="hcp-form-check-row">
                    <button
                      type="button"
                      className="hcp-btn hcp-btn-secondary"
                      onClick={handleGenerateMockRoute}
                      disabled={actionBusy}
                    >
                      Generate Dev Mock Route (Simulated)
                    </button>
                    <button type="submit" className="hcp-btn hcp-btn-primary" disabled={actionBusy}>
                      <Navigation size={14} /> Apply Member 4 Route Calculation
                    </button>
                  </div>
                </form>

                {/* Hospital Assignment & Pre-Arrival Notification Form */}
                <form className="hcp-coord-form" onSubmit={handleTriggerHospitalAlert}>
                  <div className="hcp-form-header-row">
                    <h4>
                      <Building2 size={16} /> Hospital Pre-Arrival Alert & Trauma Assignment
                    </h4>
                    <span className="hcp-sim-pill">SIMULATED / RECORDED NOTIFICATION</span>
                  </div>
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
                      <span>Also record simulated alert for demo placeholder contact</span>
                    </label>

                    <button type="submit" className="hcp-btn hcp-btn-primary" disabled={actionBusy}>
                      <Send size={14} /> Record Simulated Pre-Arrival Alert
                    </button>
                  </div>
                </form>

                {/* Demo Emergency Contacts Alert Form */}
                <form className="hcp-coord-form" onSubmit={handleTriggerContactAlert}>
                  <div className="hcp-form-header-row">
                    <h4>
                      <Users size={16} /> Emergency Contact Notification (Demo Placeholders)
                    </h4>
                    <span className="hcp-demo-data-pill">DEMO PLACEHOLDER CONTACTS</span>
                  </div>
                  <p className="hcp-form-subnote">
                    Preset contacts below are hardcoded demo placeholders for testing — not real registered patient contacts. All alerts are recorded as simulated events.
                  </p>

                  <div className="hcp-registered-pills">
                    {(selectedCase.patient_details?.registered_contacts || []).map((c, idx) => (
                      <button
                        type="button"
                        key={idx}
                        className="hcp-contact-preset-pill"
                        onClick={() =>
                          setContactForm({
                            contact_name: c.name,
                            relationship: c.relationship,
                            phone_or_channel: c.contact,
                            custom_message: "",
                          })
                        }
                        title={c.data_label || "Demo Placeholder Contact"}
                      >
                        <UserCheck size={13} /> [DEMO] {c.name} · {c.contact}
                      </button>
                    ))}
                  </div>

                  <div className="hcp-form-row">
                    <div className="hcp-form-group">
                      <label>Contact Name (Demo / Custom)</label>
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
                      <label>Phone / Alert Channel (Simulated)</label>
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
                      placeholder="Optional custom message (leave blank for simulated hospital & ETA brief)"
                      value={contactForm.custom_message}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, custom_message: e.target.value })
                      }
                    />
                    <button type="submit" className="hcp-btn hcp-btn-secondary" disabled={actionBusy}>
                      <Bell size={14} /> Record Simulated Contact Alert
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
            {cases.length === 0 ? (
              <div className="hcp-empty-inline">
                No emergency cases recorded yet. Click &ldquo;Load Demo Data&rdquo; in the top bar or run a simulation scenario.
              </div>
            ) : (
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
            )}
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
                  <h4>
                    Simulated Case Notification & Telemetry Audit Log ({selectedCase.notifications?.length || 0} recorded events)
                  </h4>
                  {(selectedCase.notifications || []).length === 0 ? (
                    <div className="hcp-empty-inline">
                      No simulated notifications recorded for this case yet.
                    </div>
                  ) : (
                    <div className="hcp-log-table-wrap">
                      <table className="hcp-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Event Type</th>
                            <th>Recipient</th>
                            <th>Message</th>
                            <th>Delivery Mode / Status</th>
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
                                <span className="hcp-delivery-tag">
                                  {n.is_simulated ? `SIMULATED / RECORDED (${n.delivery_status})` : n.delivery_status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hcp-empty-state">
                <Activity size={36} />
                <h4>No Emergency Case Available</h4>
                <p>
                  {isBackendDisconnected
                    ? "Backend is disconnected. Start the backend server to inspect lifecycle timelines."
                    : "No emergency cases exist in the database. Use 'Load Demo Data' or run an E2E simulation to inspect the 6-stage lifecycle."}
                </p>
                <button
                  className="hcp-btn hcp-btn-secondary"
                  onClick={handleExplicitLoadDemoData}
                  disabled={actionBusy || isBackendDisconnected}
                >
                  <Sparkles size={15} /> Load Demo Data
                </button>
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
              <h3>Simulated / Recorded Emergency Notifications Log</h3>
              <p>
                All notifications below are simulated and recorded in the database for prototype coordination — no live SMS, cellular calls, or external hospital pages are transmitted.
              </p>
            </div>
            <div className="hcp-filter-pills">
              {["ALL", "HOSPITAL_ALERT", "EMERGENCY_CONTACT", "DISPATCH_NOTICE"].map((t) => (
                <button
                  key={t}
                  className={`hcp-pill-btn ${notifTypeFilter === t ? "active" : ""}`}
                  onClick={() => setNotifTypeFilter(t)}
                >
                  {t === "ALL" ? "All Simulated Alerts" : t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="hcp-disclaimer-note">
            <Bell size={14} />
            <span>
              <strong>Simulated Delivery Notice:</strong> Notifications in this MVP are recorded events (
              <code>is_simulated: true</code>, <code>SIMULATED_DELIVERED</code>). Actual carrier SMS/push delivery is not implemented.
            </span>
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="hcp-empty-state">
              <Bell size={36} />
              <h4>No Simulated Notifications Recorded</h4>
              <p>
                {isBackendDisconnected
                  ? "Backend API is disconnected. Unable to load notification records."
                  : "No notifications match the current filter, or no emergency events have been triggered yet."}
              </p>
              {cases.length === 0 && !isBackendDisconnected && (
                <button
                  className="hcp-btn hcp-btn-secondary"
                  onClick={handleExplicitLoadDemoData}
                  disabled={actionBusy}
                >
                  <Sparkles size={15} /> Load Demo Data
                </button>
              )}
            </div>
          ) : (
            <div className="hcp-log-table-wrap">
              <table className="hcp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Case</th>
                    <th>Type</th>
                    <th>Recipient (Hospital / Demo Contact / Unit)</th>
                    <th>Recorded Alert Content</th>
                    <th>Delivery Mode</th>
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
                        <span className="hcp-delivery-tag">
                          {n.is_simulated ? `SIMULATED / RECORDED (${n.delivery_status})` : n.delivery_status}
                        </span>
                      </td>
                      <td>{formatTimestamp(n.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              {!analytics || (analytics.total_emergencies ?? 0) === 0 ? (
                <div className="hcp-empty-state">
                  <TrendingUp size={32} />
                  <h4>No Emergency Lifecycle Data Available</h4>
                  <p>
                    {isBackendDisconnected
                      ? "Backend is disconnected — analytics cannot be retrieved."
                      : "No emergencies have been created yet. Load demo data or run a simulation to view status distribution."}
                  </p>
                </div>
              ) : (
                <div className="hcp-bars-list">
                  {Object.entries(analytics.status_breakdown || {}).map(([st, count]) => {
                    const total = Math.max(1, analytics.total_emergencies || 1);
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
              )}
            </div>

            <div className="hcp-card">
              <h3>AI/ML Detection & Operational Metrics Log</h3>
              <p className="hcp-muted-sub">Live database-derived metrics (no hardcoded values)</p>
              {!analytics ? (
                <div className="hcp-empty-state">
                  <Activity size={32} />
                  <h4>Analytics Unavailable</h4>
                  <p>Connect to the backend server to view live operational analytics.</p>
                </div>
              ) : (
                <div className="hcp-metrics-stack">
                  <div className="hcp-metric-row">
                    <span>Total Vehicle Sensor Events Evaluated</span>
                    <strong>{analytics.total_accidents_evaluated}</strong>
                  </div>
                  <div className="hcp-metric-row">
                    <span>Positive Crash Detections (Above 0.3356 Threshold)</span>
                    <strong className="text-red">{analytics.detected_accidents}</strong>
                  </div>
                  <div className="hcp-metric-row">
                    <span>Normal Driving Telemetry Blocked by Safeguard</span>
                    <strong className="text-green">{analytics.normal_driving_events}</strong>
                  </div>
                  <div className="hcp-metric-row">
                    <span>Average Hospital Handover Resolution Time</span>
                    <strong className="text-blue">
                      {analytics.avg_resolution_minutes != null
                        ? `${analytics.avg_resolution_minutes} min`
                        : "No completed cases yet"}
                    </strong>
                  </div>
                  <div className="hcp-metric-row">
                    <span>Routing Breakdown (Member 4 Actual vs. Simulated)</span>
                    <strong>
                      {analytics.actual_member4_routes_count ?? 0} Actual /{" "}
                      {analytics.simulated_routes_count ?? 0} Simulated
                    </strong>
                  </div>
                  <div className="hcp-metric-row">
                    <span>Ambulance Fleet Utilization</span>
                    <strong>
                      {analytics.assigned_ambulances} Assigned / {analytics.available_ambulances} Available
                    </strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Complete Response History & Operational Logs Table */}
          <div className="hcp-card">
            <div className="hcp-card-header">
              <div>
                <h3>Complete Emergency Response History & Audit Logs</h3>
                <p>Historical and active incident records with binary ML probability, experimental sensor severity, route source & timestamps</p>
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

            {filteredHistoryCases.length === 0 ? (
              <div className="hcp-empty-state">
                <FileText size={36} />
                <h4>No Emergency History Records Available</h4>
                <p>
                  {isBackendDisconnected
                    ? "Backend is disconnected — unable to fetch response history."
                    : cases.length === 0
                    ? "No emergency records exist in the database yet. Click 'Load Demo Data' or trigger an E2E simulation."
                    : `No emergency records match the status filter '${historyStatusFilter}'.`}
                </p>
              </div>
            ) : (
              <div className="hcp-log-table-wrap">
                <table className="hcp-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Exp. Sensor Severity</th>
                      <th>ML Prob</th>
                      <th>Peak Impact</th>
                      <th>Ambulance</th>
                      <th>Destination Hospital</th>
                      <th>Route / ETA & Source</th>
                      <th>Status</th>
                      <th>Created / Completed</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryCases.map((c) => {
                      const isSimRoute = c.is_route_simulated !== false;
                      return (
                        <tr key={c.id}>
                          <td>
                            <strong className="hcp-case-code">{c.case_code}</strong>
                          </td>
                          <td>
                            <span
                              className={`hcp-triage-badge ${(
                                c.patient_details?.triage_level || "HIGH"
                              ).toLowerCase()}`}
                              title="Experimental sensor-derived severity indicator — NOT clinically validated medical triage"
                            >
                              EXP: {c.patient_details?.triage_level || "HIGH"}
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
                            {c.eta_minutes ? (
                              <div>
                                <strong>
                                  {c.eta_minutes}m ({c.distance_km}km)
                                </strong>
                                <div className="hcp-sub-route-type">
                                  {isSimRoute ? "Simulated Estimate" : "Actual Member 4 Route"}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                Execute live cross-module tests verifying Member 3 (Random Forest Binary ML), Member 2 (Validation & Haversine Dispatch), Member 4 (Routing & ETA Boundary) and Member 5 (Simulated Hospital Pre-Arrival & Demo Contact Alerts).
              </p>
            </div>
            <button
              className="hcp-btn hcp-btn-secondary"
              onClick={handleExplicitLoadDemoData}
              disabled={actionBusy || isBackendDisconnected}
            >
              <Sparkles size={15} /> Load Full Demo Dataset
            </button>
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
                  <span>4. Simulated Route ETA</span>
                  <span>5. Recorded Hospital & Demo Contact Alert</span>
                </div>
                <button
                  className="hcp-btn hcp-btn-primary hcp-btn-full"
                  onClick={() => handleRunSimulation(sc.key)}
                  disabled={actionBusy || isBackendDisconnected}
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
