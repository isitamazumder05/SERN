import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { BengaluruMap } from './components/BengaluruMap';
import {
  EmergencyCaseSummary,
  WhyThisRoutePanel,
} from './components/DashboardSummaryPanels';
import { EventLogsView } from './components/EventLogsView';
import { GreenCorridorView } from './components/GreenCorridorView';
import { HospitalsView } from './components/HospitalsView';
import { KpiStrip } from './components/KpiStrip';
import { RouteOptimizationView } from './components/RouteOptimizationView';
import { Sidebar, type NavSectionId } from './components/Sidebar';
import { SimulationView } from './components/SimulationView';
import { TelemetryPanel } from './components/TelemetryPanel';
import { TopBar } from './components/TopBar';
import { TrafficManagementView } from './components/TrafficManagementView';
import { formatDistance, formatDuration } from './core/geo';
import type { CongestionLevel, RoutingMode, SernSystemSnapshot } from './core/types';
import { sernApi } from './services/sernApi';

export default function App() {
  const [snapshot, setSnapshot] = useState<SernSystemSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<NavSectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [rerouteNotice, setRerouteNotice] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await sernApi.getState();
      setSnapshot(data);
      setErrorBanner(data.lastError);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to reach SERN backend API');
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Real-time polling: fast (200ms) while simulation runs, relaxed (1500ms) when idle
  useEffect(() => {
    const isMoving =
      snapshot &&
      (snapshot.ambulance.status === 'DISPATCHED' || snapshot.ambulance.status === 'EN_ROUTE') &&
      !snapshot.ambulance.isPaused;

    const intervalMs = isMoving ? 200 : 1500;
    const timer = setInterval(fetchSnapshot, intervalMs);
    return () => clearInterval(timer);
  }, [snapshot?.ambulance.status, snapshot?.ambulance.isPaused, fetchSnapshot]);

  const runAction = async (fn: () => Promise<SernSystemSnapshot>) => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const updated = await fn();
      setSnapshot(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSelectMode = (mode: RoutingMode) => {
    const isMidTrip =
      snapshot?.ambulance.status === 'DISPATCHED' || snapshot?.ambulance.status === 'EN_ROUTE';
    runAction(() =>
      sernApi.calculateRoute({
        mode,
        fromCurrentPosition: Boolean(isMidTrip),
      })
    );
  };

  const handleSelectHospital = (hospitalId: string) => {
    const isMidTrip =
      snapshot?.ambulance.status === 'DISPATCHED' || snapshot?.ambulance.status === 'EN_ROUTE';
    runAction(() =>
      sernApi.calculateRoute({
        hospitalId,
        fromCurrentPosition: Boolean(isMidTrip),
      })
    );
  };

  const handleStartOrResume = () => runAction(() => sernApi.startSimulation());
  const handlePause = () => runAction(() => sernApi.pauseSimulation());
  const handleReset = () => {
    setRerouteNotice(null);
    return runAction(() => sernApi.resetSimulation());
  };
  const handleSetSpeed = (mult: number) => runAction(() => sernApi.setSpeedMultiplier(mult));

  const handleSimulateCongestion = async (segmentId: string, level: CongestionLevel) => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const updated = await sernApi.simulateCongestion(segmentId, level);
      setSnapshot(updated);
      if (updated.rerouteComparison && (level === 'HIGH' || level === 'MEDIUM')) {
        const cmp = updated.rerouteComparison;
        const deltaSec =
          cmp.previousRoute.adjustedDurationSeconds - cmp.newRoute.adjustedDurationSeconds;
        const corridorChanged =
          cmp.previousRoute.corridorSummary !== cmp.newRoute.corridorSummary;
        setRerouteNotice(
          deltaSec > 0
            ? `Heavy congestion (${level}) detected on ${cmp.affectedRoadName}. Rerouted via ${cmp.newRoute.corridorSummary}, saving ${formatDuration(
                deltaSec
              )}.`
            : deltaSec < 0
              ? `Congestion (${level}) detected on ${cmp.affectedRoadName}. Alternate corridor (${cmp.newRoute.corridorSummary}) adds ${formatDuration(
                  Math.abs(deltaSec)
                )}.`
              : corridorChanged
                ? `Congestion (${level}) detected on ${cmp.affectedRoadName}. Rerouted via ${cmp.newRoute.corridorSummary} to avoid delays.`
                : `Traffic update (${level}) applied on ${cmp.affectedRoadName}. ${cmp.newRoute.corridorSummary} remains the fastest available route.`
        );
      } else if (level === 'NONE') {
        setRerouteNotice(null);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to apply traffic congestion');
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickDemoCongestion = () => {
    // Pick the longest upcoming segment on the active route so rerouting chooses an alternate arterial corridor
    const segIds = snapshot?.activeRoute?.traversedSegmentIds ?? [];
    const activeSegs = snapshot?.roadSegments.filter(
      (s) => segIds.includes(s.id) && s.congestionLevel === 'NONE'
    ) ?? [];
    const longestSeg = activeSegs.sort((a, b) => b.distanceMeters - a.distanceMeters)[0];
    const targetSegId =
      longestSeg?.id ?? segIds[Math.min(2, Math.max(0, segIds.length - 1))] ?? 'seg_beml_ideal';
    handleSimulateCongestion(targetSegId, 'HIGH');
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#080d17] text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-xl bg-[#0f172a] border border-slate-800 px-6 py-5 flex items-center gap-3 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          <span>Initializing SERN Smart Routing & Bengaluru GIS Network...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#080d17] text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        eventCount={snapshot.events.length}
        greenCorridorActive={snapshot.greenCorridor.status === 'ACTIVE_PRIORITIZATION'}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          activeSection={activeSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          ambulanceStatus={snapshot.ambulance.status}
          isPaused={snapshot.ambulance.isPaused}
          onStartOrResume={handleStartOrResume}
          onPause={handlePause}
          onReset={handleReset}
          events={snapshot.events}
          rerouteComparison={snapshot.rerouteComparison}
          onNavigateEvents={() => setActiveSection('event_logs')}
          isLoading={busyAction || snapshot.isRoutingLoading}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {/* Error or Rerouting Notification Banners */}
          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl bg-red-950/40 border border-red-500/40 px-4 py-3 text-xs text-red-200 flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{errorBanner}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-red-300 hover:text-white font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {rerouteNotice && (
            <div
              role="status"
              className="rounded-xl bg-amber-950/35 border border-amber-500/40 px-4 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{rerouteNotice}</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSection('traffic_management')}
                  className="text-amber-300 hover:text-amber-200 font-semibold inline-flex items-center gap-1"
                >
                  <span>Inspect Comparison</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRerouteNotice(null)}
                  className="text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Section Content */}
          {activeSection === 'overview' && (
            <div className="space-y-5">
              <KpiStrip snapshot={snapshot} />

              <EmergencyCaseSummary
                snapshot={snapshot}
                busyAction={busyAction}
                onDispatch={handleStartOrResume}
                onQuickCongestion={handleQuickDemoCongestion}
                onOpenGreenCorridor={() => setActiveSection('green_corridor')}
              />

              {/* Main Map + Telemetry Side Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8 xl:col-span-9">
                  <BengaluruMap
                    snapshot={snapshot}
                    onSelectHospital={handleSelectHospital}
                  />
                </div>
                <div className="lg:col-span-4 xl:col-span-3">
                  <TelemetryPanel
                    snapshot={snapshot}
                    onSelectMode={handleSelectMode}
                    onSelectHospital={handleSelectHospital}
                  />
                </div>
              </div>

              <WhyThisRoutePanel
                snapshot={snapshot}
                onCompareRoutes={() => setActiveSection('route_optimization')}
              />

              {/* Compact Bottom Row: Route Candidates Summary + Latest Events */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-white">
                      Calculated Route Options
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSection('route_optimization')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Open Optimization Engine
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['shortest', 'fastest', 'congestion_aware'] as const).map((key) => {
                      const r = snapshot.routeCandidates[key];
                      if (!r) return null;
                      const active = snapshot.selectedMode === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleSelectMode(key)}
                          className={`text-left rounded-lg p-3 border transition-colors ${
                            active
                              ? 'bg-[#101c2e] border-emerald-500/60'
                              : 'bg-[#0b111e] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-white">
                              {key === 'shortest'
                                ? 'Shortest'
                                : key === 'fastest'
                                  ? 'Fastest'
                                  : 'Congestion-Aware'}
                            </span>
                            {active && (
                              <span className="text-[11px] font-semibold text-emerald-400">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                            {formatDuration(r.adjustedDurationSeconds)}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                            {formatDistance(r.distanceMeters)} · {r.averageSpeedKmh} km/h
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="xl:col-span-5 rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-white">
                      Latest Event History
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSection('event_logs')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      View all ({snapshot.events.length})
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {snapshot.events.slice(0, 5).map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-start justify-between gap-2 text-xs py-1.5 border-b border-slate-800/60 last:border-0"
                      >
                        <span className="text-slate-200 leading-snug">{evt.description}</span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString('en-IN', {
                            hour12: false,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'live_map' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-8 xl:col-span-9">
                <BengaluruMap
                  snapshot={snapshot}
                  heightClass="h-[calc(100vh-200px)] min-h-[500px]"
                  onSelectHospital={handleSelectHospital}
                />
              </div>
              <div className="lg:col-span-4 xl:col-span-3">
                <TelemetryPanel
                  snapshot={snapshot}
                  onSelectMode={handleSelectMode}
                  onSelectHospital={handleSelectHospital}
                />
              </div>
            </div>
          )}

          {activeSection === 'route_optimization' && (
            <RouteOptimizationView
              snapshot={snapshot}
              onSelectMode={handleSelectMode}
              onSelectHospital={handleSelectHospital}
              onRecalculate={() =>
                runAction(() =>
                  sernApi.calculateRoute({
                    mode: snapshot.selectedMode,
                    hospitalId: snapshot.selectedHospitalId,
                    fromCurrentPosition:
                      snapshot.ambulance.status === 'DISPATCHED' ||
                      snapshot.ambulance.status === 'EN_ROUTE',
                  })
                )
              }
            />
          )}

          {activeSection === 'ambulance_simulation' && (
            <SimulationView
              snapshot={snapshot}
              onStartOrResume={handleStartOrResume}
              onPause={handlePause}
              onReset={handleReset}
              onSetSpeed={handleSetSpeed}
              onSelectHospital={handleSelectHospital}
            />
          )}

          {activeSection === 'traffic_management' && (
            <TrafficManagementView
              snapshot={snapshot}
              onSimulateCongestion={handleSimulateCongestion}
              onManualReroute={() =>
                runAction(() =>
                  sernApi.triggerReroute({
                    reason: 'Manual congestion-aware reroute triggered from Traffic Management',
                  })
                )
              }
              onToggleAutoReroute={(enabled) =>
                runAction(() => sernApi.setAutoReroute(enabled))
              }
            />
          )}

          {activeSection === 'green_corridor' && (
            <GreenCorridorView
              snapshot={snapshot}
              onToggleGreenCorridor={(enabled) =>
                runAction(() => sernApi.toggleGreenCorridor(enabled))
              }
              onStartOrResume={handleStartOrResume}
              onPause={handlePause}
              onReset={handleReset}
            />
          )}

          {activeSection === 'hospitals' && (
            <HospitalsView
              snapshot={snapshot}
              onSelectHospital={handleSelectHospital}
            />
          )}

          {activeSection === 'event_logs' && <EventLogsView events={snapshot.events} />}
        </main>
      </div>
    </div>
  );
}
