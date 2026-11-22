import { BENGALURU_NODES } from './bengaluruNetwork';
import type {
  Coordinate,
  DijkstraEdgeStep,
  DijkstraStepNode,
  DijkstraTrace,
  RoadNode,
  RoadSegment,
  RouteCandidate,
  RoutingMode,
} from './types';

interface DirectedEdge {
  toNodeId: string;
  segment: RoadSegment;
  forward: boolean;
}

function buildAdjacency(
  nodes: RoadNode[],
  segments: RoadSegment[]
): { adj: Map<string, DirectedEdge[]>; directedEdgeCount: number } {
  const adj = new Map<string, DirectedEdge[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  let directedEdgeCount = 0;
  for (const seg of segments) {
    if (
      !Number.isFinite(seg.distanceMeters) ||
      seg.distanceMeters <= 0 ||
      !Number.isFinite(seg.baseSpeedKmh) ||
      seg.baseSpeedKmh <= 0
    ) {
      continue;
    }
    if (adj.has(seg.fromNodeId) && adj.has(seg.toNodeId)) {
      adj.get(seg.fromNodeId)!.push({ toNodeId: seg.toNodeId, segment: seg, forward: true });
      adj.get(seg.toNodeId)!.push({ toNodeId: seg.fromNodeId, segment: seg, forward: false });
      directedEdgeCount += 2;
    }
  }
  return { adj, directedEdgeCount };
}

export function getDijkstraEdgeWeight(segment: RoadSegment, mode: RoutingMode): number {
  const speedMps = Math.max(1, segment.baseSpeedKmh / 3.6);
  const baseSeconds = segment.distanceMeters / speedMps;

  if (mode === 'shortest') {
    // Shortest Distance mode optimizes physical road length (meters)
    return segment.distanceMeters;
  }

  if (mode === 'fastest') {
    // Fastest Route mode optimizes free-flow travel time (seconds) with slight arterial priority
    const roadClassFactor =
      segment.roadClass === 'ARTERIAL_HIGHWAY'
        ? 0.96
        : segment.roadClass === 'INNER_RING'
          ? 0.99
          : 1.02;
    return baseSeconds * roadClassFactor;
  }

  // Congestion-Aware mode multiplies travel-time edge weight by dynamic congestion multiplier
  const multiplier = Math.max(1, segment.congestionMultiplier || 1);
  return baseSeconds * multiplier;
}

export interface GraphSearchResult {
  nodeIds: string[];
  segments: RoadSegment[];
  geometry: Coordinate[];
  distanceMeters: number;
  baseDurationSeconds: number;
  adjustedDurationSeconds: number;
  affectedSegments: string[];
  dijkstraTrace: DijkstraTrace;
}

/**
 * Genuine Dijkstra's shortest-path algorithm on the Bengaluru road graph.
 *
 * - Graph nodes: Road intersections (BENGALURU_NODES or custom node list)
 * - Graph edges: Bidirectional road segments with non-negative distance / travel-time weights
 * - Maintains dist[], prevNode[], prevEdge[] maps to relax edges greedily in lowest-cost order
 * - Reconstructs the shortest path via predecessor pointers from goal back to source
 * - Safely returns null on invalid graph inputs or unreachable destinations
 */
export function findGraphPath(
  startNodeId: string,
  endNodeId: string,
  segments: RoadSegment[],
  mode: RoutingMode,
  nodes: RoadNode[] = BENGALURU_NODES
): GraphSearchResult | null {
  if (!startNodeId || !endNodeId || !Array.isArray(nodes) || !Array.isArray(segments)) {
    return null;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const startNode = nodeMap.get(startNodeId);
  const goalNode = nodeMap.get(endNodeId);
  if (!startNode || !goalNode) {
    return null;
  }

  const { adj, directedEdgeCount } = buildAdjacency(nodes, segments);

  const dist = new Map<string, number>();
  const prevNode = new Map<string, string>();
  const prevEdge = new Map<string, DirectedEdge>();
  const unvisited = new Set<string>(nodes.map((n) => n.id));
  const visitedOrderNodeIds: string[] = [];
  let edgesRelaxed = 0;

  for (const node of nodes) {
    dist.set(node.id, Infinity);
  }
  dist.set(startNodeId, 0);

  while (unvisited.size > 0) {
    // Select unvisited vertex with minimum tentative Dijkstra distance
    let currentId: string | null = null;
    let bestCost = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < bestCost) {
        bestCost = d;
        currentId = id;
      }
    }

    // Remaining vertices are unreachable from startNodeId
    if (!currentId || !Number.isFinite(bestCost)) {
      break;
    }

    unvisited.delete(currentId);
    visitedOrderNodeIds.push(currentId);

    if (currentId === endNodeId) {
      return reconstructPath(
        startNodeId,
        endNodeId,
        prevNode,
        prevEdge,
        dist,
        nodeMap,
        mode,
        nodes.length,
        directedEdgeCount,
        visitedOrderNodeIds,
        edgesRelaxed
      );
    }

    const neighbors = adj.get(currentId) ?? [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.toNodeId)) continue;

      const weight = getDijkstraEdgeWeight(edge.segment, mode);
      const candidateCost = bestCost + weight;

      if (candidateCost < (dist.get(edge.toNodeId) ?? Infinity)) {
        dist.set(edge.toNodeId, candidateCost);
        prevNode.set(edge.toNodeId, currentId);
        prevEdge.set(edge.toNodeId, edge);
        edgesRelaxed++;
      }
    }
  }

  return null;
}

