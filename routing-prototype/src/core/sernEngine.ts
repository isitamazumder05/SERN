import {
  BENGALURU_AMBULANCE_START,
  BENGALURU_DEFAULT_INCIDENT,
  BENGALURU_NODES,
  CONGESTION_MULTIPLIERS,
  HOSPITAL_NODE_MAP,
  RNSIT_REFERENCE_LOCATION,
  buildBengaluruHospitals,
  buildBengaluruRoadSegments,
  buildBengaluruSignals,
  findNearestNodeId,
} from './bengaluruNetwork';
import { formatDuration, haversineDistanceMeters, interpolateAlongRoute } from './geo';
import {
  calculateAllRoutes,
  evaluateCongestionOnGeometry,
  fetchOsrmHospitalMatrix,
} from './osrmService';
import { evaluateGreenCorridorSignals } from './trafficEngine';
import type {
  AmbulanceTelemetry,
  CongestionLevel,
  EventLogEntry,
  EventSeverity,
  GreenCorridorSummary,
  Hospital,
  RerouteComparison,
  RoadSegment,
  RouteCandidate,
  RouteExplanation,
  RoutingMode,
  SernSystemSnapshot,
  TrafficSignal,
} from './types';

export class SernEngine {
  private scenarioName = 'RNSIT & RR Nagar Emergency Dispatch Corridor, Bengaluru';
  private referenceLocation = { ...RNSIT_REFERENCE_LOCATION };
  private incident = { ...BENGALURU_DEFAULT_INCIDENT };
  private selectedHospitalId = 'hosp_sparsh_rr';
  private selectedMode: RoutingMode = 'congestion_aware';
  private autoRerouteEnabled = true;
  private greenCorridorEnabled = true;
  private useOsrm = true;
  private isRoutingLoading = false;
  private lastError: string | null = null;

  private roadSegments: RoadSegment[] = buildBengaluruRoadSegments();
  private hospitals: Hospital[] = buildBengaluruHospitals();
  private signals: TrafficSignal[] = buildBengaluruSignals();

  private routeCandidates: Record<RoutingMode, RouteCandidate | null> = {
    shortest: null,
    fastest: null,
    congestion_aware: null,
  };
  private activeRoute: RouteCandidate | null = null;
  private previousRoute: RouteCandidate | null = null;
  private rerouteComparison: RerouteComparison | null = null;

  private ambulance: AmbulanceTelemetry = this.createInitialAmbulance();
  private greenCorridor: GreenCorridorSummary = {
    enabled: true,
    status: 'INACTIVE',
    totalRouteSignals: 0,
    activatedCount: 0,
    awaitingCount: 0,
    restoredCount: 0,
    activeSignalId: null,
    activeSignalName: null,
    nextSignalName: null,
    nextSignalDistanceMeters: null,
    activationRadiusMeters: 650,
  };

  private events: EventLogEntry[] = [];
  private eventSeq = 1;
  private approachingLogged = false;

  constructor(options?: { useOsrm?: boolean }) {
    if (options?.useOsrm !== undefined) {
      this.useOsrm = options.useOsrm;
    }
    this.initializeScenarioLogs();
  }

  private createInitialAmbulance(): AmbulanceTelemetry {
    return {
      id: 'AMB-KA01-108',
      callSign: 'SERN-ALPHA-108',
      unitType: 'ALS Cardiac ICU Ambulance',
      status: 'STANDBY',
      startLocationName: BENGALURU_AMBULANCE_START.locationName,
      startCoord: { ...BENGALURU_AMBULANCE_START.coord },
      currentCoord: { ...BENGALURU_AMBULANCE_START.coord },
      bearingDegrees: 255,
      currentSpeedKmh: 0,
      distanceCoveredMeters: 0,
      remainingDistanceMeters: 0,
      totalDistanceMeters: 0,
      etaSeconds: 0,
      completionPercent: 0,
      speedMultiplier: 6, // 6x simulation speed for clear real-time corridor demonstration
      isPaused: false,
      dispatchedAt: null,
      arrivedAt: null,
    };
  }

  private initializeScenarioLogs(): void {
    this.events = [];
    this.approachingLogged = false;
    this.logEvent(
      `Accident detected: ${this.incident.title} at ${this.incident.locationName}`,
      'ACCIDENT DETECTED',
      'CRITICAL',
      'DISPATCH'
    );
    this.logEvent(
      `Emergency case ${this.incident.id} created — ${this.ambulance.id} (${this.ambulance.unitType}) staged nearby at Channasandra EMS Bay`,
      'CASE CREATED',
      'INFO',
      'DISPATCH'
    );
  }

