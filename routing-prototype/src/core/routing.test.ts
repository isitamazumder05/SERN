import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENGALURU_AMBULANCE_START,
  BENGALURU_DEFAULT_INCIDENT,
  BENGALURU_NODES,
  CONGESTION_MULTIPLIERS,
  RNSIT_REFERENCE_LOCATION,
  buildBengaluruRoadSegments,
  buildBengaluruSignals,
} from './bengaluruNetwork';
import {
  extractRoutePrefix,
  haversineDistanceMeters,
  interpolateAlongRoute,
  shortestAngleDeltaDeg,
} from './geo';
import { findGraphPath, getDijkstraEdgeWeight } from './graphRouter';
import { SernEngine } from './sernEngine';
import { evaluateGreenCorridorSignals } from './trafficEngine';

test('RNSIT campus reference, nearby accident, and simulated ambulance staging coordinates are realistic', () => {
  // Exact verified RNSIT campus coordinates (Channasandra, RR Nagar, Bengaluru)
  assert.equal(RNSIT_REFERENCE_LOCATION.coord.lat, 12.9011);
  assert.equal(RNSIT_REFERENCE_LOCATION.coord.lng, 77.5181);

  // Demonstration accident near RNSIT Main Gate Approach (< 300 m from campus reference)
  const rnsitToIncident = haversineDistanceMeters(
    RNSIT_REFERENCE_LOCATION.coord,
    BENGALURU_DEFAULT_INCIDENT.coord
  );
  assert.ok(
    rnsitToIncident > 50 && rnsitToIncident < 350,
    `Expected incident near RNSIT Gate, got ${rnsitToIncident.toFixed(1)} m`
  );

  // Simulated ambulance starting point nearby in Channasandra (250 m - 1000 m from incident)
  const startToIncident = haversineDistanceMeters(
    BENGALURU_AMBULANCE_START.coord,
    BENGALURU_DEFAULT_INCIDENT.coord
  );
  assert.ok(
    startToIncident > 250 && startToIncident < 1000,
    `Expected nearby ambulance start, got ${startToIncident.toFixed(1)} m`
  );

  // RNSIT Gate -> SPARSH Hospital RR Nagar realistic span (~2.5 - 3.5 km straight-line)
  const sparshCoord = { lat: 12.92688, lng: 77.51892 };
  const rnsitToSparsh = haversineDistanceMeters(RNSIT_REFERENCE_LOCATION.coord, sparshCoord);
  assert.ok(
    rnsitToSparsh > 2400 && rnsitToSparsh < 3500,
    `Expected ~2.87 km RNSIT->SPARSH span, got ${rnsitToSparsh}`
  );
});

test('Polyline interpolation stays bounded and reaches destination smoothly', () => {
  const path = [
    BENGALURU_AMBULANCE_START.coord,
    BENGALURU_DEFAULT_INCIDENT.coord,
    { lat: 12.92688, lng: 77.51892 },
  ];
  const start = interpolateAlongRoute(path, 0);
  assert.equal(start.coord.lat, path[0].lat);

  const end = interpolateAlongRoute(path, 999999);
  assert.equal(end.coord.lat, path[2].lat);
  assert.equal(end.coord.lng, path[2].lng);
});

test('shortestAngleDeltaDeg and extractRoutePrefix handle 360 wrap and trail extraction', () => {
  assert.equal(shortestAngleDeltaDeg(350, 10), 20);
  assert.equal(shortestAngleDeltaDeg(10, 350), -20);

  const path = [
    BENGALURU_AMBULANCE_START.coord,
    { lat: 12.91282, lng: 77.51597 },
    { lat: 12.92688, lng: 77.51892 },
  ];
  const prefix = extractRoutePrefix(path, 800);
  assert.equal(prefix.length, 2);
  assert.ok(haversineDistanceMeters(prefix[0], prefix[1]) > 790);
  assert.ok(haversineDistanceMeters(prefix[0], prefix[1]) < 810);
});