function reconstructPath(
  startNodeId: string,
  endNodeId: string,
  prevNode: Map<string, string>,
  prevEdge: Map<string, DirectedEdge>,
  dist: Map<string, number>,
  nodeMap: Map<string, RoadNode>,
  mode: RoutingMode,
  totalGraphNodes: number,
  totalGraphEdges: number,
  visitedOrderNodeIds: string[],
  edgesRelaxed: number
): GraphSearchResult | null {
  const nodeIds: string[] = [endNodeId];
  const edges: DirectedEdge[] = [];

  let curr = endNodeId;
  const guardSet = new Set<string>([endNodeId]);
  while (curr !== startNodeId) {
    const parent = prevNode.get(curr);
    const edge = prevEdge.get(curr);
    if (!parent || !edge || guardSet.has(parent)) {
      return null;
    }
    guardSet.add(parent);
    edges.unshift(edge);
    nodeIds.unshift(parent);
    curr = parent;
  }

  const geometry: Coordinate[] = [];
  let distanceMeters = 0;
  let baseDurationSeconds = 0;
  let adjustedDurationSeconds = 0;
  const affectedSegments: string[] = [];
  const pathEdges: DijkstraEdgeStep[] = [];

  const startNode = nodeMap.get(startNodeId)!;
  const pathNodes: DijkstraStepNode[] = [
    {
      nodeId: startNode.id,
      name: startNode.name,
      area: startNode.area,
      coord: startNode.coord,
      cumulativeDistanceMeters: 0,
      cumulativeBaseSeconds: 0,
      cumulativeWeight: 0,
      predecessorNodeId: null,
    },
  ];

  // If start === end, ensure geometry contains at least the origin point
  if (edges.length === 0) {
    geometry.push(startNode.coord);
  }

  for (const edge of edges) {
    const seg = edge.segment;
    const pts = edge.forward ? seg.waypoints : [...seg.waypoints].reverse();
    for (const pt of pts) {
      const last = geometry[geometry.length - 1];
      if (!last || last.lat !== pt.lat || last.lng !== pt.lng) {
        geometry.push(pt);
      }
    }

    const baseSec = seg.distanceMeters / Math.max(1, seg.baseSpeedKmh / 3.6);
    const adjSec = baseSec * Math.max(1, seg.congestionMultiplier || 1);
    const edgeWeight = Number(getDijkstraEdgeWeight(seg, mode).toFixed(1));

    distanceMeters += seg.distanceMeters;
    baseDurationSeconds += baseSec;
    adjustedDurationSeconds += adjSec;

    if (seg.congestionLevel !== 'NONE') {
      affectedSegments.push(`${seg.name} (${seg.congestionLevel})`);
    }

    const fromNodeId = edge.forward ? seg.fromNodeId : seg.toNodeId;
    const toNodeId = edge.toNodeId;
    const fromNode = nodeMap.get(fromNodeId)!;
    const toNode = nodeMap.get(toNodeId)!;

    pathEdges.push({
      segmentId: seg.id,
      segmentName: seg.name,
      fromNodeId,
      fromNodeName: fromNode.name,
      toNodeId,
      toNodeName: toNode.name,
      distanceMeters: seg.distanceMeters,
      baseSpeedKmh: seg.baseSpeedKmh,
      congestionLevel: seg.congestionLevel,
      congestionMultiplier: seg.congestionMultiplier,
      edgeWeight,
    });

    pathNodes.push({
      nodeId: toNode.id,
      name: toNode.name,
      area: toNode.area,
      coord: toNode.coord,
      cumulativeDistanceMeters: Math.round(distanceMeters),
      cumulativeBaseSeconds: Math.round(baseDurationSeconds),
      cumulativeWeight: Number((dist.get(toNodeId) ?? 0).toFixed(1)),
      predecessorNodeId: fromNodeId,
    });
  }

  const weightMetricLabel =
    mode === 'shortest'
      ? 'Road Distance (meters)'
      : mode === 'fastest'
        ? 'Free-Flow Travel Time (seconds)'
        : 'Congestion-Adjusted Time (seconds × traffic multiplier)';

  return {
    nodeIds,
    segments: edges.map((e) => e.segment),
    geometry,
    distanceMeters: Math.round(distanceMeters),
    baseDurationSeconds: Math.round(baseDurationSeconds),
    adjustedDurationSeconds: Math.round(adjustedDurationSeconds),
    affectedSegments,
    dijkstraTrace: {
      mode,
      weightMetricLabel,
      totalGraphNodes,
      totalGraphEdges,
      nodesEvaluated: visitedOrderNodeIds.length,
      edgesRelaxed,
      visitedOrderNodeIds,
      pathNodes,
      pathEdges,
      graphDistanceMeters: Math.round(distanceMeters),
      graphDurationSeconds: Math.round(adjustedDurationSeconds),
      totalObjectiveCost: Number((dist.get(endNodeId) ?? 0).toFixed(1)),
    },
  };
}

