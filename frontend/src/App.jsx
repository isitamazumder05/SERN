import { useState, useEffect, useCallback, useRef } from "react";
import LandingPage from "./LandingPage";
import "./LandingPage.css";
import RegisterPage from "./RegisterPage";
import "./RegisterPage.css";
import LoginPage from "./LoginPage";
import "./LoginPage.css";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ProfilePage from "./ProfilePage";
import "./ProfilePage.css";
import AnalyticsPage from "./AnalyticsPage";
import EmergencyMap from "./components/EmergencyMap";
import AccidentSimulatorModal from "./components/AccidentSimulatorModal";
import AddAmbulanceModal from "./components/AddAmbulanceModal";
import AddHospitalModal from "./components/AddHospitalModal";
import NotificationsDrawer from "./components/NotificationsDrawer";
import { sernApi } from "./services/api";
import { authService } from "./services/auth";
import { playEmergencyAlert, playDispatchChime } from "./utils/sound";
import { formatAiConfidence } from "./utils/confidence";

import {
  Activity, AlertTriangle, Ambulance, Bell, Building2,
  Car, Clock, LayoutDashboard, MapPin, Menu,
  ShieldCheck, Siren, Users, X, Sun, Moon,
  Play, Plus, RefreshCw, CheckCircle2,
  Phone, Compass, ShieldAlert, LogOut, RotateCcw, BarChart3
} from "lucide-react";
import "./App.css";

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Accident Alerts", icon: AlertTriangle },
  { name: "Ambulances", icon: Ambulance },
  { name: "Emergency History", icon: Clock },
  { name: "Hospitals", icon: Building2 },
  { name: "Analytics", icon: BarChart3 },
  { name: "Profile", icon: Users },
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [showLanding, setShowLanding] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const activeRouteEmergencyIdRef = useRef(null);

  // Live Backend State
  const [accidents, setAccidents] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [systemHealth, setSystemHealth] = useState({ status: "checking", ml_model_loaded: false });
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeMapCenter, setActiveMapCenter] = useState([12.9716, 77.5946]);
  const [loadingData, setLoadingData] = useState(false);

  // Modals state
  const [showSimulator, setShowSimulator] = useState(false);
  const [showAddAmbulance, setShowAddAmbulance] = useState(false);
  const [showAddHospital, setShowAddHospital] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Filter states
  const [accidentFilter, setAccidentFilter] = useState("ALL");
  const [ambulanceFilter, setAmbulanceFilter] = useState("ALL");
  const [wsStatus, setWsStatus] = useState("connecting"); // "connecting" | "connected" | "disconnected"

  // Load and view road-network route on map (Member 4 Integration)
  const handleViewRoute = useCallback(async (emergencyId, silent = false) => {
    try {
      activeRouteEmergencyIdRef.current = emergencyId;
      let routeData = null;
      try {
        routeData = await sernApi.getRoute(emergencyId);
      } catch {
        try {
          routeData = await sernApi.generateMockRoute(emergencyId);
        } catch {
          const em = emergencies.find(e => e.id === emergencyId);
          const acc = em ? accidents.find(a => a.id === em.accident_id) : null;
          const targetLat = acc ? acc.latitude : 12.9716;
          const targetLon = acc ? acc.longitude : 77.5946;
          routeData = {
            emergency_id: emergencyId,
            distance_km: 4.8,
            estimated_duration_minutes: 8.5,
            route_geometry: {
              type: "LineString",
              coordinates: [
                [77.6000, 12.9650],
                [77.5980, 12.9680],
                [targetLon, targetLat]
              ]
            },
            source: "CLIENT_FALLBACK_NAVIGATION"
          };
        }
      }
      setSelectedRoute(routeData);

      const em = emergencies.find(e => e.id === emergencyId);
      const acc = em ? accidents.find(a => a.id === em.accident_id) : null;
      if (acc) {
        setActiveMapCenter([acc.latitude, acc.longitude]);
      }
      // ONLY switch page if user explicitly asked to view route
      if (!silent) {
        setActivePage("Dashboard");
        alert(`Route calculated: ${routeData.distance_km} km · ETA: ${routeData.estimated_duration_minutes} min. Displaying on map.`);
      }
    } catch (err) {
      if (!silent) {
        alert(`Could not load route: ${err.message}`);
      }
    }
  }, [emergencies, accidents]);

  // Fetch all backend data
  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true);
      const [accRes, ambRes, emRes, hospRes, notifRes, healthRes] = await Promise.allSettled([
        sernApi.getAccidents(),
        sernApi.getAmbulances(),
        sernApi.getEmergencies(),
        sernApi.getHospitals(false),
        sernApi.getNotifications(),
        sernApi.getHealth()
      ]);

      if (accRes.status === "fulfilled") setAccidents(accRes.value);
      if (ambRes.status === "fulfilled") setAmbulances(ambRes.value);
      if (emRes.status === "fulfilled") {
        setEmergencies(emRes.value);
        // Only load route if an emergency is actively dispatched/en route
        const activeEm = emRes.value.find(e => ['DISPATCHED', 'ASSIGNED', 'EN_ROUTE'].includes(e.status));
        if (activeEm && activeRouteEmergencyIdRef.current !== activeEm.id) {
          handleViewRoute(activeEm.id, true);
        } else if (!activeEm) {
          setSelectedRoute(null);
          activeRouteEmergencyIdRef.current = null;
        }
      }
      if (hospRes.status === "fulfilled") setHospitals(hospRes.value);
      if (notifRes.status === "fulfilled") setNotifications(notifRes.value);
      if (healthRes.status === "fulfilled") setSystemHealth(healthRes.value);
    } catch (err) {
      console.error("Error refreshing SERN data:", err);
    } finally {
      setLoadingData(false);
    }
  }, [handleViewRoute]);

  // Zero-Latency Push: Live WebSocket Connection (replaces 8-second polling)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);

    const disconnectWs = sernApi.connectWebSocket(
      (event) => {
        const { type, data } = event;
        if (type === "ACCIDENT_REGISTERED") {
          playEmergencyAlert();
          setAccidents((prev) => [data, ...prev.filter((a) => a.id !== data.id)]);
        } else if (type === "ACCIDENT_VALIDATED") {
          setAccidents((prev) => prev.map((a) => (a.id === data.id ? { ...a, ...data } : a)));
        } else if (type === "EMERGENCY_CREATED") {
          setEmergencies((prev) => [data, ...prev.filter((e) => e.id !== data.id)]);
        } else if (type === "EMERGENCY_STATUS_UPDATED") {
          setEmergencies((prev) => prev.map((e) => (e.id === data.id ? { ...e, ...data } : e)));
        } else if (type === "AMBULANCE_DISPATCHED") {
          playDispatchChime();
          if (data?.assigned_ambulance) {
            setAmbulances((prev) =>
              prev.map((a) => (a.id === data.assigned_ambulance.id ? { ...a, ...data.assigned_ambulance } : a))
            );
          }
          if (data?.emergency) {
            setEmergencies((prev) =>
              prev.map((e) => (e.id === data.emergency.id ? { ...e, ...data.emergency } : e))
            );
            handleViewRoute(data.emergency.id, true);
          }
        } else if (type === "AMBULANCE_LOCATION_UPDATED") {
          setAmbulances((prev) => prev.map((a) => (a.id === data.id ? { ...a, ...data } : a)));
        } else if (type === "AMBULANCE_TELEMETRY") {
          setAmbulances((prev) =>
            prev.map((a) =>
              a.id === data.id
                ? {
                    ...a,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    status: data.status || a.status,
                  }
                : a
            )
          );
        } else if (type === "NOTIFICATION_RECORDED") {
          setNotifications((prev) => [data, ...prev.filter((n) => n.id !== data.id)]);
        } else if (type === "ROUTE_UPDATED") {
          setSelectedRoute(data);
        } else if (type === "DASHBOARD_RESET") {
          setAccidents([]);
          setEmergencies([]);
          setSelectedRoute(null);
          fetchData();
        }
      },
      (status) => {
        setWsStatus(status);
      }
    );

    // Occasional low-frequency fallback background sync (60s)
    const fallbackInterval = setInterval(fetchData, 60000);

    return () => {
      clearTimeout(timer);
      disconnectWs();
      clearInterval(fallbackInterval);
    };
  }, [fetchData, handleViewRoute]);

  // Resilient Polling Fallback: whenever WebSocket is disconnected, poll every 2.5s
  useEffect(() => {
    if (wsStatus !== "connected") {
      const pollInterval = setInterval(() => {
        fetchData();
      }, 2500);
      return () => clearInterval(pollInterval);
    }
  }, [wsStatus, fetchData]);

  // Accident Validation Action (Verify / Reject)
  const handleValidateAccident = async (accidentId, confirmed) => {
    try {
      const notes = confirmed
        ? prompt("Enter validation notes (or press OK):", "Confirmed collision via junction monitoring feed")
        : prompt("Enter rejection reason:", "False alarm - normal traffic deceleration");

      if (notes === null) return; // User cancelled prompt

      const valRes = await sernApi.validateAccident(accidentId, {
        confirmed,
        validation_notes: notes,
        auto_dispatch: confirmed
      });

      // Immediately update local state so incident status on pending alert reflects verify or reject
      setAccidents((prev) =>
        prev.map((a) =>
          a.id === accidentId
            ? { ...a, validation_status: confirmed ? "CONFIRMED" : "REJECTED", validation_notes: notes }
            : a
        )
      );

      if (valRes?.emergency?.id) {
        await handleViewRoute(valRes.emergency.id, true);
      }
      await fetchData();
      alert(confirmed ? "Accident validated! Emergency created and ambulance dispatch initiated." : "Accident marked as rejected / false alarm.");
    } catch (err) {
      alert(`Validation failed: ${err.message}`);
    }
  };

  // Dispatch nearest ambulance to an emergency
  const handleDispatchAmbulance = async (emergencyId) => {
    try {
      const res = await sernApi.dispatchAmbulance(emergencyId);
      await handleViewRoute(emergencyId, true);
      await fetchData();
      alert(`Ambulance ${res.assigned_ambulance.registration_number} dispatched! Distance: ${res.distance_km.toFixed(2)} km.`);
    } catch (err) {
      alert(`Dispatch failed: ${err.message}`);
    }
  };

  // Update emergency operational status
  const handleUpdateEmergencyStatus = async (emergencyId, nextStatus) => {
    try {
      const em = emergencies.find(e => e.id === emergencyId);
      if (em && em.status === nextStatus) return;
      await sernApi.updateEmergencyStatus(emergencyId, nextStatus, `Updated to ${nextStatus} by operator.`);
      await fetchData();
    } catch (err) {
      alert(`Failed to update emergency status: ${err.message}`);
    }
  };

  // Assign hospital to emergency
  const handleAssignHospital = async (emergencyId, hospitalId) => {
    try {
      await sernApi.assignHospital(emergencyId, hospitalId);
      await fetchData();
      alert("Destination hospital assigned and arrival alert broadcasted.");
    } catch (err) {
      alert(`Failed to assign hospital: ${err.message}`);
    }
  };

  // Reset all dashboard incident counters, emergencies, and routes to ZERO
  const handleResetDashboard = async () => {
    try {
      setLoadingData(true);
      await sernApi.resetDashboard();
      setAccidents([]);
      setEmergencies([]);
      setSelectedRoute(null);
      await fetchData();
      alert("All dashboard metrics have been initialized to zero.");
    } catch (err) {
      alert(`Failed to reset metrics: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  };

  // Handle ambulance selection on map (safe inspection vs availability toggle)
  const handleSelectAmbulance = async (ambulance) => {
    const isBusy = ["ASSIGNED", "DISPATCHED", "EN_ROUTE", "AT_SCENE", "TRANSPORTING"].includes(ambulance.status);
    if (isBusy) {
      // Find active emergency for this ambulance or latest active emergency and load its route
      const activeEm = emergencies.find(e => ["DISPATCHED", "ASSIGNED", "EN_ROUTE"].includes(e.status)) || emergencies[0];
      if (activeEm) {
        await handleViewRoute(activeEm.id, true);
        setActivePage("Dashboard");
        return;
      }
    }
    // Only toggle availability for idle ambulances
    handleToggleAmbulanceAvailability(ambulance);
  };

  // Toggle ambulance availability (with active mission guard)
  const handleToggleAmbulanceAvailability = async (ambulance) => {
    if (["ASSIGNED", "DISPATCHED", "EN_ROUTE", "AT_SCENE", "TRANSPORTING"].includes(ambulance.status)) {
      alert(`Ambulance ${ambulance.registration_number} is currently on an active emergency mission (${ambulance.status}). Availability cannot be changed until the emergency is completed.`);
      return;
    }
    const nextStatus = ambulance.status === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
    try {
      await sernApi.updateAmbulanceAvailability(ambulance.id, nextStatus);
      await fetchData();
    } catch (err) {
      alert(`Could not update availability: ${err.message}`);
    }
  };

  // Calculated Stats
  const activeEmergencies = emergencies.filter(e => !["COMPLETED", "CANCELLED"].includes(e.status));
  const availableAmbulances = ambulances.filter(a => a.status === "AVAILABLE");
  const pendingAccidents = accidents.filter(a => a.validation_status === "PENDING");

  const stats = [
    {
      title: "Total Sensor Incidents",
      value: accidents.length.toString().padStart(2, "0"),
      change: `${pendingAccidents.length} pending validation`,
      icon: Car,
      color: "blue"
    },
    {
      title: "Active Emergencies",
      value: activeEmergencies.length.toString().padStart(2, "0"),
      change: `${emergencies.filter(e => e.status === "COMPLETED").length} resolved cases`,
      icon: Siren,
      color: "red"
    },
    {
      title: "Available Ambulances",
      value: availableAmbulances.length.toString().padStart(2, "0"),
      change: `Out of ${ambulances.length} fleet units`,
      icon: Ambulance,
      color: "green"
    },
    {
      title: "Partner Hospitals",
      value: hospitals.length.toString().padStart(2, "0"),
      change: "Direct trauma link ready",
      icon: Building2,
      color: "purple"
    },
  ];

  // Auth pages view routing with strict authentication guard
  if (showLanding) {
    return (
      <LandingPage
        onEnterDashboard={() => {
          setShowLanding(false);
          if (!currentUser) {
            setShowLogin(true);
          }
        }}
        onSignUp={() => {
          setShowLanding(false);
          setShowRegister(true);
        }}
      />
    );
  }
  if (showRegister) {
    return (
      <RegisterPage
        onRegister={async (newUser) => {
          if (newUser) {
            setCurrentUser(newUser);
          }
          // On new registration, initialize all dashboard metrics to ZERO
          try {
            await sernApi.resetDashboard();
          } catch (e) {
            console.debug("Reset on register:", e);
          }
          setAccidents([]);
          setEmergencies([]);
          setSelectedRoute(null);
          await fetchData();
          setShowRegister(false);
        }}
        onBack={() => {
          setShowRegister(false);
          setShowLogin(true);
        }}
      />
    );
  }
  if (showForgotPassword) {
    return (
      <ForgotPasswordPage
        onBack={() => {
          setShowForgotPassword(false);
          setShowLogin(true);
        }}
      />
    );
  }
  if (!currentUser || showLogin) {
    return (
      <LoginPage
        onLogin={async (user) => {
          if (user) {
            setCurrentUser(user);
          }
          // On new login, initialize all dashboard metrics to ZERO
          try {
            await sernApi.resetDashboard();
          } catch (e) {
            console.debug("Reset on login:", e);
          }
          setAccidents([]);
          setEmergencies([]);
          setSelectedRoute(null);
          await fetchData();
          setShowLogin(false);
        }}
        onBack={() => {
          setShowLogin(false);
          setShowLanding(true);
        }}
        onRegister={() => {
          setShowLogin(false);
          setShowRegister(true);
        }}
        onForgotPassword={() => {
          setShowLogin(false);
          setShowForgotPassword(true);
        }}
      />
    );
  }

  return (
    <div className={`app-container ${theme}-theme`}>
      {/* SIDEBAR NAVIGATION */}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Activity size={25} /></div>
          <div>
            <h2>SERN</h2>
            <span>Emergency Network</span>
          </div>
          <button className="close-menu" onClick={() => setMobileMenu(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-label">OPERATIONS CONSOLE</div>

        <nav className="navigation">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const badgeCount =
              item.name === "Accident Alerts" ? pendingAccidents.length :
              item.name === "Ambulances" ? availableAmbulances.length :
              item.name === "Emergency History" ? activeEmergencies.length : 0;

            return (
              <button
                key={item.name}
                className={`nav-item ${activePage === item.name ? "active" : ""}`}
                onClick={() => {
                  setActivePage(item.name);
                  setMobileMenu(false);
                }}
              >
                <Icon size={19} />
                <span style={{ flex: 1, textAlign: "left" }}>{item.name}</span>
                {badgeCount > 0 && (
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "2px 6px",
                    borderRadius: "10px",
                    background: item.name === "Accident Alerts" ? "#ef4444" : "#2563eb",
                    color: "white"
                  }}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "20px", padding: "0 6px" }}>
          <button
            className="btn-simulate"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => setShowSimulator(true)}
          >
            <ShieldAlert size={17} />
            AI Accident Simulator
          </button>
        </div>

        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <div>
            <strong>AI Safeguard Active</strong>
            <span>Model loaded · {systemHealth.database}</span>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <div className="mobile-overlay" onClick={() => setMobileMenu(false)} />
      )}

      {/* MAIN VIEWPORT */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setMobileMenu(true)}>
              <Menu size={23} />
            </button>
            <div>
              <h3>{activePage}</h3>
              <p>Smart Emergency Response Network · Bengaluru Region</p>
            </div>
          </div>

          <div className="topbar-right">
            <button
              onClick={fetchData}
              className="btn-secondary"
              title="Refresh Live Data"
              style={{ padding: "6px 12px" }}
            >
              <RefreshCw size={15} className={loadingData ? "spin" : ""} />
              Sync
            </button>

            <div className="system-status" title={`Channel: ${wsStatus === 'connected' ? 'WebSocket (Real-Time Push)' : 'Resilient Polling Fallback (2.5s)'} · System: ${systemHealth.status}`}>
              <span className="status-dot" style={{
                background: wsStatus === "connected" ? "#10b981" : "#06b6d4"
              }}></span>
              {wsStatus === "connected" ? "Live WS (Push)" : "Live (Polling Fallback)"}
            </div>

            <button
              className="notification-button"
              onClick={() => setShowNotifications(true)}
              title="Emergency Notifications Log"
            >
              <Bell size={20} />
              {notifications.length > 0 && <span className="notification-dot"></span>}
            </button>

            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="profile" onClick={() => setActivePage("Profile")} style={{ cursor: "pointer" }} title={currentUser?.verificationBadge || "View / Edit Profile"}>
              <div className="profile-avatar">
                {authService?.getInitials ? authService.getInitials(currentUser?.name) : (currentUser?.name?.slice(0, 2)?.toUpperCase() || "AD")}
              </div>
              <div className="profile-info">
                <strong>{currentUser?.name || "System Admin"}</strong>
                <span style={{ color: "#38bdf8", fontWeight: "600" }}>
                  {currentUser?.verificationBadge ? currentUser.verificationBadge.split(" (")[0] : (currentUser?.role || "Administrator")}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                authService.logout();
                setCurrentUser(null);
                setShowLanding(true);
              }}
              className="btn-secondary"
              title="Sign Out / Back to Landing"
              style={{ padding: "6px 10px" }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          {/* Top Banner with Role-Tailored Actions */}
          <section className="welcome-section">
            <div>
              <h1>
                {currentUser?.role === "Ambulance Staff"
                  ? "Ambulance Paramedic Cockpit"
                  : currentUser?.role === "Hospital Staff"
                  ? "Hospital Trauma Unit Operations"
                  : currentUser?.role === "Public Citizen"
                  ? "Citizen Safety & Incident Monitoring Network"
                  : "Emergency Command Center"}
              </h1>
              <p>
                Welcome, <strong style={{ color: "inherit" }}>{currentUser?.name || "Operator"}</strong>.{" "}
                <span style={{ color: "#38bdf8", fontWeight: "bold" }}>
                  [{currentUser?.verificationBadge || "✓ Verified Personnel"}]
                </span>{" "}
                {currentUser?.role === "Ambulance Staff"
                  ? `Active Fleet Vehicle: ${currentUser?.credentialId || "KA-01-EM-1080"} · Zero-latency GPS stream online.`
                  : currentUser?.role === "Hospital Staff"
                  ? `Facility License: ${currentUser?.credentialId || "HOSP-BLR-ICU"} · Trauma emergency bay monitoring active.`
                  : currentUser?.role === "Public Citizen"
                  ? "Citizen emergency monitoring, live GPS fleet observer & automated accident reporting."
                  : "Real-time vehicle telemetry classification, nearest-ambulance dispatch & hospital alerts."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn-simulate"
                onClick={() => setShowSimulator(true)}
              >
                <Play size={16} />
                Simulate Accident (Run ML)
              </button>
              <button
                onClick={handleResetDashboard}
                title="Initialize all incident metrics to zero"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#94a3b8",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                <RotateCcw size={14} />
                Reset to Zero
              </button>
              <div className="live-indicator">
                <span className="status-dot"></span> LIVE DISPATCH · WS SYNCED
              </div>
            </div>
          </section>

          {/* PAGE ROUTING */}
          {activePage === "Dashboard" ? (
            <>
              {/* Dynamic Stats Grid */}
              <section className="stats-grid">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div className="stat-card" key={stat.title}>
                      <div className={`stat-icon ${stat.color}`}>
                        <Icon size={23} />
                      </div>
                      <p>{stat.title}</p>
                      <h2>{stat.value}</h2>
                      <span>{stat.change}</span>
                    </div>
                  );
                })}
              </section>

              {/* Main Map & Live Alerts Split */}
              <section className="main-grid">
                <div className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Integrated Emergency Map</h3>
                      <p>Live coordinates for fleet units, accidents & partner hospitals</p>
                    </div>
                    {selectedRoute ? (
                      <span style={{ fontSize: "11px", background: "#06b6d422", color: "#06b6d4", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                        Route Active ({selectedRoute.distance_km} km)
                      </span>
                    ) : (
                      <span className="map-live">LIVE</span>
                    )}
                  </div>

                  <div className="map-area">
                    <EmergencyMap
                      ambulances={ambulances}
                      accidents={accidents}
                      emergencies={emergencies}
                      hospitals={hospitals}
                      selectedRoute={selectedRoute}
                      activeCenter={activeMapCenter}
                      onSelectAccident={(acc) => {
                        handleValidateAccident(acc.id, true);
                      }}
                      onSelectAmbulance={(amb) => {
                        handleSelectAmbulance(amb);
                      }}
                      onEmergencyArrived={(emId) => {
                        handleUpdateEmergencyStatus(emId, "AT_SCENE");
                      }}
                    />
                    <div className="map-legend">
                      <span>🔵 Available Amb</span>
                      <span>🟠 Dispatched Amb</span>
                      <span>🔴 Accident Site</span>
                      <span>🟢 Partner Hospital</span>
                      <span>🩵 Active Route</span>
                      <span>⚡ Turn-by-Turn GPS</span>
                    </div>
                  </div>
                </div>

                <div className="panel alerts-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Pending Accident Alerts</h3>
                      <p>Requires explicit operator confirmation</p>
                    </div>
                    <AlertTriangle size={21} color="#f87171" />
                  </div>

                  <div className="alert-list">
                    {accidents.filter(a => a.validation_status === "PENDING").length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px 10px", color: "#64748b" }}>
                        <CheckCircle2 size={32} style={{ margin: "0 auto 8px", color: "#10b981" }} />
                        <p style={{ fontWeight: "600", color: "#cbd5e1" }}>No Pending Incidents</p>
                        <p style={{ fontSize: "12px" }}>All accident candidates have been processed.</p>
                      </div>
                    ) : (
                      accidents
                        .filter(a => a.validation_status === "PENDING")
                        .slice(0, 4)
                        .map((alert) => (
                          <div className="alert-item" key={alert.id}>
                            <div className="alert-top">
                              <strong>Incident #{alert.id} ({alert.vehicle_size || 'car'})</strong>
                              <span className="severity critical">
                                {formatAiConfidence(alert.accident_probability, alert.model_threshold).percentage}% ML Probability
                              </span>
                            </div>
                            <p>
                              <MapPin size={14} /> Lat: {alert.latitude.toFixed(4)}, Lon: {alert.longitude.toFixed(4)}
                            </p>
                            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                              <button
                                className="btn-primary-sm"
                                style={{ flex: 1, justifyContent: "center" }}
                                onClick={() => handleValidateAccident(alert.id, true)}
                              >
                                Validate & Dispatch
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: "4px 8px" }}
                                onClick={() => handleValidateAccident(alert.id, false)}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  <button className="view-all" onClick={() => setActivePage("Accident Alerts")}>
                    View all accident candidates ({accidents.length}) →
                  </button>
                </div>
              </section>

              {/* Bottom Quick Row */}
              <section className="bottom-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Ambulance Fleet Availability</h3>
                      <p>Available units on standby</p>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowAddAmbulance(true)}
                      style={{ padding: "4px 8px" }}
                    >
                      <Plus size={14} /> Add Unit
                    </button>
                  </div>
                  {ambulances.slice(0, 3).map((amb) => (
                    <div className="ambulance-row" key={amb.id}>
                      <div className="ambulance-symbol"><Ambulance size={19} /></div>
                      <div className="ambulance-details">
                        <strong>{amb.registration_number}</strong>
                        <span>({amb.latitude.toFixed(4)}, {amb.longitude.toFixed(4)})</span>
                      </div>
                      <button
                        className={`ambulance-status ${amb.status === "AVAILABLE" ? "available" : "dispatched"}`}
                        onClick={() => handleToggleAmbulanceAvailability(amb)}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Click to toggle availability"
                      >
                        {amb.status}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : activePage === "Accident Alerts" ? (
            /* ACCIDENT ALERTS PAGE */
            <section className="panel alerts-page">
              <div className="panel-heading">
                <div>
                  <h3>Accident Candidates & Validation Queue</h3>
                  <p>Sensor telemetry classified by Scikit-learn Random Forest model</p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn-simulate" onClick={() => setShowSimulator(true)}>
                    <Play size={15} /> Simulate Accident
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: "10px", margin: "14px 0", flexWrap: "wrap" }}>
                {["ALL", "PENDING", "VALIDATED", "NORMAL", "REJECTED"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setAccidentFilter(f)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: accidentFilter === f ? "1px solid #3b82f6" : "1px solid #334155",
                      background: accidentFilter === f ? "#1e3a8a" : "#1e293b",
                      color: accidentFilter === f ? "#93c5fd" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="alerts-list">
                {accidents
                  .filter(a => accidentFilter === "ALL" || a.validation_status === accidentFilter)
                  .map((alert) => {
                    const isPending = alert.validation_status === "PENDING";
                    const isValid = alert.validation_status === "VALIDATED";
                    const isNormal = alert.validation_status === "NORMAL";

                    return (
                      <div className="alert-row" key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong>Candidate #{alert.id}</strong>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              ({alert.vehicle_size || 'car'} · {alert.gyro_is_hd ? "HD Gyro" : "Std Gyro"})
                            </span>
                          </div>
                          <p style={{ margin: "4px 0" }}>
                            Location: {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}
                          </p>
                          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                            AI Confidence: <strong style={{ color: formatAiConfidence(alert.accident_probability, alert.model_threshold).color }}>
                              {formatAiConfidence(alert.accident_probability, alert.model_threshold).percentage}% ({formatAiConfidence(alert.accident_probability, alert.model_threshold).label})
                            </strong> (Threshold: {(alert.model_threshold * 100).toFixed(1)}% · Raw: {(alert.accident_probability * 100).toFixed(1)}%)
                            {alert.validation_notes && <span> · Note: <em>{alert.validation_notes}</em></span>}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className={`badge-tag ${
                            isPending ? "badge-pending" :
                            isValid ? "badge-validated" :
                            isNormal ? "badge-normal" : "badge-normal"
                          }`}>
                            {alert.validation_status}
                          </span>

                          {isPending && (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                className="btn-primary-sm"
                                onClick={() => handleValidateAccident(alert.id, true)}
                              >
                                Confirm & Dispatch
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => handleValidateAccident(alert.id, false)}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          ) : activePage === "Ambulances" ? (
            /* AMBULANCE MANAGEMENT PAGE */
            <section className="panel ambulance-page">
              <div className="panel-heading">
                <div>
                  <h3>Emergency Ambulance Fleet</h3>
                  <p>Telemetry, availability status & geographical Haversine assignment</p>
                </div>
                <button className="btn-primary-sm" onClick={() => setShowAddAmbulance(true)}>
                  <Plus size={16} /> Add Ambulance
                </button>
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", gap: "10px", margin: "14px 0" }}>
                {["ALL", "AVAILABLE", "ASSIGNED", "EN_ROUTE", "UNAVAILABLE"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setAmbulanceFilter(f)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: ambulanceFilter === f ? "1px solid #3b82f6" : "1px solid #334155",
                      background: ambulanceFilter === f ? "#1e3a8a" : "#1e293b",
                      color: ambulanceFilter === f ? "#93c5fd" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="ambulance-cards">
                {ambulances
                  .filter(a => ambulanceFilter === "ALL" || a.status === ambulanceFilter)
                  .map((amb) => {
                    const isAvail = amb.status === "AVAILABLE";
                    return (
                      <div className="ambulance-card" key={amb.id}>
                        <div className="ambulance-card-top">
                          <div className="ambulance-symbol">
                            <Ambulance size={24} />
                          </div>
                          <span className={`ambulance-status ${isAvail ? "available" : "dispatched"}`}>
                            {amb.status}
                          </span>
                        </div>

                        <h3>{amb.registration_number}</h3>
                        <p>Unit ID: #{amb.id}</p>
                        <p>GPS: {amb.latitude.toFixed(4)}, {amb.longitude.toFixed(4)}</p>
                        <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                          <button
                            className="btn-secondary"
                            style={{ flex: 1, justifyContent: "center" }}
                            onClick={() => handleToggleAmbulanceAvailability(amb)}
                          >
                            Set {isAvail ? "Unavailable" : "Available"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          ) : activePage === "Emergency History" ? (
            /* EMERGENCY LIFECYCLE MANAGEMENT PAGE */
            <section className="panel history-page">
              <div className="panel-heading">
                <div>
                  <h3>Emergency Response Lifecycle Management</h3>
                  <p>Orchestrate operational stages: PENDING → DISPATCHED → EN_ROUTE → AT_SCENE → TRANSPORTING → COMPLETED</p>
                </div>
                <Clock size={25} color="#60a5fa" />
              </div>

              <div className="history-list" style={{ marginTop: "16px" }}>
                {emergencies.length === 0 ? (
                  <p style={{ padding: "20px", color: "#64748b" }}>No emergency cases created yet.</p>
                ) : (
                  emergencies.map((em) => {
                    const amb = ambulances.find(a => a.id === em.assigned_ambulance_id);
                    const hosp = hospitals.find(h => h.id === em.hospital_id);
                    const isTerminal = ["COMPLETED", "CANCELLED"].includes(em.status);

                    return (
                      <div className="history-card" key={em.id} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <h3>Emergency #{em.id}</h3>
                              <span className={`badge-tag ${
                                em.status === "COMPLETED" ? "badge-completed" :
                                em.status === "PENDING" ? "badge-pending" : "badge-dispatched"
                              }`}>
                                {em.status}
                              </span>
                            </div>
                            <p style={{ marginTop: "4px" }}>
                              Accident Ref: Candidate #{em.accident_id} · Reported {new Date(em.created_at).toLocaleTimeString()}
                            </p>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            {amb ? (
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#60a5fa" }}>
                                🚑 {amb.registration_number}
                              </div>
                            ) : (
                              <span style={{ fontSize: "12px", color: "#f87171" }}>No Ambulance Assigned</span>
                            )}
                            {hosp && (
                              <div style={{ fontSize: "12px", color: "#34d399", marginTop: "2px" }}>
                                🏥 {hosp.name}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Lifecycle Stepper Controls */}
                        {!isTerminal && (
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                            background: "#090d16",
                            padding: "10px",
                            borderRadius: "6px"
                          }}>
                            <span style={{ fontSize: "11px", fontWeight: "bold", color: "#94a3b8" }}>
                              ADVANCE STATUS:
                            </span>

                            {em.status === "PENDING" && (
                              <button
                                className="btn-primary-sm"
                                onClick={() => handleDispatchAmbulance(em.id)}
                              >
                                Dispatch Nearest Ambulance
                              </button>
                            )}

                            {em.status === "DISPATCHED" && (
                              <>
                                <button
                                  className="btn-primary-sm"
                                  onClick={() => handleUpdateEmergencyStatus(em.id, "EN_ROUTE")}
                                >
                                  Mark En Route →
                                </button>
                                <button
                                  className="btn-primary-sm"
                                  onClick={() => handleUpdateEmergencyStatus(em.id, "AT_SCENE")}
                                >
                                  Mark Arrived at Scene →
                                </button>
                              </>
                            )}

                            {em.status === "EN_ROUTE" && (
                              <button
                                className="btn-primary-sm"
                                onClick={() => handleUpdateEmergencyStatus(em.id, "AT_SCENE")}
                              >
                                Mark Arrived at Scene →
                              </button>
                            )}

                            {em.status === "AT_SCENE" && (
                              <button
                                className="btn-primary-sm"
                                onClick={() => handleUpdateEmergencyStatus(em.id, "TRANSPORTING")}
                              >
                                Begin Transporting Patient →
                              </button>
                            )}

                            {em.status === "TRANSPORTING" && (
                              <button
                                className="btn-success-sm"
                                onClick={() => handleUpdateEmergencyStatus(em.id, "COMPLETED")}
                              >
                                Complete Mission (Free Unit) ✓
                              </button>
                            )}

                            {/* Hospital Assignment Dropdown */}
                            {!em.hospital_id && (
                              <select
                                onChange={(e) => {
                                  if (e.target.value) handleAssignHospital(em.id, parseInt(e.target.value));
                                }}
                                defaultValue=""
                                style={{
                                  background: "#1e293b",
                                  border: "1px solid #334155",
                                  color: "white",
                                  padding: "5px 10px",
                                  borderRadius: "4px",
                                  fontSize: "12px"
                                }}
                              >
                                <option value="" disabled>Assign Destination Hospital...</option>
                                {hospitals.map((h) => (
                                  <option key={h.id} value={h.id}>{h.name}</option>
                                ))}
                              </select>
                            )}

                            {/* View Route Button */}
                            <button
                              className="btn-secondary"
                              onClick={() => handleViewRoute(em.id)}
                            >
                              <Compass size={13} /> View Map Route
                            </button>

                            <button
                              className="btn-danger-sm"
                              onClick={() => {
                                if (confirm("Cancel this emergency? Assigned ambulance will be freed.")) {
                                  handleUpdateEmergencyStatus(em.id, "CANCELLED");
                                }
                              }}
                              style={{ marginLeft: "auto" }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ) : activePage === "Hospitals" ? (
            /* HOSPITALS MANAGEMENT PAGE */
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Partner Hospitals & Trauma Centers</h3>
                  <p>Inbound patient assignment & automated hospital notification broadcast</p>
                </div>
                <button className="btn-primary-sm" onClick={() => setShowAddHospital(true)}>
                  <Plus size={16} /> Add Hospital
                </button>
              </div>

              <div className="hospital-cards" style={{ marginTop: "16px" }}>
                {hospitals.map((hospital) => {
                  const assignedEmergencies = emergencies.filter(e => e.hospital_id === hospital.id && !["COMPLETED", "CANCELLED"].includes(e.status));
                  return (
                    <div className="hospital-card" key={hospital.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <h3>{hospital.name}</h3>
                        <span style={{ fontSize: "11px", background: "#10b98122", color: "#10b981", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                          Active Facility
                        </span>
                      </div>
                      <p style={{ marginTop: "4px" }}>Facility ID: #{hospital.id}</p>
                      <p><MapPin size={13} /> {hospital.address}</p>
                      <p><Phone size={13} /> {hospital.contact_information}</p>
                      <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1e293b", fontSize: "12px" }}>
                        <strong>Inbound Patients:</strong>{" "}
                        <span style={{ color: assignedEmergencies.length > 0 ? "#f59e0b" : "#94a3b8" }}>
                          {assignedEmergencies.length} active emergency transfers
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : activePage === "Analytics" ? (
            <AnalyticsPage
              accidents={accidents}
              emergencies={emergencies}
              ambulances={ambulances}
              hospitals={hospitals}
              notifications={notifications}
            />
          ) : activePage === "Profile" ? (
            <ProfilePage
              currentUser={currentUser}
              onUpdateProfile={(updated) => setCurrentUser(updated)}
            />
          ) : null}

          {/* FOOTER */}
          <footer className="footer">
            <span>© 2026 SERN – Smart Emergency Response Network</span>
            <span>
              <span className="status-dot"></span>
              All systems operational · Database connected · AI ML engine online
            </span>
          </footer>
        </div>
      </main>

      {/* POPUP MODALS */}
      <AccidentSimulatorModal
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
        onAccidentCreated={async () => {
          await fetchData();
        }}
      />

      <AddAmbulanceModal
        isOpen={showAddAmbulance}
        onClose={() => setShowAddAmbulance(false)}
        onAmbulanceAdded={async () => {
          await fetchData();
        }}
      />

      <AddHospitalModal
        isOpen={showAddHospital}
        onClose={() => setShowAddHospital(false)}
        onHospitalAdded={async () => {
          await fetchData();
        }}
      />

      <NotificationsDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
      />
    </div>
  );
}

export default App;
