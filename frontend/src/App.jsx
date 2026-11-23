import LandingPage from "./LandingPage";
import "./LandingPage.css";
import RegisterPage from "./RegisterPage";
import "./RegisterPage.css";
import LoginPage from "./LoginPage";
import "./LoginPage.css";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ProfilePage from "./ProfilePage";
import "./ProfilePage.css";
import ReportsPage from "./ReportsPage";
import AnalyticsPage from "./AnalyticsPage";
import HospitalCoordinationPage from "./components/HospitalCoordinationPage";
import { sernApi } from "./services/sernApi";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, Ambulance, Bell, Building2,
  Car, Clock, LayoutDashboard, MapPin, Menu, Navigation,
  ShieldCheck, Siren, Users, X,Sun,Moon,FileText,TrendingUp
} from "lucide-react";
import "./App.css";

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Accident Alerts", icon: AlertTriangle },
  { name: "Ambulances", icon: Ambulance },
  { name: "Traffic", icon: Car },
  { name: "Hospitals", icon: Building2 },
  { name: "Emergency History", icon: Clock },
  { name: "Reports", icon: FileText },
  { name: "Analytics", icon: TrendingUp },
  { name: "Profile", icon: Users },
];

const alerts = [
  { id: "EMG-1024", type: "Road Accident", location: "MG Road, Bengaluru", severity: "Critical", time: "2 min ago" },
  { id: "EMG-1023", type: "Vehicle Collision", location: "Indiranagar, Bengaluru", severity: "High", time: "8 min ago" },
  { id: "EMG-1022", type: "Medical Emergency", location: "Whitefield, Bengaluru", severity: "Medium", time: "15 min ago" },
];

const ambulances = [
  { id: "AMB-01", location: "MG Road", status: "Dispatched" },
  { id: "AMB-02", location: "Indiranagar", status: "Available" },
  { id: "AMB-03", location: "Whitefield", status: "Available" },
];


// PASTE THE NEW COMPONENT HERE