  public logEvent(
    description: string,
    status: string,
    severity: EventSeverity,
    category: EventLogEntry['category']
  ): EventLogEntry {
    const entry: EventLogEntry = {
      id: `EVT-${String(this.eventSeq++).padStart(4, '0')}`,
      timestamp: new Date().toISOString(),
      description,
      status,
      severity,
      category,
    };
    this.events.unshift(entry);
    if (this.events.length > 150) {
      this.events = this.events.slice(0, 150);
    }
    return entry;
  }

  public async initializeRoutes(): Promise<SernSystemSnapshot> {
    return this.calculateRoutes({
      hospitalId: this.selectedHospitalId,
      mode: this.selectedMode,
    });
  }

  public async calculateRoutes(params?: {
    hospitalId?: string;
    mode?: RoutingMode;
    fromCurrentPosition?: boolean;
  }): Promise<SernSystemSnapshot> {
    if (params?.hospitalId && params.hospitalId !== this.selectedHospitalId) {
      this.selectedHospitalId = params.hospitalId;
      this.approachingLogged = false;
    } else if (params?.hospitalId) {
      this.selectedHospitalId = params.hospitalId;
    }
    if (params?.mode) {
      this.selectedMode = params.mode;
    }

    const hospitalNodeId = HOSPITAL_NODE_MAP[this.selectedHospitalId] ?? 'n_sparsh_hosp';
    const targetHospital = this.hospitals.find((h) => h.id === this.selectedHospitalId);
    const originCoord = params?.fromCurrentPosition
      ? this.ambulance.currentCoord
      : this.ambulance.startCoord;
    const startNodeId = params?.fromCurrentPosition
      ? findNearestNodeId(this.ambulance.currentCoord)
      : BENGALURU_AMBULANCE_START.nearestNodeId;

    this.isRoutingLoading = true;
    this.lastError = null;

    try {
      const candidates = await calculateAllRoutes(
        startNodeId,
        hospitalNodeId,
        this.roadSegments,
        this.useOsrm,
        originCoord,
        targetHospital?.coord
      );

      // Ensure geometry continuity from currentCoord without breaking distance/duration/speed consistency
      if (params?.fromCurrentPosition) {
        const cur = this.ambulance.currentCoord;
        for (const m of ['shortest', 'fastest', 'congestion_aware'] as RoutingMode[]) {
          const c = candidates[m];
          if (c.geometry.length > 0) {
            const gap = haversineDistanceMeters(cur, c.geometry[0]);
            if (gap > 15) {
              c.geometry = [{ ...cur }, ...c.geometry];
              const newDist = Math.round(c.distanceMeters + gap);
              const addedSec = Math.round(gap / Math.max(3, c.averageSpeedKmh / 3.6));
              c.distanceMeters = newDist;
              c.baseDurationSeconds += addedSec;
              c.adjustedDurationSeconds += addedSec;
              c.averageSpeedKmh = Number(
                ((c.distanceMeters / 1000) / (Math.max(1, c.adjustedDurationSeconds) / 3600)).toFixed(1)
              );
            }
          }
        }
      }

      this.routeCandidates = candidates;
      const chosen = candidates[this.selectedMode];
      this.activeRoute = chosen;

      // Update ambulance route metrics if not currently arrived
      if (this.ambulance.status !== 'ARRIVED') {
        if (params?.fromCurrentPosition) {
          this.ambulance.distanceCoveredMeters = 0;
        }
        this.ambulance.totalDistanceMeters = chosen.distanceMeters;
        this.ambulance.remainingDistanceMeters = Math.max(
          0,
          chosen.distanceMeters - this.ambulance.distanceCoveredMeters
        );
        this.ambulance.etaSeconds = this.computeRemainingEtaSeconds();
        this.ambulance.completionPercent =
          chosen.distanceMeters > 0
            ? Math.min(
                100,
                Math.round((this.ambulance.distanceCoveredMeters / chosen.distanceMeters) * 100)
              )
            : 0;
      }

      await this.updateHospitalMetrics();
      this.syncGreenCorridor(false);

      const modeLabel =
        this.selectedMode === 'shortest'
          ? 'Shortest Distance'
          : this.selectedMode === 'fastest'
            ? 'Fastest Speed'
            : 'Congestion-Aware Optimal';

      this.logEvent(
        `Route calculated (${modeLabel}) to ${targetHospital?.shortName ?? this.selectedHospitalId}: ${(chosen.distanceMeters / 1000).toFixed(2)} km, ETA ${formatDuration(chosen.adjustedDurationSeconds)}`,
        'ROUTE READY',
        'INFO',
        'ROUTING'
      );
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Route calculation failed';
      this.logEvent(`Routing error: ${this.lastError}`, 'ERROR', 'CRITICAL', 'ROUTING');
    } finally {
      this.isRoutingLoading = false;
    }

    return this.getSnapshot();
  }