test('Genuine Dijkstra produces predecessor trace, edge weights, and switches corridor under HIGH congestion', () => {
  const segments = buildBengaluruRoadSegments();
  const shortest = findGraphPath('n_ambulance_staging', 'n_sparsh_hosp', segments, 'shortest');
  const fastest = findGraphPath('n_ambulance_staging', 'n_sparsh_hosp', segments, 'fastest');
  assert.ok(shortest && fastest);
  assert.ok(shortest.distanceMeters <= fastest.distanceMeters);

  // Verify predecessor pointer chain matches reconstructed nodeIds
  assert.equal(shortest.dijkstraTrace.pathNodes[0].predecessorNodeId, null);
  for (let i = 1; i < shortest.dijkstraTrace.pathNodes.length; i++) {
    assert.equal(
      shortest.dijkstraTrace.pathNodes[i].predecessorNodeId,
      shortest.dijkstraTrace.pathNodes[i - 1].nodeId
    );
  }
  assert.equal(shortest.dijkstraTrace.pathEdges.length, shortest.nodeIds.length - 1);
  assert.ok(shortest.dijkstraTrace.nodesEvaluated >= shortest.nodeIds.length);
  assert.ok(shortest.dijkstraTrace.edgesRelaxed >= shortest.dijkstraTrace.pathEdges.length);

  // Verify edge weight formulas directly
  const sampleSeg = segments[0];
  assert.equal(getDijkstraEdgeWeight(sampleSeg, 'shortest'), sampleSeg.distanceMeters);
  assert.ok(
    getDijkstraEdgeWeight(sampleSeg, 'congestion_aware') <
      getDijkstraEdgeWeight(
        { ...sampleSeg, congestionMultiplier: CONGESTION_MULTIPLIERS.HIGH },
        'congestion_aware'
      )
  );

  // Inject HIGH congestion along RR Nagar Main / Double Rd (Channasandra -> BEML 5th -> Ideal Homes)
  for (const seg of segments) {
    if (seg.id === 'seg_channasandra_beml' || seg.id === 'seg_beml_ideal') {
      seg.congestionLevel = 'HIGH';
      seg.congestionMultiplier = CONGESTION_MULTIPLIERS.HIGH;
    }
  }

  const rerouted = findGraphPath('n_ambulance_staging', 'n_sparsh_hosp', segments, 'congestion_aware');
  assert.ok(rerouted);
  assert.equal(
    rerouted.segments.some((s) => s.id === 'seg_beml_ideal'),
    false,
    'Congestion-aware Dijkstra should avoid HIGH congestion BEML 5th Stage -> Ideal Homes segment'
  );
  assert.ok(
    rerouted.segments.some(
      (s) =>
        s.id === 'seg_channasandra_kenchenahalli' ||
        s.id === 'seg_kenchenahalli_ideal' ||
        s.id === 'seg_mylasandra_global' ||
        s.id === 'seg_global_pattanagere' ||
        s.id === 'seg_pattanagere_ideal' ||
        s.id === 'seg_hosakerehalli_arch'
    ),
    'Congestion-aware Dijkstra should reroute via Kenchenahalli Main Rd or Mysore Rd / ORR bypass'
  );
});

test('Dijkstra handles unreachable destinations and invalid graph inputs safely', async () => {
  const segments = buildBengaluruRoadSegments();
  const disconnectedNodes = [
    ...BENGALURU_NODES,
    {
      id: 'n_isolated',
      name: 'Disconnected Node',
      area: 'Test',
      coord: { lat: 12.99, lng: 77.75 },
    },
  ];

  assert.equal(
    findGraphPath('n_ambulance_staging', 'n_isolated', segments, 'shortest', disconnectedNodes),
    null
  );
  assert.equal(findGraphPath('', 'n_sparsh_hosp', segments, 'fastest'), null);
  assert.equal(findGraphPath('n_unknown_a', 'n_sparsh_hosp', segments, 'congestion_aware'), null);

  const { calculateAllRoutes } = await import('./osrmService');
  await assert.rejects(
    () => calculateAllRoutes('n_ambulance_staging', 'n_nonexistent', segments, false),
    /unreachable/i
  );
});

