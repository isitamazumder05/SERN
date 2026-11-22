# SERN SMART ROUTING

**Intelligent Multi-Level Accident Detection and Autonomous Ambulance Dispatch System with Dynamic Routing and Traffic Signal Control**  
**Subsystem:** Routing and Intelligent Traffic Management

---

## Overview

SERN SMART ROUTING is an interactive emergency dispatch, **Dijkstra shortest-path route optimization**, dynamic congestion-aware rerouting, and software-based Green Corridor traffic signal preemption application centered on **RNS Institute of Technology (RNSIT), Rajarajeshwari Nagar (RR Nagar), Bengaluru, Karnataka, India** using **OpenStreetMap**, **Leaflet**, and **OSRM road geometry snapping**.

> **Simulation & Scope Disclosure:**  
> - **Geographic Anchor:** The demonstration map centers on **RNSIT Campus (`12.9011° N, 77.5181° E`)** on Dr. Vishnuvardhan Road, Channasandra, RR Nagar, Bengaluru 560098, with a simulated demonstration accident near the RNSIT Main Gate approach, a simulated ambulance starting point nearby in Channasandra, and 5 real surrounding Bengaluru hospitals (**SPARSH Hospital RR Nagar**, **BGS Gleneagles Global Hospital Kengeri**, **Vasavi Hospital Kumaraswamy Layout**, **Sagar Hospitals Banashankari**, and **Fortis Hospital Nagarbhavi**).  
> - **Genuine Algorithm:** Route selection (`shortest`, `fastest`, and `congestion_aware`) is computed directly by **Dijkstra's shortest-path algorithm** (`src/core/graphRouter.ts`) over a 24-node, 35-corridor (70 directed edges) RR Nagar & Southwest Bengaluru intersection graph.  
> - **OSRM Role:** Once Dijkstra selects and reconstructs the optimal node sequence, OSRM (`src/core/osrmService.ts`) snaps those ordered intersection waypoints onto OpenStreetMap street curves. If OSRM is unreachable, the system falls back seamlessly to local graph polyline coordinates.  
> - **Simulated Telemetry:** Ambulance GPS coordinates, instantaneous speeds, traffic congestion levels, signal preemption states, and hospital emergency/ICU bed counts are simulated for academic engineering demonstration and labelled as simulated throughout the UI.

---

## Project Architecture

```text
├── server.ts                          # Express REST API + 150ms simulation tick + Vite middleware
├── src/
│   ├── core/
│   │   ├── types.ts                   # Shared TypeScript interfaces, ReferenceLocation, DijkstraTrace & RouteExplanation
│   │   ├── geo.ts                     # Haversine distance, bearings, polyline interpolation
│   │   ├── bengaluruNetwork.ts        # RNSIT reference landmark, 23 RR Nagar/SW Bengaluru intersections, 32 corridors, 5 hospitals, 18 signals
│   │   ├── graphRouter.ts             # Genuine Dijkstra shortest-path algorithm & predecessor reconstruction
│   │   ├── osrmService.ts             # OSRM geometry snapping along Dijkstra node paths + graph fallback
│   │   ├── trafficEngine.ts           # Sequential distance-based Green Corridor preemption engine
│   │   ├── sernEngine.ts              # Stateful dispatch coordinator, route explanations & event timeline
│   │   └── routing.test.ts            # Unit tests (node:test via tsx)
│   ├── services/
│   │   └── sernApi.ts                 # Typed frontend REST API client
│   └── components/
│       ├── Sidebar.tsx                # 8-section command-center navigation
│       ├── TopBar.tsx                 # Clock, notifications, simulation playback controls
│       ├── KpiStrip.tsx               # 5 real-time KPI summary cards
│       ├── DashboardSummaryPanels.tsx # Emergency Case Summary & "Why This Route?" explanation card
│       ├── BengaluruMap.tsx           # Interactive Leaflet OpenStreetMap canvas centered on RNSIT & 60fps ambulance marker
│       ├── TelemetryPanel.tsx         # Simulated GPS telemetry & quick mode/hospital selectors
│       ├── RouteOptimizationView.tsx  # Operator route selection, map preview & comparison matrix
│       ├── SimulationView.tsx         # Start/Pause/Resume/Reset controls, speed multiplier, lifecycle
│       ├── TrafficManagementView.tsx  # Congestion injection & before/after reroute comparison
│       ├── GreenCorridorView.tsx      # Sequential signal wave, 3-lamp indicators & live signal log
│       ├── HospitalsView.tsx          # Surrounding Bengaluru hospital selection & simulated bed counts
│       └── EventLogsView.tsx          # Searchable chronological dispatch & routing audit timeline
```