  private async updateHospitalMetrics(): Promise<void> {
    const isMoving =
      this.ambulance.status === 'EN_ROUTE' || this.ambulance.status === 'DISPATCHED';
    const originCoord = isMoving ? this.ambulance.currentCoord : this.ambulance.startCoord;
    const startNodeId = isMoving
      ? findNearestNodeId(this.ambulance.currentCoord)
      : BENGALURU_AMBULANCE_START.nearestNodeId;

    const matrix = this.useOsrm
      ? await fetchOsrmHospitalMatrix(originCoord, this.hospitals)
      : null;
    const matrixMap = new Map(matrix?.map((m) => [m.hospitalId, m]) ?? []);

    const { findGraphPath } = await import('./graphRouter');
    this.hospitals = this.hospitals.map((hosp) => {
      if (hosp.id === this.selectedHospitalId && this.activeRoute) {
        return {
          ...hosp,
          distanceMeters: isMoving
            ? this.ambulance.remainingDistanceMeters
            : this.activeRoute.distanceMeters,
          etaSeconds: isMoving
            ? this.ambulance.etaSeconds
            : this.activeRoute.adjustedDurationSeconds,
        };
      }

      const osrmEntry = matrixMap.get(hosp.id);
      if (osrmEntry) {
        return {
          ...hosp,
          distanceMeters: osrmEntry.distanceMeters,
          etaSeconds: osrmEntry.durationSeconds,
        };
      }

      const targetNode = HOSPITAL_NODE_MAP[hosp.id];
      const res = findGraphPath(startNodeId, targetNode, this.roadSegments, 'congestion_aware');
      return {
        ...hosp,
        distanceMeters: res
          ? res.distanceMeters
          : Math.round(haversineDistanceMeters(originCoord, hosp.coord)),
        etaSeconds: res ? res.adjustedDurationSeconds : 600,
      };
    });
  }

  public startSimulation(): SernSystemSnapshot {
    if (!this.activeRoute) return this.getSnapshot();

    if (this.ambulance.status === 'ARRIVED') {
      // Restart from beginning if already arrived
      this.ambulance.distanceCoveredMeters = 0;
      this.ambulance.currentCoord = { ...this.activeRoute.geometry[0] };
      this.ambulance.arrivedAt = null;
      this.approachingLogged = false;
    }

    const wasStandby = this.ambulance.status === 'STANDBY';
    this.ambulance.status = wasStandby ? 'DISPATCHED' : 'EN_ROUTE';
    this.ambulance.isPaused = false;
    if (!this.ambulance.dispatchedAt) {
      this.ambulance.dispatchedAt = new Date().toISOString();
    }
    this.ambulance.currentSpeedKmh = this.activeRoute.averageSpeedKmh;

    this.logEvent(
      wasStandby
        ? `Ambulance ${this.ambulance.id} dispatched along ${this.activeRoute.corridorSummary}`
        : `Ambulance ${this.ambulance.id} simulation resumed`,
      this.ambulance.status,
      'SUCCESS',
      'SIMULATION'
    );

    if (this.greenCorridorEnabled && wasStandby) {
      this.logEvent(
        `Green Corridor prioritization activated along ${this.activeRoute.corridorSummary}`,
        'ACTIVE',
        'SUCCESS',
        'GREEN_CORRIDOR'
      );
    }

    this.syncGreenCorridor(true);
    return this.getSnapshot();
  }

  public pauseSimulation(): SernSystemSnapshot {
    if (this.ambulance.status === 'DISPATCHED' || this.ambulance.status === 'EN_ROUTE') {
      this.ambulance.isPaused = true;
      this.ambulance.currentSpeedKmh = 0;
      this.logEvent(
        `Ambulance ${this.ambulance.id} simulation paused at ${this.ambulance.completionPercent}% route completion`,
        'PAUSED',
        'WARNING',
        'SIMULATION'
      );
    }
    return this.getSnapshot();
  }