test('Green corridor activates upcoming signals strictly sequentially by distance and restores passed signals', () => {
  const segments = buildBengaluruRoadSegments();
  const path = findGraphPath('n_ambulance_staging', 'n_sparsh_hosp', segments, 'shortest');
  assert.ok(path);

  const routeCandidate = {
    id: 'test_route',
    mode: 'shortest' as const,
    label: 'Shortest',
    corridorSummary: 'RR Nagar Main Rd',
    geometry: path.geometry,
    distanceMeters: path.distanceMeters,
    baseDurationSeconds: path.baseDurationSeconds,
    adjustedDurationSeconds: path.adjustedDurationSeconds,
    averageSpeedKmh: 38,
    congestionPenaltySeconds: 0,
    affectedSegments: [],
    traversedNodeIds: path.nodeIds,
    traversedSegmentIds: path.segments.map((s) => s.id),
    source: 'GRAPH_FALLBACK' as const,
    algorithmUsed: 'Test',
    dijkstraTrace: path.dijkstraTrace,
  };

  let signals = buildBengaluruSignals();
  const activatedOrder: number[] = [];
  const restoredOrder: number[] = [];

  // Advance ambulance in 80m increments from 0m to end of route
  for (let dist = 0; dist <= routeCandidate.distanceMeters; dist += 80) {
    const res = evaluateGreenCorridorSignals(signals, routeCandidate, dist, 'EN_ROUTE', true);
    signals = res.signals;

    const onRoute = signals
      .filter((s) => s.onActiveRoute)
      .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

    let seenNonRestored = false;
    let seenRed = false;
    for (const s of onRoute) {
      if (s.state === 'RESTORED') {
        assert.equal(seenNonRestored, false, `Out-of-order RESTORED at ${dist}m: ${s.id}`);
      } else {
        seenNonRestored = true;
      }
      if (s.state === 'RED') {
        seenRed = true;
      } else if (s.state === 'GREEN') {
        assert.equal(seenRed, false, `Out-of-order GREEN after RED at ${dist}m: ${s.id}`);
      }
    }

    for (const act of res.newlyActivatedSignals) {
      activatedOrder.push(act.sequenceOrder ?? 0);
    }
    for (const rst of res.newlyRestoredSignals) {
      restoredOrder.push(rst.sequenceOrder ?? 0);
    }
  }

  // Final arrival restores every on-route signal
  const arrival = evaluateGreenCorridorSignals(
    signals,
    routeCandidate,
    routeCandidate.distanceMeters,
    'ARRIVED',
    true
  );
  assert.equal(arrival.greenCorridor.restoredCount, arrival.greenCorridor.totalRouteSignals);
  assert.equal(arrival.greenCorridor.activatedCount, 0);

  assert.ok(activatedOrder.length >= 4);
  for (let i = 1; i < activatedOrder.length; i++) {
    assert.ok(activatedOrder[i] > activatedOrder[i - 1], 'Signals must activate strictly sequentially');
  }
  assert.ok(restoredOrder.length >= 3);
  for (let i = 1; i < restoredOrder.length; i++) {
    assert.ok(restoredOrder[i] > restoredOrder[i - 1], 'Signals must restore strictly sequentially');
  }
});

