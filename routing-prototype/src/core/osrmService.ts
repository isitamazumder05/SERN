import { BENGALURU_NODES } from './bengaluruNetwork';
import { polylineDistanceMeters, projectPointOntoRoute } from './geo';
import { buildCandidateFromGraphResult, findGraphPath } from './graphRouter';
import type {
  Coordinate,
  Hospital,
  RoadSegment,
  RouteCandidate,
  RoutingMode,
} from './types';

interface OsrmStep {
  name?: string;
  distance: number;
  duration: number;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][]; // [lng, lat]
  };
  legs?: Array<{
    steps?: OsrmStep[];
  }>;
}

interface OsrmRouteResponse {
  code: string;
  routes?: OsrmRoute[];
}

interface OsrmTableResponse {
  code: string;
  distances?: number[][];
  durations?: number[][];
}

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TABLE_URL = 'https://router.project-osrm.org/table/v1/driving';

interface ParsedOsrmRoute {
  geometry: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  corridorSummary: string;
}

function extractCorridorSummaryFromSteps(route: OsrmRoute): string {
  const steps = route.legs?.flatMap((l) => l.steps ?? []) ?? [];
  const names: string[] = [];
  for (const s of steps) {
    const clean = s.name?.trim();
    if (!clean) continue;
    if (names[names.length - 1] !== clean) {
      names.push(clean);
    }
  }
  if (names.length === 0) return 'Bengaluru Road Network';
  return names.slice(0, 3).join(' -> ');
}

/**
 * Queries OSRM solely to snap an ordered list of intersection waypoints
 * onto real OpenStreetMap driving road geometry.
 */
