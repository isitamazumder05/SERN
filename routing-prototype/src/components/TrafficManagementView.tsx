import { useState } from 'react';
import { AlertTriangle, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatDistance, formatDuration } from '../core/geo';
import type { CongestionLevel, SernSystemSnapshot } from '../core/types';

interface TrafficManagementViewProps {
  snapshot: SernSystemSnapshot;
  onSimulateCongestion: (segmentId: string, level: CongestionLevel) => void;
  onManualReroute: () => void;
  onToggleAutoReroute: (enabled: boolean) => void;
}

export function TrafficManagementView({
  snapshot,
  onSimulateCongestion,
  onManualReroute,
  onToggleAutoReroute,
}: TrafficManagementViewProps) {
  // Default select a segment currently on the active route so demonstration is immediately impactful
  const defaultSegment =
    snapshot.roadSegments.find((s) =>
      snapshot.activeRoute?.traversedSegmentIds.includes(s.id)
    ) ?? snapshot.roadSegments[0];

  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(defaultSegment?.id ?? '');
  const [selectedLevel, setSelectedLevel] = useState<CongestionLevel>('HIGH');

  const activeSegmentId = snapshot.roadSegments.some((s) => s.id === selectedSegmentId)
    ? selectedSegmentId
    : defaultSegment?.id ?? '';

  const affectedSegments = snapshot.roadSegments.filter((s) => s.congestionLevel !== 'NONE');
  const comparison = snapshot.rerouteComparison;

  const handleApplyCongestion = () => {
    if (!activeSegmentId) return;
    onSimulateCongestion(activeSegmentId, selectedLevel);
  };

  return (
    <div className="space-y-5">
      {/* Congestion Simulator Controls */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-white">
              Simulated Traffic Congestion & Automatic Rerouting
            </h2>
            <p className="text-xs text-slate-400">
              Simulate LOW, MEDIUM, or HIGH traffic congestion on any Bengaluru road corridor to evaluate delays and trigger automatic emergency rerouting.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={snapshot.autoRerouteEnabled}
                onChange={(e) => onToggleAutoReroute(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Auto-Reroute on Congestion</span>
            </label>

            <button
              type="button"
              onClick={onManualReroute}
              disabled={snapshot.isRoutingLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Recalculate Reroute</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6 space-y-1.5">
            <label htmlFor="congestion-segment-select" className="block text-xs font-medium text-slate-300">
              Select Road Segment or Corridor
            </label>
            <select
              id="congestion-segment-select"
              value={activeSegmentId}
              onChange={(e) => setSelectedSegmentId(e.target.value)}
              className="w-full rounded-lg bg-[#080d17] border border-slate-700 px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            >
              {snapshot.roadSegments.map((seg) => {
                const onRoute = snapshot.activeRoute?.traversedSegmentIds.includes(seg.id);
                return (
                  <option key={seg.id} value={seg.id}>
                    {onRoute ? '[ON ACTIVE ROUTE] ' : ''}
                    {seg.name} — {seg.congestionLevel === 'NONE' ? 'Free Flow' : `${seg.congestionLevel} (${seg.congestionMultiplier}x)`}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <span className="block text-xs font-medium text-slate-300">
              Simulated Congestion Severity
            </span>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#080d17] border border-slate-800">
              {(['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors ${
                    selectedLevel === lvl
                      ? lvl === 'HIGH'
                        ? 'bg-red-600 text-white'
                        : lvl === 'MEDIUM'
                          ? 'bg-amber-500 text-slate-950'
                          : lvl === 'LOW'
                            ? 'bg-yellow-500 text-slate-950'
                            : 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {lvl === 'NONE' ? 'Clear' : lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={handleApplyCongestion}
              disabled={snapshot.isRoutingLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {snapshot.isRoutingLoading ? 'Updating...' : 'Apply Traffic'}
            </button>
          </div>
        </div>
      </div>

      {/* Before and After Rerouting Comparison */}
      {comparison ? (
        <div className="rounded-xl bg-[#0f172a] border border-amber-500/40 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <h3 className="font-display text-sm font-bold text-white">
                Automatic Reroute Comparison · {comparison.affectedRoadName} ({comparison.congestionLevel})
              </h3>
            </div>
            <span className="font-mono text-xs text-emerald-400 font-semibold">
              Estimated Time Saved: {formatDuration(comparison.timeSavedSeconds)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
            {/* Old Congested Route */}
            <div className="md:col-span-5 rounded-lg bg-[#0b111e] border border-orange-500/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-orange-400">Previous Route (Orange Dashed)</span>
                <span className="font-mono text-slate-400">{comparison.previousRoute.corridorSummary}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-[11px] text-slate-400">Distance</div>
                  <div className="font-mono text-sm font-bold tabular-nums text-slate-200">
                    {formatDistance(comparison.previousRoute.distanceMeters)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Congested ETA</div>
                  <div className="font-mono text-sm font-bold tabular-nums text-orange-400">
                    {formatDuration(comparison.previousRoute.adjustedDurationSeconds)}
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-1 flex justify-center">
              <ArrowRight className="h-5 w-5 text-emerald-400 rotate-90 md:rotate-0" />
            </div>

            {/* New Optimized Route */}
            <div className="md:col-span-5 rounded-lg bg-[#0b111e] border border-emerald-500/50 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400">New Optimized Route (Green)</span>
                <span className="font-mono text-slate-400">{comparison.newRoute.corridorSummary}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-[11px] text-slate-400">Distance</div>
                  <div className="font-mono text-sm font-bold tabular-nums text-white">
                    {formatDistance(comparison.newRoute.distanceMeters)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Optimized ETA</div>
                  <div className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                    {formatDuration(comparison.newRoute.adjustedDurationSeconds)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 text-xs text-slate-400 flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            No active reroute comparison yet. Simulate <strong className="text-slate-200">HIGH</strong> congestion on an active route segment above to trigger automatic rerouting and compare old vs. new routes.
          </span>
        </div>
      )}

      {/* Road Segment Congestion Table */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-white">
            Monitored Bengaluru Road Segments ({affectedSegments.length} congested)
          </h3>
          <span className="text-[11px] text-slate-400">
            Simulated traffic cost multipliers
          </span>
        </div>

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0b111e] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Road Segment</th>
                <th className="py-2.5 px-4 font-medium">Corridor</th>
                <th className="py-2.5 px-4 font-medium text-right">Length</th>
                <th className="py-2.5 px-4 font-medium text-right">Base Speed</th>
                <th className="py-2.5 px-4 font-medium text-right">Cost Multiplier</th>
                <th className="py-2.5 px-4 font-medium">Congestion</th>
                <th className="py-2.5 px-4 font-medium text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {snapshot.roadSegments.map((seg) => {
                const onActive = snapshot.activeRoute?.traversedSegmentIds.includes(seg.id);
                return (
                  <tr key={seg.id} className={onActive ? 'bg-slate-800/25' : 'hover:bg-slate-800/20'}>
                    <td className="py-2.5 px-4 font-medium text-slate-100">
                      {seg.name}
                      {onActive && (
                        <span className="ml-2 text-[11px] text-emerald-400 font-normal">
                          Active Route
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{seg.corridor}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {formatDistance(seg.distanceMeters)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {seg.baseSpeedKmh} km/h
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                      {seg.congestionMultiplier.toFixed(2)}x
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`font-mono font-semibold ${
                          seg.congestionLevel === 'HIGH'
                            ? 'text-red-400'
                            : seg.congestionLevel === 'MEDIUM'
                              ? 'text-amber-400'
                              : seg.congestionLevel === 'LOW'
                                ? 'text-yellow-400'
                                : 'text-emerald-400'
                        }`}
                      >
                        {seg.congestionLevel === 'NONE' ? 'CLEAR' : seg.congestionLevel}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {seg.congestionLevel === 'NONE' ? (
                        <button
                          type="button"
                          onClick={() => onSimulateCongestion(seg.id, 'HIGH')}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300"
                        >
                          Simulate HIGH
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSimulateCongestion(seg.id, 'NONE')}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
