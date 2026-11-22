import { projectPointOntoRoute } from './geo';
import type {
  AmbulanceStatus,
  Coordinate,
  GreenCorridorSummary,
  RouteCandidate,
  SignalState,
  TrafficSignal,
} from './types';

export const GREEN_CORRIDOR_ACTIVATION_RADIUS_METERS = 650;
export const GREEN_CORRIDOR_CLEARANCE_PAST_METERS = 140;
export const GREEN_CORRIDOR_HANDOFF_METERS = 220;

export interface SignalSyncResult {
  signals: TrafficSignal[];
  greenCorridor: GreenCorridorSummary;
  newlyActivatedSignals: TrafficSignal[];
  newlyRestoredSignals: TrafficSignal[];
}

/**
 * Aligns traffic signals to the active route and sequentially transitions
 * upcoming intersections to GREEN according to the ambulance's distance along the route,
 * then restores passed signals back to normal cycle after clearance.
 */
export function evaluateGreenCorridorSignals(
  currentSignals: TrafficSignal[],
  activeRoute: RouteCandidate | null,
  ambulanceDistanceMeters: number,
  ambulanceStatus: AmbulanceStatus,
  greenCorridorEnabled: boolean
): SignalSyncResult {
  const now = new Date().toISOString();

  if (!activeRoute || activeRoute.geometry.length < 2) {
    const resetSignals = currentSignals.map((sig) => ({
      ...sig,
      onActiveRoute: false,
      routeDistanceMeters: null,
      sequenceOrder: null,
      distanceFromAmbulanceMeters: null,
      state: 'NORMAL' as const,
      lastUpdated: sig.state !== 'NORMAL' ? now : sig.lastUpdated,
    }));

    return {
      signals: resetSignals,
      greenCorridor: {
        enabled: greenCorridorEnabled,
        status: 'INACTIVE',
        totalRouteSignals: 0,
        activatedCount: 0,
        awaitingCount: 0,
        restoredCount: 0,
        activeSignalId: null,
        activeSignalName: null,
        nextSignalName: null,
        nextSignalDistanceMeters: null,
        activationRadiusMeters: GREEN_CORRIDOR_ACTIVATION_RADIUS_METERS,
      },
      newlyActivatedSignals: [],
      newlyRestoredSignals: [],
    };
  }

  const isMovingOrDispatched =
    ambulanceStatus === 'DISPATCHED' || ambulanceStatus === 'EN_ROUTE';

  // Project each signal onto the active route to know which intersections lie on it
  const projected = currentSignals.map((sig) => {
    const proj = projectPointOntoRoute(activeRoute.geometry, sig.coord);
    const isOnRoute =
      activeRoute.traversedNodeIds.includes(sig.nodeId) || proj.snapDistanceMeters <= 125;
    return {
      sig,
      isOnRoute,
      distAlong: isOnRoute ? Math.round(proj.distanceAlongRouteMeters) : null,
    };
  });

  // Sort on-route intersections strictly by distance along the route
  const sortedOnRoute = projected
    .filter((item) => item.isOnRoute && item.distAlong !== null)
    .sort((a, b) => (a.distAlong ?? 0) - (b.distAlong ?? 0));

  const nextStateById = new Map<
    string,
    { state: SignalState; sequenceOrder: number | null; distanceDelta: number | null }
  >();

  let allowNextActivation = true;

  sortedOnRoute.forEach((item, index) => {
    const distAlong = item.distAlong ?? 0;
    const delta = Math.round(distAlong - ambulanceDistanceMeters); // + ahead, - passed
    const sequenceOrder = index + 1;
    let nextState: SignalState = item.sig.state;

    if (!greenCorridorEnabled || ambulanceStatus === 'STANDBY') {
      nextState = 'NORMAL';
    } else if (ambulanceStatus === 'ARRIVED') {
      nextState = 'RESTORED';
    } else if (isMovingOrDispatched) {
      if (delta < -GREEN_CORRIDOR_CLEARANCE_PAST_METERS) {
        // Ambulance has safely cleared the intersection
        nextState = 'RESTORED';
      } else if (allowNextActivation && delta <= GREEN_CORRIDOR_ACTIVATION_RADIUS_METERS) {
        // Sequential distance-based preemption: only activate in route order
        nextState = 'GREEN';
        // Only hand off GREEN preempt to the immediate next signal once ambulance nears clearance
        if (delta > GREEN_CORRIDOR_HANDOFF_METERS) {
          allowNextActivation = false;
        }
      } else {
        // Upcoming downstream intersection awaiting sequential turn
        nextState = 'RED';
        allowNextActivation = false;
      }
    } else {
      nextState = 'NORMAL';
    }

    nextStateById.set(item.sig.id, {
      state: nextState,
      sequenceOrder,
      distanceDelta: delta,
    });
  });

  const newlyActivatedSignals: TrafficSignal[] = [];
  const newlyRestoredSignals: TrafficSignal[] = [];

  const updatedSignals = projected.map(({ sig, isOnRoute, distAlong }) => {
    if (!isOnRoute || distAlong === null) {
      return {
        ...sig,
        onActiveRoute: false,
        routeDistanceMeters: null,
        sequenceOrder: null,
        distanceFromAmbulanceMeters: null,
        state: 'NORMAL' as const,
        lastUpdated: sig.state !== 'NORMAL' ? now : sig.lastUpdated,
      };
    }

    const meta = nextStateById.get(sig.id)!;
    const updated: TrafficSignal = {
      ...sig,
      onActiveRoute: true,
      routeDistanceMeters: distAlong,
      sequenceOrder: meta.sequenceOrder,
      distanceFromAmbulanceMeters: meta.distanceDelta,
      state: meta.state,
      lastUpdated: sig.state !== meta.state ? now : sig.lastUpdated,
    };

    if (sig.state !== 'GREEN' && meta.state === 'GREEN') {
      newlyActivatedSignals.push(updated);
    } else if (sig.state !== 'RESTORED' && meta.state === 'RESTORED') {
      newlyRestoredSignals.push(updated);
    }

    return updated;
  });

  // Sort transition events sequentially along the route
  newlyActivatedSignals.sort(
    (a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0)
  );
  newlyRestoredSignals.sort(
    (a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0)
  );

  const routeSignals = updatedSignals
    .filter((s) => s.onActiveRoute)
    .sort((a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0));

  const activeGreen = routeSignals.find((s) => s.state === 'GREEN') ?? null;
  const awaitingSignals = routeSignals.filter(
    (s) => s.state === 'RED' || (s.state === 'NORMAL' && (s.routeDistanceMeters ?? 0) >= ambulanceDistanceMeters)
  );
  const restoredSignals = routeSignals.filter((s) => s.state === 'RESTORED');
  const nextUpcoming =
    routeSignals.find((s) => (s.routeDistanceMeters ?? 0) >= ambulanceDistanceMeters) ?? null;

  const status: GreenCorridorSummary['status'] =
    !greenCorridorEnabled || ambulanceStatus === 'STANDBY'
      ? 'INACTIVE'
      : ambulanceStatus === 'ARRIVED'
        ? 'CLEARED'
        : 'ACTIVE_PRIORITIZATION';

  return {
    signals: updatedSignals,
    greenCorridor: {
      enabled: greenCorridorEnabled,
      status,
      totalRouteSignals: routeSignals.length,
      activatedCount: routeSignals.filter((s) => s.state === 'GREEN').length,
      awaitingCount: awaitingSignals.length,
      restoredCount: restoredSignals.length,
      activeSignalId: activeGreen?.id ?? null,
      activeSignalName: activeGreen?.name ?? null,
      nextSignalName: nextUpcoming?.name ?? null,
      nextSignalDistanceMeters: nextUpcoming
        ? Math.max(0, Math.round((nextUpcoming.routeDistanceMeters ?? 0) - ambulanceDistanceMeters))
        : null,
      activationRadiusMeters: GREEN_CORRIDOR_ACTIVATION_RADIUS_METERS,
    },
    newlyActivatedSignals,
    newlyRestoredSignals,
  };
}

/**
 * Helper to find the nearest coordinate on a polyline for display or snapping.
 */
export function getSignalDistanceAhead(
  routeGeometry: Coordinate[],
  signalCoord: Coordinate,
  ambulanceDistanceMeters: number
): number | null {
  const proj = projectPointOntoRoute(routeGeometry, signalCoord);
  if (proj.snapDistanceMeters > 150) return null;
  return Math.round(proj.distanceAlongRouteMeters - ambulanceDistanceMeters);
}
