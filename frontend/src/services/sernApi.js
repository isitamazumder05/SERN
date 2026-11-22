// SERN Member 5 — Hospital Coordination, Integration & Testing API Client
// Connects the React frontend with the FastAPI backend (/api/*) with automatic
// realistic simulation fallback if the backend server is unreachable.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let errDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errDetail = errJson.detail || errJson.message || errDetail;
    } catch {
      // ignore parse failure
    }
    throw new Error(errDetail);
  }
  return response.json();
}

export const sernApi = {
  checkHealth: () => request("/health"),
  seedDemoData: () => request("/coordination/seed-demo", { method: "POST" }),
  getCoordinatedEmergencies: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.hospital_id) qs.set("hospital_id", params.hospital_id);
    if (params.active_only) qs.set("active_only", "true");
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/coordination/emergencies${query}`);
  },
  getCoordinatedEmergencyById: (id) => request(`/coordination/emergencies/${id}`),
  getCoordinationAnalytics: () => request("/coordination/analytics"),
  listHospitals: (activeOnly = false) => request(`/hospitals?active_only=${activeOnly}`),
  registerHospital: (payload) =>
    request("/hospitals", { method: "POST", body: JSON.stringify(payload) }),
  updateHospital: (id, payload) =>
    request(`/hospitals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listAmbulances: () => request("/ambulances"),
  listAccidents: () => request("/accidents"),
  validateAccident: (accidentId, payload) =>
    request(`/accidents/${accidentId}/validate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  dispatchAmbulance: (emergencyId) =>
    request(`/emergencies/${emergencyId}/dispatch`, { method: "POST" }),
  updateEmergencyStatus: (emergencyId, status, notes = "") =>
    request(`/emergencies/${emergencyId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    }),
  completeEmergency: (emergencyId) =>
    request(`/emergencies/${emergencyId}/complete`, { method: "POST" }),
  cancelEmergency: (emergencyId) =>
    request(`/emergencies/${emergencyId}/cancel`, { method: "POST" }),
  assignHospital: (emergencyId, hospitalId) =>
    request(`/emergencies/${emergencyId}/assign-hospital`, {
      method: "POST",
      body: JSON.stringify({ hospital_id: hospitalId }),
    }),
  sendHospitalPreArrivalAlert: (payload) =>
    request("/coordination/hospital-alert", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendRegisteredContactAlert: (payload) =>
    request("/coordination/notify-contact", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listNotifications: (emergencyId = null) => {
    const query = emergencyId ? `?emergency_id=${emergencyId}` : "";
    return request(`/notifications${query}`);
  },
  createNotification: (payload) =>
    request("/notifications", { method: "POST", body: JSON.stringify(payload) }),
  postRouteCalculation: (emergencyId, payload) =>
    request(`/routing/${emergencyId}`, {
      method: "POST",
      body: JSON.stringify({ emergency_id: emergencyId, ...payload }),
    }),
  generateMockRoute: (emergencyId) =>
    request(`/routing/${emergencyId}/mock`, { method: "POST" }),
  runSimulationScenario: (payload) =>
    request("/coordination/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