---

## How Dijkstra's Algorithm Works in SERN

Every route calculation in `src/core/graphRouter.ts` (`findGraphPath`) runs the complete Dijkstra algorithm:

1. **Graph Representation:**
   - **Vertices (Nodes):** 23 RR Nagar & Southwest Bengaluru intersections (`n_ambulance_staging`, `n_rnsit_gate`, `n_channasandra_rd`, `n_beml_5th`, `n_ideal_homes`, `n_sparsh_hosp`, `n_rr_arch`, `n_srinivasapura`, `n_bgs_hosp`, `n_global_village`, `n_pattanagere`, `n_uttarahalli`, `n_hosakerehalli`, `n_nayandahalli`, etc.).
   - **Edges:** 32 bidirectional Bengaluru road segments (`64` directed edges) carrying physical length (`distanceMeters`), road class (`ARTERIAL_HIGHWAY`, `INNER_RING`, `PRIMARY_CITY`, `COLLECTOR`), posted speed (`baseSpeedKmh`), and simulated congestion multiplier.
2. **Edge Weights by Mode (`getDijkstraEdgeWeight`):**
   - **Shortest Distance (`shortest`):** `edgeWeight = distanceMeters` (minimizes physical road distance).
   - **Fastest Route (`fastest`):** `edgeWeight = (distanceMeters / (baseSpeedKmh / 3.6)) * roadClassFactor` (minimizes free-flow travel duration).
   - **Congestion-Aware (`congestion_aware`):** `edgeWeight = (distanceMeters / (baseSpeedKmh / 3.6)) * congestionMultiplier` where:
     - `NONE`: `1.00x`
     - `LOW`: `1.45x`
     - `MEDIUM`: `2.60x`
     - `HIGH`: `6.50x`
3. **Greedy Relaxation & Predecessor Reconstruction:**
   - Maintains `dist[]`, `prevNode[]`, and `prevEdge[]` maps.
   - Repeatedly visits the unvisited node with minimum tentative cost, relaxes adjacent edges, records `nodesEvaluated` and `edgesRelaxed`, and reconstructs the final path by walking `prevNode[]` backward from destination to origin.
   - Safely returns `null` (handled cleanly by API and UI) for unreachable destinations or invalid/empty node inputs.
4. **Backend Implementation Verification:**
   - The operator-facing UI intentionally presents clear, non-technical dispatch metrics and explanations, while the complete Dijkstra execution (`findGraphPath`), predecessor reconstruction (`dijkstraTrace`), and edge-case tests remain implemented in `src/core/graphRouter.ts` and verified in `src/core/routing.test.ts`.

---

## Intelligent Green Corridor Logic

The Green Corridor module (`src/core/trafficEngine.ts`) performs software-based signal preemption along the active route:

1. Projects all 18 RR Nagar / Southwest Bengaluru traffic signal intersections (`SIG-RRN-01`..`SIG-RRN-18`) onto the active route polyline (`projectPointOntoRoute`).
2. Orders route intersections strictly sequentially by route offset distance.
3. Continuously evaluates ambulance distance covered:
   - **Within 650 m ahead (and up to 140 m past):** Signal switches to **`GREEN`**.
   - **Further than 650 m ahead:** Signal remains **`RED`** (awaiting sequential approach).
   - **More than 140 m behind the ambulance:** Signal automatically reverts to **`RESTORED`**.