  public async resetSimulation(): Promise<SernSystemSnapshot> {
    this.roadSegments = buildBengaluruRoadSegments();
    this.hospitals = buildBengaluruHospitals();
    this.signals = buildBengaluruSignals();
    this.previousRoute = null;
    this.rerouteComparison = null;
    this.selectedMode = 'congestion_aware';
    this.selectedHospitalId = 'hosp_sparsh_rr';
    this.greenCorridorEnabled = true;
    this.autoRerouteEnabled = true;
    this.ambulance = this.createInitialAmbulance();
    this.initializeScenarioLogs();
    return this.calculateRoutes({
      hospitalId: this.selectedHospitalId,
      mode: this.selectedMode,
    });
  }

  public setSpeedMultiplier(multiplier: number): SernSystemSnapshot {
    const clamped = Math.max(1, Math.min(12, multiplier));
    this.ambulance.speedMultiplier = clamped;
    return this.getSnapshot();
  }

  public toggleGreenCorridor(enabled: boolean): SernSystemSnapshot {
    this.greenCorridorEnabled = enabled;
    this.syncGreenCorridor(false);
    this.logEvent(
      enabled
        ? 'Intelligent Green Corridor signal prioritization enabled'
        : 'Green Corridor signal prioritization disabled — signals reverted to normal cycle',
      enabled ? 'ENABLED' : 'DISABLED',
      enabled ? 'SUCCESS' : 'WARNING',
      'GREEN_CORRIDOR'
    );
    return this.getSnapshot();
  }

  public setAutoReroute(enabled: boolean): SernSystemSnapshot {
    this.autoRerouteEnabled = enabled;
    return this.getSnapshot();
  }

  /**
   * Advances simulation physics by realDeltaSeconds * speedMultiplier.
   */
  public stepSimulation(realDeltaSeconds: number): SernSystemSnapshot {
    if (
      !this.activeRoute ||
      this.ambulance.isPaused ||
      (this.ambulance.status !== 'DISPATCHED' && this.ambulance.status !== 'EN_ROUTE')
    ) {
      return this.getSnapshot();
    }

    if (this.ambulance.status === 'DISPATCHED') {
      this.ambulance.status = 'EN_ROUTE';
    }

    const effectiveSpeedKmh = this.computeInstantaneousSpeedKmh();
    const speedMps = effectiveSpeedKmh / 3.6;
    const stepMeters = speedMps * realDeltaSeconds * this.ambulance.speedMultiplier;

    const totalMeters = Math.max(1, this.activeRoute.distanceMeters);
    const nextCovered = Math.min(totalMeters, this.ambulance.distanceCoveredMeters + stepMeters);

    const interpolated = interpolateAlongRoute(this.activeRoute.geometry, nextCovered);
    this.ambulance.distanceCoveredMeters = Math.round(nextCovered);
    this.ambulance.remainingDistanceMeters = Math.max(0, Math.round(totalMeters - nextCovered));
    this.ambulance.currentCoord = interpolated.coord;
    this.ambulance.bearingDegrees = Math.round(interpolated.bearingDegrees);
    this.ambulance.currentSpeedKmh = Number(effectiveSpeedKmh.toFixed(1));
    this.ambulance.completionPercent = Math.min(
      100,
      Math.round((nextCovered / totalMeters) * 100)
    );
    this.ambulance.etaSeconds = this.computeRemainingEtaSeconds();

    this.syncGreenCorridor(true);

    if (
      this.ambulance.remainingDistanceMeters > 1 &&
      this.ambulance.remainingDistanceMeters <= 650 &&
      !this.approachingLogged
    ) {
      this.approachingLogged = true;
      const hosp = this.hospitals.find((h) => h.id === this.selectedHospitalId);
      this.logEvent(
        `Ambulance ${this.ambulance.id} approaching ${hosp?.name ?? 'destination hospital'} (${this.ambulance.remainingDistanceMeters} m remaining)`,
        'APPROACHING',
        'INFO',
        'DISPATCH'
      );
    }

    if (nextCovered >= totalMeters - 1) {
      this.ambulance.status = 'ARRIVED';
      this.ambulance.isPaused = false;
      this.ambulance.currentSpeedKmh = 0;
      this.ambulance.remainingDistanceMeters = 0;
      this.ambulance.etaSeconds = 0;
      this.ambulance.completionPercent = 100;
      this.ambulance.arrivedAt = new Date().toISOString();
      this.syncGreenCorridor(true);

      const hosp = this.hospitals.find((h) => h.id === this.selectedHospitalId);
      this.logEvent(
        `Ambulance ${this.ambulance.id} arrived at ${hosp?.name ?? 'destination hospital'}`,
        'ARRIVED',
        'SUCCESS',
        'DISPATCH'
      );
    }

    return this.getSnapshot();
  }