export function buildCandidateFromGraphResult(
  result: GraphSearchResult,
  mode: RoutingMode,
  source: 'OSRM_HYBRID' | 'GRAPH_FALLBACK' = 'GRAPH_FALLBACK'
): RouteCandidate {
  const labels: Record<RoutingMode, string> = {
    shortest: 'Shortest Distance Route',
    fastest: 'Fastest Speed Route',
    congestion_aware: 'Congestion-Aware Optimal Route',
  };

  const corridorNames = Array.from(new Set(result.segments.map((s) => s.corridor)));
  const summarizedCorridors =
    corridorNames.length <= 3
      ? corridorNames
      : [
          corridorNames[0],
          corridorNames[Math.floor(corridorNames.length / 2)],
          corridorNames[corridorNames.length - 1],
        ];
  const corridorSummary =
    Array.from(new Set(summarizedCorridors)).join(' -> ') || 'Bengaluru Road Network';
  const durationForSpeed = Math.max(1, result.adjustedDurationSeconds);
  const averageSpeedKmh =
    result.distanceMeters > 0
      ? Number(((result.distanceMeters / 1000) / (durationForSpeed / 3600)).toFixed(1))
      : 0;

  return {
    id: `route_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mode,
    label: labels[mode],
    corridorSummary,
    geometry: result.geometry,
    distanceMeters: result.distanceMeters,
    baseDurationSeconds: result.baseDurationSeconds,
    adjustedDurationSeconds: result.adjustedDurationSeconds,
    averageSpeedKmh,
    congestionPenaltySeconds: Math.max(
      0,
      result.adjustedDurationSeconds - result.baseDurationSeconds
    ),
    affectedSegments: result.affectedSegments,
    traversedNodeIds: result.nodeIds,
    traversedSegmentIds: result.segments.map((s) => s.id),
    source,
    algorithmUsed:
      mode === 'shortest'
        ? "Dijkstra's Algorithm (Minimum Road Distance Edge Weights)"
        : mode === 'fastest'
          ? "Dijkstra's Algorithm (Free-Flow Travel Time Edge Weights)"
          : "Dijkstra's Algorithm (Congestion-Weighted Travel Time)",
    dijkstraTrace: result.dijkstraTrace,
  };
}