async function fetchOsrmGeometryForWaypoints(
  waypoints: Coordinate[],
  timeoutMs = 4000
): Promise<ParsedOsrmRoute | null> {
  if (waypoints.length < 2) return null;

  // Preserve up to 22 Dijkstra node coordinates so OSRM follows the exact selected intersections
  const sampled: Coordinate[] = [];
  if (waypoints.length <= 22) {
    sampled.push(...waypoints);
  } else {
    sampled.push(waypoints[0]);
    const step = (waypoints.length - 1) / 20;
    for (let i = 1; i <= 19; i++) {
      sampled.push(waypoints[Math.round(i * step)]);
    }
    sampled.push(waypoints[waypoints.length - 1]);
  }

  const coordString = sampled.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const url = `${OSRM_ROUTE_URL}/${coordString}?overview=full&geometries=geojson&alternatives=false&steps=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;

    const r = data.routes[0];
    if (!r.geometry?.coordinates || r.geometry.coordinates.length < 2) return null;

    const geometry = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const rawDist = Math.round(r.distance);
    const polyDist = Math.round(polylineDistanceMeters(geometry));
    const distanceMeters = rawDist > 0 ? rawDist : polyDist;

    return {
      geometry,
      distanceMeters,
      durationSeconds: Math.max(1, Math.round(r.duration)),
      corridorSummary: extractCorridorSummaryFromSteps(r),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps any OSRM route geometry onto our monitored Bengaluru road segments and nodes
 * using spatial projection so congestion & green corridor signals align accurately.
 */
export function matchGeometryToNetwork(
  geometry: Coordinate[],
  segments: RoadSegment[],
  hintSegmentIds: string[] = []
): {
  traversedSegmentIds: string[];
  traversedNodeIds: string[];
  penaltySeconds: number;
  affectedSegments: string[];
} {
  const traversedSegmentSet = new Set<string>(hintSegmentIds);
  const traversedNodeSet = new Set<string>();

  for (const node of BENGALURU_NODES) {
    const proj = projectPointOntoRoute(geometry, node.coord);
    if (proj.snapDistanceMeters <= 175) {
      traversedNodeSet.add(node.id);
    }
  }

  for (const seg of segments) {
    const mid = seg.waypoints[Math.floor(seg.waypoints.length / 2)];
    const projMid = projectPointOntoRoute(geometry, mid);
    const projStart = projectPointOntoRoute(geometry, seg.waypoints[0]);
    const projEnd = projectPointOntoRoute(geometry, seg.waypoints[seg.waypoints.length - 1]);

    // Match segment only if the route geometry traverses both endpoints and midpoint
    if (
      projMid.snapDistanceMeters <= 240 &&
      projStart.snapDistanceMeters <= 240 &&
      projEnd.snapDistanceMeters <= 240
    ) {
      traversedSegmentSet.add(seg.id);
    }
  }

  let penaltySeconds = 0;
  const affectedSegments: string[] = [];

  for (const seg of segments) {
    if (!traversedSegmentSet.has(seg.id) || seg.congestionLevel === 'NONE') continue;
    const baseSec = seg.distanceMeters / Math.max(1, seg.baseSpeedKmh / 3.6);
    const extraSec = baseSec * (seg.congestionMultiplier - 1);
    penaltySeconds += extraSec;
    affectedSegments.push(`${seg.name} (${seg.congestionLevel})`);
  }

  return {
    traversedSegmentIds: Array.from(traversedSegmentSet),
    traversedNodeIds: Array.from(traversedNodeSet),
    penaltySeconds: Math.round(penaltySeconds),
    affectedSegments,
  };
}

/**
 * Evaluates simulated congestion penalties on a given geometry without mutating hint segments.
 */
export function evaluateCongestionOnGeometry(
  geometry: Coordinate[],
  segments: RoadSegment[],
  hintSegmentIds: string[] = []
): { penaltySeconds: number; affectedSegments: string[] } {
  const matched = matchGeometryToNetwork(geometry, segments, hintSegmentIds);
  return {
    penaltySeconds: matched.penaltySeconds,
    affectedSegments: matched.affectedSegments,
  };
}

function snapGraphResultWithOsrm(
  graphResult: ReturnType<typeof findGraphPath> & {},
  osrmParsed: ParsedOsrmRoute | null,
  mode: RoutingMode,
  segments: RoadSegment[]
): RouteCandidate {
  const fallback = buildCandidateFromGraphResult(graphResult, mode, 'GRAPH_FALLBACK');
  if (!osrmParsed) {
    return fallback;
  }

  const dijkstraSegmentIds = graphResult.segments.map((s) => s.id);
  const matched = matchGeometryToNetwork(osrmParsed.geometry, segments, dijkstraSegmentIds);
  const penaltySeconds = matched.penaltySeconds;
  const baseDurationSeconds = osrmParsed.durationSeconds;
  const adjustedDurationSeconds = baseDurationSeconds + penaltySeconds;
  const averageSpeedKmh =
    osrmParsed.distanceMeters > 0
      ? Number(
          ((osrmParsed.distanceMeters / 1000) / (Math.max(1, adjustedDurationSeconds) / 3600)).toFixed(
            1
          )
        )
      : fallback.averageSpeedKmh;

  const algorithmLabel =
    mode === 'shortest'
      ? "Dijkstra's Algorithm (Distance Weights) + OSRM Road Geometry"
      : mode === 'fastest'
        ? "Dijkstra's Algorithm (Free-Flow Time Weights) + OSRM Road Geometry"
        : "Dijkstra's Algorithm (Congestion-Weighted Time) + OSRM Road Geometry";

  return {
    ...fallback,
    corridorSummary: fallback.corridorSummary,
    geometry: osrmParsed.geometry,
    distanceMeters: osrmParsed.distanceMeters,
    baseDurationSeconds,
    adjustedDurationSeconds,
    averageSpeedKmh,
    congestionPenaltySeconds: penaltySeconds,
    affectedSegments:
      matched.affectedSegments.length > 0 ? matched.affectedSegments : graphResult.affectedSegments,
    traversedNodeIds: Array.from(new Set([...graphResult.nodeIds, ...matched.traversedNodeIds])),
    traversedSegmentIds: matched.traversedSegmentIds,
    source: 'OSRM_HYBRID',
    algorithmUsed: algorithmLabel,
    dijkstraTrace: graphResult.dijkstraTrace,
  };
}

/**
 * Computes all three routing modes using genuine Dijkstra's algorithm on the Bengaluru road graph,
 * then optionally snaps each Dijkstra-selected node path onto OpenStreetMap road geometry via OSRM:
 *
 * - SHORTEST: Dijkstra minimizing road distance (meters)
 * - FASTEST: Dijkstra minimizing free-flow travel duration (seconds)
 * - CONGESTION_AWARE: Dijkstra minimizing congestion-multiplied travel duration (seconds * multiplier)
 *
 * When OSRM is disabled or unreachable, the graph polyline fallback is returned cleanly.
 */
export async function calculateAllRoutes(
  startNodeId: string,
  endNodeId: string,
  segments: RoadSegment[],
  useOsrm = true,
  originCoordOverride?: Coordinate,
  destCoordOverride?: Coordinate
): Promise<Record<RoutingMode, RouteCandidate>> {
  const nodeMap = new Map(BENGALURU_NODES.map((n) => [n.id, n]));
  const startCoord = originCoordOverride ?? nodeMap.get(startNodeId)?.coord;
  const endCoord = destCoordOverride ?? nodeMap.get(endNodeId)?.coord;

  // Step 1: Execute genuine Dijkstra's algorithm on the Bengaluru road graph for all 3 modes
  const graphShortest = findGraphPath(startNodeId, endNodeId, segments, 'shortest');
  const graphFastest = findGraphPath(startNodeId, endNodeId, segments, 'fastest');
  const graphCongestion = findGraphPath(startNodeId, endNodeId, segments, 'congestion_aware');

  if (!graphShortest || !graphFastest || !graphCongestion) {
    throw new Error(
      `Destination "${endNodeId}" is unreachable from "${startNodeId}" in the road graph.`
    );
  }

  if (!useOsrm || !startCoord || !endCoord) {
    return {
      shortest: buildCandidateFromGraphResult(graphShortest, 'shortest', 'GRAPH_FALLBACK'),
      fastest: buildCandidateFromGraphResult(graphFastest, 'fastest', 'GRAPH_FALLBACK'),
      congestion_aware: buildCandidateFromGraphResult(
        graphCongestion,
        'congestion_aware',
        'GRAPH_FALLBACK'
      ),
    };
  }

  // Step 2: Snap each unique Dijkstra node sequence onto real OSM road curves via OSRM
  const buildWaypoints = (nodeIds: string[]): Coordinate[] => {
    const intermediate = nodeIds
      .slice(1, -1)
      .map((id) => nodeMap.get(id)?.coord)
      .filter((c): c is Coordinate => Boolean(c));
    return [startCoord, ...intermediate, endCoord];
  };

  const cache = new Map<string, Promise<ParsedOsrmRoute | null>>();
  const snapUnique = (nodeIds: string[]): Promise<ParsedOsrmRoute | null> => {
    const key = nodeIds.join('>');
    if (!cache.has(key)) {
      cache.set(key, fetchOsrmGeometryForWaypoints(buildWaypoints(nodeIds)));
    }
    return cache.get(key)!;
  };

  const [osrmShortest, osrmFastest, osrmCongestion] = await Promise.all([
    snapUnique(graphShortest.nodeIds),
    snapUnique(graphFastest.nodeIds),
    snapUnique(graphCongestion.nodeIds),
  ]);

  return {
    shortest: snapGraphResultWithOsrm(graphShortest, osrmShortest, 'shortest', segments),
    fastest: snapGraphResultWithOsrm(graphFastest, osrmFastest, 'fastest', segments),
    congestion_aware: snapGraphResultWithOsrm(
      graphCongestion,
      osrmCongestion,
      'congestion_aware',
      segments
    ),
  };
}

/**
 * Fetches real OSRM driving distances & durations from an origin to all demonstration hospitals.
 * Returns null if OSRM Table API is unavailable so caller can use graph fallback.
 */
export async function fetchOsrmHospitalMatrix(
  origin: Coordinate,
  hospitals: Hospital[],
  timeoutMs = 3000
): Promise<Array<{ hospitalId: string; distanceMeters: number; durationSeconds: number }> | null> {
  if (hospitals.length === 0) return [];
  const allCoords = [origin, ...hospitals.map((h) => h.coord)];
  const coordStr = allCoords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const url = `${OSRM_TABLE_URL}/${coordStr}?sources=0&annotations=distance,duration`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmTableResponse;
    if (
      data.code !== 'Ok' ||
      !data.distances?.[0] ||
      !data.durations?.[0] ||
      data.distances[0].length < hospitals.length + 1
    ) {
      return null;
    }

    return hospitals.map((hosp, idx) => ({
      hospitalId: hosp.id,
      distanceMeters: Math.round(data.distances![0][idx + 1]),
      durationSeconds: Math.max(1, Math.round(data.durations![0][idx + 1])),
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