function EmergencyMap() {
  const locations = [
    {
      position: [12.975, 77.605],
      name: "AMB-01",
      type: "Ambulance",
      status: "Dispatched",
    },
    {
      position: [12.978, 77.640],
      name: "AMB-02",
      type: "Ambulance",
      status: "Available",
    },
    {
      position: [12.969, 77.620],
      name: "EMG-1024",
      type: "Accident",
      status: "Critical",
    },
    {
      position: [12.982, 77.600],
      name: "City Hospital",
      type: "Hospital",
      status: "Available",
    },
  ];

  const getMarkerColor = (location) => {
    if (location.type === "Accident") return "#ef4444";
    if (location.type === "Hospital") return "#22c55e";
    if (location.status === "Dispatched") return "#f59e0b";
    return "#3b82f6";
  };

  return (
    <MapContainer
      center={[12.9716, 77.5946]}
      zoom={13}
      scrollWheelZoom={true}
      style={{ height: "310px", width: "100%", borderRadius: "9px" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {locations.map((location) => {
        const color = getMarkerColor(location);

        const customIcon = L.divIcon({
          className: "",
          html: `<div style="
            width: 20px;
            height: 20px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 6px #0008;
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        return (
          <Marker
            key={location.name}
            position={location.position}
            icon={customIcon}
          >
            <Popup>
              <strong>{location.name}</strong>
              <br />
              Type: {location.type}
              <br />
              Status: {location.status}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}


// YOUR EXISTING APP COMPONENT STARTS HERE

function App() {
  const [activePage , setActivePage] = useState("Dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [showLanding, setShowLanding] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);

  useEffect(() => {
    let active = true;
    sernApi
      .checkHealth()
      .then((res) => {
        if (active) setBackendHealth(res);
      })
      .catch((err) => {
        if (active) {
          setBackendHealth({
            status: "disconnected",
            database: "disconnected",
            ml_model_loaded: false,
            error: err.message,
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSystemDataUpdated = useCallback((data) => {
    if (data?.health) {
      setBackendHealth(data.health);
    }
  }, []);

  const isBackendDisconnected = !backendHealth || backendHealth.status === "disconnected";
  const isBackendHealthy = backendHealth?.status === "healthy";

  const stats = [
    { title: "Total Accidents", value: "128", change: "+12% this week", icon: Car, color: "blue" },
    { title: "Active Emergencies", value: "08", change: "3 critical alerts", icon: Siren, color: "red" },
    { title: "Available Ambulances", value: "24", change: "Out of 32 units", icon: Ambulance, color: "green" },
    { title: "Partner Hospitals", value: "16", change: "All systems connected", icon: Building2, color: "purple" },
  ];
 if (showLanding) {
  return (
    <LandingPage
      onEnterDashboard={() => {
        setShowLanding(false);
        setShowLogin(true);
      }}
    />
  );
}
if (showLogin) {
  return (
    <LoginPage
      onLogin={() => {
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
if (showRegister) {
  return (
    <RegisterPage
      onRegister={() => {
        setShowRegister(false);
        setShowLogin(true);
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
  return (
    <div className={`app-container ${theme}-theme`}>
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

        <div className="sidebar-label">MAIN MENU</div>

        <nav className="navigation">
          {menuItems.map((item) => {
            const Icon = item.icon;
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
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className={`sidebar-bottom ${isBackendDisconnected ? "status-disconnected" : ""}`}>
          <ShieldCheck size={20} />
          <div>
            <strong>{isBackendDisconnected ? "Backend Disconnected" : "System Protected"}</strong>
            <span>
              {isBackendDisconnected
                ? "API unavailable — check backend server"
                : isBackendHealthy
                ? "All services operational"
                : "Backend degraded"}
            </span>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <div className="mobile-overlay" onClick={() => setMobileMenu(false)} />
      )}

       <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setMobileMenu(true)}>
              <Menu size={23} />
            </button>
            <div>
              <h3>{activePage}</h3>
              <p>Smart Emergency Response Network</p>
            </div>
          </div>

          <div className="topbar-right">
            <div
              className={`system-status ${isBackendDisconnected ? "status-disconnected" : ""}`}
              title={
                isBackendDisconnected
                  ? "Backend API is unreachable"
                  : `Backend status: ${backendHealth?.status}`
              }
            >
              <span className={`status-dot ${isBackendDisconnected ? "dot-disconnected" : ""}`}></span>
              {isBackendDisconnected ? "Backend Disconnected" : "System Online"}
            </div>
            <button
              className="notification-button"
              title="Open Emergency Notifications Center"
              onClick={() => setActivePage("Reports")}
            >
              <Bell size={20} />
              <span className="notification-dot"></span>
            </button>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="profile">
              <div className="profile-avatar">SA</div>
              <div className="profile-info">
                <strong>System Admin</strong>
                <span>Administrator</span>
              </div>
            </div>
          </div>
        </header>
  <div className="dashboard-content">
          <section className="welcome-section">
            <div>
              <h1>Emergency Command Center</h1>
              <p>Monitor emergencies and coordinate rapid response operations.</p>
            </div>
            <div className={`live-indicator ${isBackendDisconnected ? "status-disconnected" : ""}`}>
              <span className={`status-dot ${isBackendDisconnected ? "dot-disconnected" : ""}`}></span>{" "}
              {isBackendDisconnected ? "BACKEND DISCONNECTED" : "LIVE MONITORING"}
            </div>
          </section>

          {activePage === "Dashboard" ? (
            <>
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

              <section className="main-grid">
                <div className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Emergency Location Map</h3>
                      <p>Ambulance and incident overview</p>
                    </div>
                    <span className="map-live">LIVE</span>
                  </div>

                  <div className="map-area">
                    <EmergencyMap />
                    <div className="map-note">
                       Demo locations · Bengaluru
                    </div>

                    <div className="map-legend">
                      <span>🔵 Available</span>
                      <span>🟠 Dispatched</span>
                      <span>🔴 Emergency</span>
                      <span>🟢 Hospital</span>
                    </div>
                  </div>
                </div>

                <div className="panel alerts-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent Accident Alerts</h3>
                      <p>Latest emergency reports</p>
                    </div>
                    <AlertTriangle size={21} color="#f87171" />
                  </div>

                  <div className="alert-list">
                    {alerts.map((alert) => (
                      <div className="alert-item" key={alert.id}>
                        <div className="alert-top">
                          <strong>{alert.type}</strong>
                          <span className={`severity ${alert.severity.toLowerCase()}`}>
                            {alert.severity}
                          </span>
                        </div>
                        <p><MapPin size={14} /> {alert.location}</p>
                        <div className="alert-bottom">
                          <span>{alert.id}</span>
                          <span>{alert.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="view-all" onClick={() => setActivePage("Accident Alerts")}>
                    View all alerts →
                  </button>
                </div>
              </section>

              <section className="bottom-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Ambulance Availability</h3>
                      <p>Current fleet status</p>
                    </div>
                    <Ambulance size={22} color="#60a5fa" />
                  </div>
                  {ambulances.map((amb) => (
                    <div className="ambulance-row" key={amb.id}>
                      <div className="ambulance-symbol"><Ambulance size={19} /></div>
                      <div className="ambulance-details">
                        <strong>{amb.id}</strong>
                        <span>{amb.location}</span>
                      </div>
                      <span className={`ambulance-status ${amb.status === "Available" ? "available" : "dispatched"}`}>
                        {amb.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Traffic Signal Status</h3>
                      <p>Traffic management overview</p>
                    </div>
                    <Navigation size={22} color="#fbbf24" />
                  </div>
                  <div className="traffic-row">
                    <span>MG Road Junction</span><strong className="green-text">● Green</strong>
                  </div>
                  <div className="traffic-row">
                    <span>Indiranagar Junction</span><strong className="red-text">● Red</strong>
                  </div>
                  <div className="traffic-row">
                    <span>Whitefield Junction</span><strong className="yellow-text">● Caution</strong>
                  </div>
                </div>
              </section>
            </>
          ) : (
            
activePage === "Accident Alerts" ? (
  <section className="panel alerts-page">
    <div className="panel-heading">
      <div>
        <h3>Accident Alerts</h3>
        <p>All reported emergencies in Bengaluru</p>
      </div>
      <AlertTriangle size={24} color="#f87171" />
    </div>

    <div className="alerts-list">
      {alerts.map((alert) => (
        <div className="alert-row" key={alert.id}>
          <div>
            <strong>{alert.id}</strong>
            <h4>{alert.type}</h4>
            <p>{alert.location}</p>
            <small>{alert.time}</small>
          </div>

          <span className={`severity ${alert.severity.toLowerCase()}`}>
            {alert.severity}
          </span>
        </div>
      ))}
    </div>
   </section>
) : activePage === "Ambulances" ? (
  <section className="panel ambulance-page">
    <div className="panel-heading">
      <div>
        <h3>Ambulance Management</h3>
        <p>Monitor ambulance availability and dispatch status</p>
      </div>
      <Ambulance size={25} color="#60a5fa" />
    </div>

    <div className="ambulance-cards">
      {ambulances.map((amb) => (
        <div className="ambulance-card" key={amb.id}>
          <div className="ambulance-card-top">
            <div className="ambulance-symbol">
              <Ambulance size={24} />
            </div>
            <span className={`ambulance-status ${
              amb.status === "Available" ? "available" : "dispatched"
            }`}>
              {amb.status}
            </span>
          </div>

          <h3>{amb.id}</h3>
          <p>Location: {amb.location}</p>
          <p>
            Assignment: {amb.status === "Available"
              ? "No active assignment"
              : "Emergency response"}
          </p>
        </div>
      ))}
        </div>
  </section>
) : 
activePage === "Traffic" ? (
  <section className="panel traffic-page">
    <div className="panel-heading">
      <div>
        <h3>Traffic Management</h3>
        <p>Monitor traffic signals and road conditions</p>
      </div>
      <Navigation size={25} color="#fbbf24" />
    </div>

    <div className="traffic-cards">
      <div className="traffic-card">
        <h3>MG Road Junction</h3>
        <span className="green-text">● Green</span>
        <p>Congestion: Low</p>
        <small>Emergency priority: Active</small>
      </div>

      <div className="traffic-card">
        <h3>Indiranagar Junction</h3>
        <span className="red-text">● Red</span>
        <p>Congestion: High</p>
        <small>Emergency priority: Standby</small>
      </div>

      <div className="traffic-card">
        <h3>Whitefield Junction</h3>
        <span className="yellow-text">● Caution</span>
        <p>Congestion: Medium</p>
        <small>Emergency priority: Active</small>
      </div>
    </div>
  </section>
) : activePage === "Hospitals" ? (
  <HospitalCoordinationPage initialTab="command" onSystemDataUpdated={handleSystemDataUpdated} />
) : activePage === "Emergency History" ? (
  <HospitalCoordinationPage initialTab="lifecycle" onSystemDataUpdated={handleSystemDataUpdated} />
) : activePage === "Reports" ? (
  <ReportsPage onSystemDataUpdated={handleSystemDataUpdated} />
) : activePage === "Analytics" ? (
  <AnalyticsPage onSystemDataUpdated={handleSystemDataUpdated} />
) : activePage === "Profile" ? (
  <ProfilePage />
) : (
  <section className="panel page-placeholder">
    <div className="placeholder-icon">
      {(() => {
        const item = menuItems.find((m) => m.name === activePage);
        const Icon = item?.icon || Users;
        return <Icon size={38} />;
      })()}
    </div>

    <h2>{activePage}</h2>
    <p>This module is ready for development. We'll build this screen next.</p>

    <button
      className="back-button"
      onClick={() => setActivePage("Dashboard")}
    >
      Back to Dashboard
    </button>
  </section>
))}




          <footer className="footer">
            <span>© 2026 SERN – Smart Emergency Response Network</span>
            <span>
              <span className={`status-dot ${isBackendDisconnected ? "dot-disconnected" : ""}`}></span>{" "}
              {isBackendDisconnected ? "Backend API disconnected" : "All systems operational"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