test('SernEngine logs full milestone lifecycle including APPROACHING and ARRIVED plus routeExplanation', async () => {
  const engine = new SernEngine({ useOsrm: false });
  const init = await engine.initializeRoutes();
  assert.equal(init.ambulance.status, 'STANDBY');
  assert.equal(init.referenceLocation.id, 'ref_rnsit');
  assert.ok(init.activeRoute && init.activeRoute.distanceMeters > 2500);
  assert.ok(init.activeRoute.dijkstraTrace && init.activeRoute.dijkstraTrace.nodesEvaluated >= 5);
  assert.ok(
    init.routeExplanation &&
      init.routeExplanation.selectionReason.includes('SPARSH RR Nagar') &&
      !init.routeExplanation.selectionReason.includes('Dijkstra')
  );

  const started = engine.startSimulation();
  assert.equal(started.ambulance.status, 'DISPATCHED');

  const stepped = engine.stepSimulation(15); // 15s * 6x = 90s simulated driving
  assert.equal(stepped.ambulance.status, 'EN_ROUTE');
  assert.ok(stepped.ambulance.distanceCoveredMeters > 300);

  const congested = await engine.simulateCongestion('seg_beml_ideal', 'HIGH');
  assert.ok(congested.rerouteComparison, 'HIGH congestion should trigger reroute comparison');
  assert.ok(congested.previousRoute, 'Previous route should be retained for comparison display');
  assert.ok(congested.routeExplanation?.rerouteReason, 'Reroute explanation should be populated');

  // Step until arrival in small increments so approaching & signal transitions are captured
  let current = congested;
  for (let i = 0; i < 200 && current.ambulance.status !== 'ARRIVED'; i++) {
    current = engine.stepSimulation(3);
  }
  assert.equal(current.ambulance.status, 'ARRIVED');
  assert.equal(current.ambulance.completionPercent, 100);
  assert.equal(current.greenCorridor.status, 'CLEARED');
  assert.equal(current.greenCorridor.restoredCount, current.greenCorridor.totalRouteSignals);

  const statuses = new Set(current.events.map((e) => e.status));
  for (const expected of [
    'ACCIDENT DETECTED',
    'CASE CREATED',
    'DISPATCHED',
    'APPROACHING',
    'ARRIVED',
    'SIGNAL GREEN',
    'RESTORED',
    'REROUTED',
  ]) {
    assert.ok(statuses.has(expected), `Expected event milestone ${expected} in logs`);
  }
});

test('Route geometry, distance, speed, and ambulance ETA remain mathematically consistent', async () => {
  const engine = new SernEngine({ useOsrm: false });
  const snap = await engine.initializeRoutes();
  const route = snap.activeRoute!;
  assert.ok(route.geometry.length >= 2);
  assert.ok(route.dijkstraTrace, 'Every active route must retain Dijkstra trace metadata');

  assert.equal(snap.ambulance.totalDistanceMeters, route.distanceMeters);
  assert.equal(snap.ambulance.remainingDistanceMeters, route.distanceMeters);
  assert.equal(snap.ambulance.etaSeconds, route.adjustedDurationSeconds);

  const expectedSpeed = route.distanceMeters / 1000 / (route.adjustedDurationSeconds / 3600);
  assert.ok(
    Math.abs(route.averageSpeedKmh - expectedSpeed) <= 0.2,
    `Expected speed ~${expectedSpeed.toFixed(1)}, got ${route.averageSpeedKmh}`
  );
});

test('Hybrid Dijkstra + OSRM routing snaps Dijkstra node sequences onto real road geometry', async () => {
  const { calculateAllRoutes } = await import('./osrmService');
  const segments = buildBengaluruRoadSegments();

  // Channasandra EMS Staging -> SPARSH Hospital RR Nagar with clean roads
  const cleanRoutes = await calculateAllRoutes('n_ambulance_staging', 'n_sparsh_hosp', segments, true);
  assert.ok(cleanRoutes.shortest.dijkstraTrace);
  assert.ok(cleanRoutes.fastest.dijkstraTrace);
  assert.ok(cleanRoutes.congestion_aware.dijkstraTrace);
  assert.ok(
    cleanRoutes.shortest.dijkstraTrace.graphDistanceMeters <=
      cleanRoutes.fastest.dijkstraTrace.graphDistanceMeters
  );
  // When OSRM responds online, source is OSRM_HYBRID; if sandbox blocks external OSRM, fallback works cleanly
  assert.ok(
    cleanRoutes.shortest.source === 'OSRM_HYBRID' || cleanRoutes.shortest.source === 'GRAPH_FALLBACK'
  );

  // Check RNSIT Staging -> SPARSH Hospital under HIGH congestion on BEML 5th Stage -> Ideal Homes
  for (const s of segments) {
    if (s.id === 'seg_channasandra_beml' || s.id === 'seg_beml_ideal') {
      s.congestionLevel = 'HIGH';
      s.congestionMultiplier = CONGESTION_MULTIPLIERS.HIGH;
    }
  }
  const rerouted = await calculateAllRoutes('n_ambulance_staging', 'n_sparsh_hosp', segments, true);
  assert.equal(
    rerouted.congestion_aware.traversedSegmentIds.includes('seg_beml_ideal'),
    false,
    'Congestion-aware Dijkstra should switch off HIGH congestion seg_beml_ideal'
  );
});
