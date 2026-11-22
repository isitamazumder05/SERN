export type RoutingMode = 'shortest' | 'fastest' | 'congestion_aware';

export type AmbulanceStatus = 'STANDBY' | 'DISPATCHED' | 'EN_ROUTE' | 'ARRIVED';

export type CongestionLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type SignalState = 'NORMAL' | 'RED' | 'GREEN' | 'RESTORED';

export type EventSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type RouteSource = 'OSRM_HYBRID' | 'GRAPH_FALLBACK';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RoadNode {
  id: string;
  name: string;
  area: string;
  coord: Coordinate;
}

export type RoadClass = 'ARTERIAL_HIGHWAY' | 'INNER_RING' | 'PRIMARY_CITY' | 'COLLECTOR';

export interface RoadSegment {
  id: string;
  name: string;
  corridor: string;
  fromNodeId: string;
  toNodeId: string;
  roadClass: RoadClass;
  baseSpeedKmh: number;
  distanceMeters: number;
  waypoints: Coordinate[];
  congestionLevel: CongestionLevel;
  congestionMultiplier: number; // 1.0 = free flow, 1.35 = LOW, 1.9 = MEDIUM, 3.2 = HIGH
}

export interface TrafficSignal {
  id: string;
  nodeId: string;
  name: string;
  corridor: string;
  coord: Coordinate;
  state: SignalState;
  onActiveRoute: boolean;
  routeDistanceMeters: number | null;
  sequenceOrder: number | null;
  distanceFromAmbulanceMeters: number | null;
  lastUpdated: string;
}

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  area: string;
  coord: Coordinate;
  emergencyBedsAvailable: number;
  icuBedsAvailable: number;
  traumaLevel: string;
  availabilityStatus: 'AVAILABLE' | 'LIMITED' | 'CRITICAL_CAPACITY';
  isSimulatedData: true;
  distanceMeters?: number;
  etaSeconds?: number;
}

export interface AccidentIncident {
  id: string;
  title: string;
  locationName: string;
  coord: Coordinate;
  severity: 'HIGH' | 'CRITICAL';
  reportedAt: string;
  nearestNodeId: string;
}

export interface ReferenceLocation {
  id: string;
  name: string;
  shortName: string;
  address: string;
  coord: Coordinate;
}

export interface DijkstraStepNode {
  nodeId: string;
  name: string;
  area: string;
  coord: Coordinate;
  cumulativeDistanceMeters: number;
  cumulativeBaseSeconds: number;
  cumulativeWeight: number;
  predecessorNodeId: string | null;
}

export interface DijkstraEdgeStep {
  segmentId: string;
  segmentName: string;
  fromNodeId: string;
  fromNodeName: string;
  toNodeId: string;
  toNodeName: string;
  distanceMeters: number;
  baseSpeedKmh: number;
  congestionLevel: CongestionLevel;
  congestionMultiplier: number;
  edgeWeight: number;
}

export interface DijkstraTrace {
  mode: RoutingMode;
  weightMetricLabel: string;
  totalGraphNodes: number;
  totalGraphEdges: number;
  nodesEvaluated: number;
  edgesRelaxed: number;
  visitedOrderNodeIds: string[];
  pathNodes: DijkstraStepNode[];
  pathEdges: DijkstraEdgeStep[];
  graphDistanceMeters: number;
  graphDurationSeconds: number;
  totalObjectiveCost: number;
}

export interface RouteCandidate {
  id: string;
  mode: RoutingMode;
  label: string;
  corridorSummary: string;
  geometry: Coordinate[];
  distanceMeters: number;
  baseDurationSeconds: number;
  adjustedDurationSeconds: number;
  averageSpeedKmh: number;
  congestionPenaltySeconds: number;
  affectedSegments: string[];
  traversedNodeIds: string[];
  traversedSegmentIds: string[];
  source: RouteSource;
  algorithmUsed: string;
  dijkstraTrace?: DijkstraTrace;
}

export interface RouteExplanation {
  headline: string;
  selectionReason: string;
  congestionSummary: string;
  alternativesSummary: string;
  rerouteReason: string | null;
}

export interface RerouteComparison {
  triggeredAt: string;
  reason: string;
  affectedRoadName: string;
  congestionLevel: CongestionLevel;
  previousRoute: RouteCandidate;
  newRoute: RouteCandidate;
  timeSavedSeconds: number;
  distanceDeltaMeters: number;
}

export interface AmbulanceTelemetry {
  id: string;
  callSign: string;
  unitType: string;
  status: AmbulanceStatus;
  startLocationName: string;
  startCoord: Coordinate;
  currentCoord: Coordinate;
  bearingDegrees: number;
  currentSpeedKmh: number;
  distanceCoveredMeters: number;
  remainingDistanceMeters: number;
  totalDistanceMeters: number;
  etaSeconds: number;
  completionPercent: number;
  speedMultiplier: number;
  isPaused: boolean;
  dispatchedAt: string | null;
  arrivedAt: string | null;
}

export interface GreenCorridorSummary {
  enabled: boolean;
  status: 'INACTIVE' | 'ACTIVE_PRIORITIZATION' | 'CLEARED';
  totalRouteSignals: number;
  activatedCount: number;
  awaitingCount: number;
  restoredCount: number;
  activeSignalId: string | null;
  activeSignalName: string | null;
  nextSignalName: string | null;
  nextSignalDistanceMeters: number | null;
  activationRadiusMeters: number;
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  description: string;
  status: string;
  severity: EventSeverity;
  category: 'DISPATCH' | 'ROUTING' | 'SIMULATION' | 'GREEN_CORRIDOR' | 'TRAFFIC';
}

export interface SernSystemSnapshot {
  scenarioName: string;
  referenceLocation: ReferenceLocation;
  incident: AccidentIncident;
  selectedHospitalId: string;
  selectedMode: RoutingMode;
  autoRerouteEnabled: boolean;
  dataDisclaimer: string;
  isRoutingLoading: boolean;
  lastError: string | null;
  ambulance: AmbulanceTelemetry;
  activeRoute: RouteCandidate | null;
  previousRoute: RouteCandidate | null;
  routeCandidates: Record<RoutingMode, RouteCandidate | null>;
  rerouteComparison: RerouteComparison | null;
  routeExplanation: RouteExplanation | null;
  hospitals: Hospital[];
  signals: TrafficSignal[];
  roadSegments: RoadSegment[];
  greenCorridor: GreenCorridorSummary;
  events: EventLogEntry[];
}