  private computeInstantaneousSpeedKmh(): number {
    if (!this.activeRoute) return 0;
    const baseAvg = this.activeRoute.averageSpeedKmh;
    const isMoving =
      this.ambulance.status === 'DISPATCHED' || this.ambulance.status === 'EN_ROUTE';
    // Green corridor improves effective intersection clearance speed by ~12% once active
    const greenBoost = isMoving && this.greenCorridorEnabled ? 1.12 : 1.0;

    // Realistic launch acceleration (first 220m) and hospital-bay deceleration (final 160m)
    const covered = this.ambulance.distanceCoveredMeters;
    const remaining = Math.max(0, this.activeRoute.distanceMeters - covered);
    let dynamicsFactor = 1.0;
    if (covered < 220) {
      dynamicsFactor = 0.48 + 0.52 * (covered / 220);
    } else if (remaining < 160) {
      dynamicsFactor = 0.55 + 0.45 * (remaining / 160);
    }

    return Math.min(72, Math.max(8, baseAvg * greenBoost * dynamicsFactor));
  }

  private computeRemainingEtaSeconds(): number {
    if (!this.activeRoute) return 0;
    if (this.ambulance.status === 'STANDBY' && this.ambulance.distanceCoveredMeters === 0) {
      return this.activeRoute.adjustedDurationSeconds;
    }
    const remaining = Math.max(0, this.activeRoute.distanceMeters - this.ambulance.distanceCoveredMeters);
    if (remaining === 0) return 0;
    const cruiseSpeedMps = Math.max(
      1.4,
      (this.activeRoute.averageSpeedKmh * (this.greenCorridorEnabled ? 1.12 : 1.0)) / 3.6
    );
    return Math.round(remaining / cruiseSpeedMps);
  }

  private syncGreenCorridor(logTransitions: boolean): void {
    const sync = evaluateGreenCorridorSignals(
      this.signals,
      this.activeRoute,
      this.ambulance.distanceCoveredMeters,
      this.ambulance.status,
      this.greenCorridorEnabled
    );
    this.signals = sync.signals;
    this.greenCorridor = sync.greenCorridor;

    if (logTransitions) {
      for (const sig of sync.newlyActivatedSignals) {
        const seqTag = sig.sequenceOrder ? `#${sig.sequenceOrder} ` : '';
        const distVal = sig.distanceFromAmbulanceMeters;
        const distInfo =
          distVal !== null && distVal > 0
            ? ` (${distVal} m ahead)`
            : distVal !== null
              ? ' (at junction)'
              : '';
        this.logEvent(
          `Green Corridor ${seqTag}${sig.name} (${sig.id}) preempted to GREEN${distInfo}`,
          'SIGNAL GREEN',
          'SUCCESS',
          'GREEN_CORRIDOR'
        );
      }
      for (const sig of sync.newlyRestoredSignals) {
        const seqTag = sig.sequenceOrder ? `#${sig.sequenceOrder} ` : '';
        this.logEvent(
          `Green Corridor ${seqTag}${sig.name} (${sig.id}) restored to normal phase after ambulance clearance`,
          'RESTORED',
          'INFO',
          'GREEN_CORRIDOR'
        );
      }
    }
  }