4. Logs every sequential transition (`SIGNAL GREEN` and `RESTORED`) into the Event Log and **Green Corridor** live transition feed.

---

## REST API Contract & Examples

All endpoints are served from `http://localhost:3000`:

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/state` | Returns complete `SernSystemSnapshot` (`referenceLocation`, ambulance, routes, Dijkstra trace, `routeExplanation`, signals, hospitals, events) |
| `POST` | `/api/route/calculate` | Executes Dijkstra for all 3 modes and snaps geometry |
| `POST` | `/api/route/reroute` | Triggers immediate congestion-aware Dijkstra rerouting |
| `POST` | `/api/simulation/start` | Starts or resumes ambulance simulation |
| `POST` | `/api/simulation/pause` | Pauses ambulance simulation |
| `POST` | `/api/simulation/reset` | Resets incident, congestion, signals, and ambulance state |
| `POST` | `/api/simulation/speed` | Updates simulation speed multiplier (`1`–`12`) |
| `POST` | `/api/traffic/congestion` | Injects simulated congestion on a segment and auto-reroutes |
| `POST` | `/api/traffic/green-corridor` | Enables or disables sequential Green Corridor preemption |
| `GET` | `/api/ambulance/status` | Returns simulated GPS coordinates, speed, ETA, and status |
| `GET` | `/api/traffic/signals` | Returns all 18 signals and 32 road segments |
| `GET` | `/api/hospitals` | Returns 5 surrounding Bengaluru demonstration hospitals with distances/ETAs |
| `GET` | `/api/events` | Returns chronological dispatch and routing milestones |

### Example Request & Response

**`POST /api/route/calculate`**
```json
{
  "hospitalId": "hosp_sparsh_rr",
  "mode": "congestion_aware",
  "fromCurrentPosition": false
}
```
Response (`200 OK`, truncated):
```json
{
  "referenceLocation": {
    "id": "ref_rnsit",
    "shortName": "RNSIT Campus",
    "coord": { "lat": 12.9011, "lng": 77.5181 }
  },
  "selectedHospitalId": "hosp_sparsh_rr",
  "selectedMode": "congestion_aware",
  "activeRoute": {
    "mode": "congestion_aware",
    "corridorSummary": "RR Nagar Main Rd -> RR Nagar Double Rd",
    "distanceMeters": 3890,
    "adjustedDurationSeconds": 392,
    "source": "OSRM_HYBRID",
    "algorithmUsed": "Dijkstra's Algorithm (Congestion-Weighted Travel Time) + OSRM Road Geometry",
    "dijkstraTrace": {
      "nodesEvaluated": 9,
      "edgesRelaxed": 17,
      "totalObjectiveCost": 318.2
    }
  }
}
```

**`POST /api/traffic/congestion`**
```json
{
  "segmentId": "seg_beml_ideal",
  "level": "HIGH"
}
```
Response returns the updated snapshot containing `rerouteComparison` (previous route vs. new Dijkstra bypass route, computed `timeSavedSeconds`, and `distanceDeltaMeters`).

---

## Installation & Running Locally

### Prerequisites
- **Node.js 20 LTS or newer**
- **npm**

### Quick Start
```bash
npm install
npm test
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### Production Build & Start
```bash
npm run build
npm start
```

---

## Known Limitations
- **Simulated Sensor & Traffic Feeds:** Accident detection, ambulance GPS telemetry, road congestion multipliers, and hospital bed availability are software-simulated rather than connected to live municipal IoT/hospital APIs.
- **Software-Only Signal Control:** Green Corridor preemption updates virtual signal states in memory and does not interface with physical traffic signal controllers.
- **Public OSRM Rate Limits:** Street-level geometry snapping relies on the public `router.project-osrm.org` demo server; if rate-limited or offline, the application automatically switches to local Bengaluru graph geometry (`GRAPH_FALLBACK`).
