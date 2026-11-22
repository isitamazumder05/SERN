import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { SernEngine } from './src/core/sernEngine';
import type { CongestionLevel, RoutingMode } from './src/core/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const VALID_MODES: RoutingMode[] = ['shortest', 'fastest', 'congestion_aware'];
const VALID_CONGESTION: CongestionLevel[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

async function bootstrap() {
  const app = express();
  app.use(express.json());

  const engine = new SernEngine({ useOsrm: true });
  await engine.initializeRoutes();

  // Authoritative simulation tick loop (150ms resolution for smooth progression & precise signal gating)
  setInterval(() => {
    engine.stepSimulation(0.15);
  }, 150);

  // Full state snapshot for dashboard synchronization
  app.get('/api/state', (_req, res) => {
    res.json(engine.getSnapshot());
  });

  // POST /api/route/calculate
  app.post('/api/route/calculate', async (req, res) => {
    try {
      const { hospitalId, mode, fromCurrentPosition } = req.body ?? {};
      if (mode && !VALID_MODES.includes(mode)) {
        res.status(400).json({ error: `Invalid routing mode: ${mode}` });
        return;
      }
      const snapshot = await engine.calculateRoutes({
        hospitalId: typeof hospitalId === 'string' ? hospitalId : undefined,
        mode: mode as RoutingMode | undefined,
        fromCurrentPosition: Boolean(fromCurrentPosition),
      });
      res.json({
        success: true,
        activeRoute: snapshot.activeRoute,
        routeCandidates: snapshot.routeCandidates,
        snapshot,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Route calculation failed' });
    }
  });

  // POST /api/route/reroute
  app.post('/api/route/reroute', async (req, res) => {
    try {
      const { affectedRoadName, congestionLevel, reason } = req.body ?? {};
      const level = VALID_CONGESTION.includes(congestionLevel) ? congestionLevel : 'HIGH';
      const snapshot = await engine.triggerReroute(
        typeof affectedRoadName === 'string' ? affectedRoadName : 'Selected Corridor',
        level,
        typeof reason === 'string' ? reason : 'Manual reroute requested'
      );
      res.json({
        success: true,
        rerouteComparison: snapshot.rerouteComparison,
        activeRoute: snapshot.activeRoute,
        previousRoute: snapshot.previousRoute,
        snapshot,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Reroute failed' });
    }
  });

  // POST /api/simulation/start
  app.post('/api/simulation/start', (_req, res) => {
    const snapshot = engine.startSimulation();
    res.json({ success: true, ambulance: snapshot.ambulance, snapshot });
  });

  // POST /api/simulation/pause
  app.post('/api/simulation/pause', (_req, res) => {
    const snapshot = engine.pauseSimulation();
    res.json({ success: true, ambulance: snapshot.ambulance, snapshot });
  });

  // POST /api/simulation/reset
  app.post('/api/simulation/reset', async (_req, res) => {
    try {
      const snapshot = await engine.resetSimulation();
      res.json({ success: true, snapshot });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Reset failed' });
    }
  });

  // POST /api/simulation/speed
  app.post('/api/simulation/speed', (req, res) => {
    const { speedMultiplier } = req.body ?? {};
    const num = Number(speedMultiplier);
    if (!Number.isFinite(num) || num < 1 || num > 12) {
      res.status(400).json({ error: 'speedMultiplier must be between 1 and 12' });
      return;
    }
    const snapshot = engine.setSpeedMultiplier(num);
    res.json({ success: true, ambulance: snapshot.ambulance, snapshot });
  });

  // POST /api/traffic/congestion
  app.post('/api/traffic/congestion', async (req, res) => {
    try {
      const { segmentId, level } = req.body ?? {};
      if (typeof segmentId !== 'string' || !VALID_CONGESTION.includes(level)) {
        res.status(400).json({ error: 'Valid segmentId and level (NONE|LOW|MEDIUM|HIGH) required' });
        return;
      }
      const snapshot = await engine.simulateCongestion(segmentId, level);
      res.json({
        success: true,
        roadSegments: snapshot.roadSegments,
        rerouteComparison: snapshot.rerouteComparison,
        snapshot,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Congestion update failed' });
    }
  });

  // POST /api/traffic/green-corridor
  app.post('/api/traffic/green-corridor', (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled boolean is required' });
      return;
    }
    const snapshot = engine.toggleGreenCorridor(enabled);
    res.json({
      success: true,
      greenCorridor: snapshot.greenCorridor,
      signals: snapshot.signals,
      snapshot,
    });
  });

  // POST /api/traffic/auto-reroute
  app.post('/api/traffic/auto-reroute', (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled boolean is required' });
      return;
    }
    const snapshot = engine.setAutoReroute(enabled);
    res.json({ success: true, autoRerouteEnabled: snapshot.autoRerouteEnabled, snapshot });
  });

  // GET /api/ambulance/status
  app.get('/api/ambulance/status', (_req, res) => {
    const snap = engine.getSnapshot();
    res.json({
      ambulance: snap.ambulance,
      incident: snap.incident,
      activeRoute: snap.activeRoute
        ? {
            id: snap.activeRoute.id,
            mode: snap.activeRoute.mode,
            distanceMeters: snap.activeRoute.distanceMeters,
            adjustedDurationSeconds: snap.activeRoute.adjustedDurationSeconds,
            source: snap.activeRoute.source,
          }
        : null,
    });
  });

  // GET /api/traffic/signals
  app.get('/api/traffic/signals', (_req, res) => {
    const snap = engine.getSnapshot();
    res.json({
      greenCorridor: snap.greenCorridor,
      signals: snap.signals,
      roadSegments: snap.roadSegments,
    });
  });

  // GET /api/hospitals
  app.get('/api/hospitals', (_req, res) => {
    const snap = engine.getSnapshot();
    res.json({
      selectedHospitalId: snap.selectedHospitalId,
      hospitals: snap.hospitals,
    });
  });

  // GET /api/events
  app.get('/api/events', (_req, res) => {
    const snap = engine.getSnapshot();
    res.json({
      count: snap.events.length,
      events: snap.events,
    });
  });

  // Mount Vite middleware in development, or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERN SMART ROUTING server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start SERN server:', err);
  process.exit(1);
});