  /**
   * Injects simulated congestion onto a road segment and optionally triggers automatic rerouting.
   */
  public async simulateCongestion(
    segmentId: string,
    level: CongestionLevel
  ): Promise<SernSystemSnapshot> {
    const segment = this.roadSegments.find((s) => s.id === segmentId);
    if (!segment) {
      throw new Error(`Road segment ${segmentId} not found`);
    }

    segment.congestionLevel = level;
    segment.congestionMultiplier = CONGESTION_MULTIPLIERS[level];

    this.logEvent(
      level === 'NONE'
        ? `Traffic cleared on ${segment.name} — restored to free-flow speed`
        : `Simulated ${level} traffic congestion detected on ${segment.name} (travel cost x${segment.congestionMultiplier})`,
      level === 'NONE' ? 'CLEARED' : `${level} CONGESTION`,
      level === 'HIGH' ? 'CRITICAL' : level === 'MEDIUM' ? 'WARNING' : 'INFO',
      'TRAFFIC'
    );

    const impactsActiveRoute =
      this.activeRoute?.traversedSegmentIds.includes(segmentId) ||
      this.activeRoute?.affectedSegments.some((a) => a.includes(segment.name));

    if (
      this.autoRerouteEnabled &&
      (level === 'HIGH' || level === 'MEDIUM') &&
      this.ambulance.status !== 'ARRIVED'
    ) {
      await this.triggerReroute(
        segment.name,
        level,
        impactsActiveRoute
          ? `Congestion on active corridor (${segment.name})`
          : `Proactive congestion check (${segment.name})`
      );
    } else {
      await this.calculateRoutes({
        fromCurrentPosition:
          this.ambulance.status === 'DISPATCHED' || this.ambulance.status === 'EN_ROUTE',
      });
    }

    return this.getSnapshot();
  }

  public async triggerReroute(
    affectedRoadName = 'Selected Corridor',
    congestionLevel: CongestionLevel = 'HIGH',
    reason = 'Automatic congestion-aware rerouting initiated'
  ): Promise<SernSystemSnapshot> {
    const oldRoute = this.activeRoute;
    if (!oldRoute) {
      return this.calculateRoutes({ mode: 'congestion_aware' });
    }

    this.logEvent(
      `Automatic rerouting initiated: ${reason}`,
      'REROUTING',
      'WARNING',
      'ROUTING'
    );

    const isMidTrip =
      this.ambulance.status === 'DISPATCHED' || this.ambulance.status === 'EN_ROUTE';
    const coveredBeforeReroute = isMidTrip ? this.ambulance.distanceCoveredMeters : 0;
    const originCoord = isMidTrip ? this.ambulance.currentCoord : this.ambulance.startCoord;
    const startNodeId = isMidTrip
      ? findNearestNodeId(this.ambulance.currentCoord)
      : BENGALURU_AMBULANCE_START.nearestNodeId;
    const hospitalNodeId = HOSPITAL_NODE_MAP[this.selectedHospitalId] ?? 'n_sparsh_hosp';
    const targetHospital = this.hospitals.find((h) => h.id === this.selectedHospitalId);

    this.isRoutingLoading = true;
    try {
      const candidates = await calculateAllRoutes(
        startNodeId,
        hospitalNodeId,
        this.roadSegments,
        this.useOsrm,
        originCoord,
        targetHospital?.coord
      );

      if (isMidTrip) {
        const cur = this.ambulance.currentCoord;
        for (const m of ['shortest', 'fastest', 'congestion_aware'] as RoutingMode[]) {
          const c = candidates[m];
          if (c.geometry.length > 0) {
            const gap = haversineDistanceMeters(cur, c.geometry[0]);
            if (gap > 15) {
              c.geometry = [{ ...cur }, ...c.geometry];
              const addedSec = Math.round(gap / Math.max(3, c.averageSpeedKmh / 3.6));
              c.distanceMeters = Math.round(c.distanceMeters + gap);
              c.baseDurationSeconds += addedSec;
              c.adjustedDurationSeconds += addedSec;
              c.averageSpeedKmh = Number(
                ((c.distanceMeters / 1000) / (Math.max(1, c.adjustedDurationSeconds) / 3600)).toFixed(1)
              );
            }
          }
        }
      }

      // Always choose congestion_aware when rerouting for traffic
      this.selectedMode = 'congestion_aware';
      const newRoute = candidates.congestion_aware;
      this.routeCandidates = candidates;

      // Evaluate old route's remaining penalized duration under current congestion for fair comparison
      const oldEval = evaluateCongestionOnGeometry(
        oldRoute.geometry,
        this.roadSegments,
        oldRoute.traversedSegmentIds
      );
      const oldFullPenalizedDuration = oldRoute.baseDurationSeconds + oldEval.penaltySeconds;
      const remainingRatio =
        isMidTrip && oldRoute.distanceMeters > 0
          ? Math.max(0.05, (oldRoute.distanceMeters - coveredBeforeReroute) / oldRoute.distanceMeters)
          : 1;
      const oldRemainingDistance = Math.round(oldRoute.distanceMeters * remainingRatio);
      const oldRemainingDuration = Math.round(oldFullPenalizedDuration * remainingRatio);

      const oldSnapshotRoute: RouteCandidate = {
        ...oldRoute,
        distanceMeters: oldRemainingDistance,
        adjustedDurationSeconds: oldRemainingDuration,
        congestionPenaltySeconds: Math.round(oldEval.penaltySeconds * remainingRatio),
        affectedSegments: oldEval.affectedSegments,
        averageSpeedKmh: Number(
          ((oldRemainingDistance / 1000) / (Math.max(1, oldRemainingDuration) / 3600)).toFixed(1)
        ),
      };

      this.previousRoute = oldSnapshotRoute;
      this.activeRoute = newRoute;

      if (isMidTrip) {
        this.ambulance.distanceCoveredMeters = 0;
      }
      this.ambulance.totalDistanceMeters = newRoute.distanceMeters;
      this.ambulance.remainingDistanceMeters = newRoute.distanceMeters;
      this.ambulance.etaSeconds = this.computeRemainingEtaSeconds();
      this.ambulance.completionPercent = isMidTrip ? 0 : this.ambulance.completionPercent;

      const timeSavedSeconds = Math.max(
        0,
        Math.round(oldSnapshotRoute.adjustedDurationSeconds - newRoute.adjustedDurationSeconds)
      );
      const distanceDeltaMeters = newRoute.distanceMeters - oldSnapshotRoute.distanceMeters;

      this.rerouteComparison = {
        triggeredAt: new Date().toISOString(),
        reason,
        affectedRoadName,
        congestionLevel,
        previousRoute: oldSnapshotRoute,
        newRoute,
        timeSavedSeconds,
        distanceDeltaMeters,
      };

      await this.updateHospitalMetrics();
      this.syncGreenCorridor(false);

      const corridorChanged = oldSnapshotRoute.corridorSummary !== newRoute.corridorSummary;
      this.logEvent(
        timeSavedSeconds > 0
          ? `Alternative route selected via ${newRoute.corridorSummary} (${(newRoute.distanceMeters / 1000).toFixed(2)} km, saves ${formatDuration(timeSavedSeconds)} vs congested corridor)`
          : corridorChanged
            ? `Alternative route selected via ${newRoute.corridorSummary} (${(newRoute.distanceMeters / 1000).toFixed(2)} km) to bypass congested road`
            : `Traffic update evaluated: ${newRoute.corridorSummary} (${(newRoute.distanceMeters / 1000).toFixed(2)} km) remains the fastest available route`,
        'REROUTED',
        'SUCCESS',
        'ROUTING'
      );
    } finally {
      this.isRoutingLoading = false;
    }

    return this.getSnapshot();
  }

  /**
   * Re-evaluates all congestion levels cleanly (used in test or bulk clear).
   */
  public clearAllCongestion(): void {
    for (const seg of this.roadSegments) {
      seg.congestionLevel = 'NONE';
      seg.congestionMultiplier = 1.0;
    }
    this.previousRoute = null;
    this.rerouteComparison = null;
    this.logEvent('All simulated road congestion cleared', 'CLEAR', 'INFO', 'TRAFFIC');
  }

  private buildRouteExplanation(): RouteExplanation | null {
    const active = this.activeRoute;
    if (!active) return null;

    const targetHospital = this.hospitals.find((h) => h.id === this.selectedHospitalId);
    const modeReason =
      this.selectedMode === 'shortest'
        ? 'Selected to minimize total travel distance.'
        : this.selectedMode === 'fastest'
          ? 'Selected for highest free-flow road speeds along major arterials.'
          : 'Selected to avoid current traffic delays and achieve the fastest realistic arrival time.';

    const selectionReason = `Routing to ${targetHospital?.shortName ?? 'selected hospital'} via ${active.corridorSummary} (${(active.distanceMeters / 1000).toFixed(2)} km, ETA ${formatDuration(active.adjustedDurationSeconds)}). ${modeReason}`;

    const congested = this.roadSegments.filter((s) => s.congestionLevel !== 'NONE');
    let congestionSummary: string;
    if (congested.length === 0) {
      congestionSummary =
        'All monitored corridors along this route are clear with no traffic delays.';
    } else if (active.congestionPenaltySeconds > 0) {
      congestionSummary = `${congested.length} road segment(s) currently have simulated congestion; this route experiences +${formatDuration(active.congestionPenaltySeconds)} traffic delay on ${active.affectedSegments.join(', ')}.`;
    } else {
      const topCongested = congested
        .slice(0, 2)
        .map((s) => `${s.name} (${s.congestionLevel})`)
        .join(', ');
      congestionSummary = `Simulated congestion reported on ${topCongested}${congested.length > 2 ? ` +${congested.length - 2} more` : ''}. Active route avoids all delayed corridors (0s delay).`;
    }

    const otherNotes: string[] = [];
    for (const m of ['shortest', 'fastest', 'congestion_aware'] as RoutingMode[]) {
      if (m === this.selectedMode) continue;
      const cand = this.routeCandidates[m];
      if (!cand) continue;
      const diffSec = cand.adjustedDurationSeconds - active.adjustedDurationSeconds;
      const diffLabel =
        diffSec > 0
          ? `${formatDuration(diffSec)} slower`
          : diffSec < 0
            ? `${formatDuration(Math.abs(diffSec))} faster`
            : 'same ETA';
      otherNotes.push(
        `${cand.label}: ${(cand.distanceMeters / 1000).toFixed(2)} km, ${formatDuration(cand.adjustedDurationSeconds)} (${diffLabel})`
      );
    }

    const alternativesSummary =
      otherNotes.length > 0
        ? `Alternative options: ${otherNotes.join(' · ')}.`
        : 'All three route options evaluated for comparison.';

    let rerouteReason: string | null = null;
    if (this.rerouteComparison) {
      const cmp = this.rerouteComparison;
      const corridorChanged = cmp.previousRoute.corridorSummary !== cmp.newRoute.corridorSummary;
      const rawDeltaSec =
        cmp.previousRoute.adjustedDurationSeconds - cmp.newRoute.adjustedDurationSeconds;
      rerouteReason =
        rawDeltaSec > 0
          ? `Rerouted due to ${cmp.congestionLevel} traffic on ${cmp.affectedRoadName}. Switched to ${cmp.newRoute.corridorSummary}, saving ${formatDuration(rawDeltaSec)}.`
          : rawDeltaSec < 0
            ? `Evaluated ${cmp.congestionLevel} traffic on ${cmp.affectedRoadName}. Alternate corridor (${cmp.newRoute.corridorSummary}) adds ${formatDuration(Math.abs(rawDeltaSec))} vs previous corridor.`
            : corridorChanged
              ? `Rerouted due to ${cmp.congestionLevel} traffic on ${cmp.affectedRoadName}. Switched to ${cmp.newRoute.corridorSummary} to bypass the congested road.`
              : `Traffic alert evaluated on ${cmp.affectedRoadName} (${cmp.congestionLevel}). ${cmp.newRoute.corridorSummary} remains the fastest available route.`;
    }

    return {
      headline: `${active.label} · ${active.corridorSummary}`,
      selectionReason,
      congestionSummary,
      alternativesSummary,
      rerouteReason,
    };
  }

  public getSnapshot(): SernSystemSnapshot {
    return {
      scenarioName: this.scenarioName,
      referenceLocation: { ...this.referenceLocation, coord: { ...this.referenceLocation.coord } },
      incident: { ...this.incident },
      selectedHospitalId: this.selectedHospitalId,
      selectedMode: this.selectedMode,
      autoRerouteEnabled: this.autoRerouteEnabled,
      dataDisclaimer:
        'Simulated GPS telemetry, traffic congestion, and hospital bed availability for RNSIT / RR Nagar (Bengaluru) emergency dispatch demonstration.',
      isRoutingLoading: this.isRoutingLoading,
      lastError: this.lastError,
      ambulance: {
        ...this.ambulance,
        startCoord: { ...this.ambulance.startCoord },
        currentCoord: { ...this.ambulance.currentCoord },
      },
      activeRoute: this.activeRoute ? { ...this.activeRoute } : null,
      previousRoute: this.previousRoute ? { ...this.previousRoute } : null,
      routeCandidates: { ...this.routeCandidates },
      rerouteComparison: this.rerouteComparison ? { ...this.rerouteComparison } : null,
      routeExplanation: this.buildRouteExplanation(),
      hospitals: this.hospitals.map((h) => ({ ...h })),
      signals: this.signals.map((s) => ({ ...s })),
      roadSegments: this.roadSegments.map((r) => ({ ...r })),
      greenCorridor: { ...this.greenCorridor },
      events: [...this.events],
    };
  }

  /**
   * Exposes node catalog for testing or inspection.
   */
  public getNodes() {
    return BENGALURU_NODES;
  }
}
