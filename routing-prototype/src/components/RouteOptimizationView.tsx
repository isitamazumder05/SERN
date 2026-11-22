import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  RefreshCw,
  Route,
  ShieldAlert,
} from 'lucide-react';
import { formatDistance, formatDuration } from '../core/geo';
import type { RoutingMode, SernSystemSnapshot } from '../core/types';
import { BengaluruMap } from './BengaluruMap';

interface RouteOptimizationViewProps {
  snapshot: SernSystemSnapshot;
  onSelectMode: (mode: RoutingMode) => void;
  onSelectHospital?: (hospitalId: string) => void;
  onRecalculate: () => void;
}

export function RouteOptimizationView({
  snapshot,
  onSelectMode,
  onSelectHospital,
  onRecalculate,
}: RouteOptimizationViewProps) {
  const modes: {
    id: RoutingMode;
    title: string;
    subtitle: string;
    description: string;
  }[] = [
    {
      id: 'shortest',
      title: 'Shortest Route',
      subtitle: 'Minimum Travel Distance',
      description:
        'Selects the most direct road corridor to keep total travel distance as short as possible.',
    },
    {
      id: 'fastest',
      title: 'Fastest Route',
      subtitle: 'Highest Free-Flow Road Speed',
      description:
        'Prioritizes major arterial roads and highways for higher ambulance cruising speeds.',
    },
    {
      id: 'congestion_aware',
      title: 'Congestion-Aware Route',
      subtitle: 'Traffic-Adjusted Optimal ETA',
      description:
        'Accounts for live simulated road congestion to bypass delays and minimize arrival time.',
    },
  ];

  const activeRoute = snapshot.activeRoute;
  const explanation = snapshot.routeExplanation;
  const comparison = snapshot.rerouteComparison;
  const targetHospital = snapshot.hospitals.find(
    (h) => h.id === snapshot.selectedHospitalId
  );

  const congestedSegments = snapshot.roadSegments.filter(
    (s) => s.congestionLevel !== 'NONE'
  );

  const rerouteDeltaSeconds = comparison
    ? comparison.previousRoute.adjustedDurationSeconds -
      comparison.newRoute.adjustedDurationSeconds
    : 0;

  return (
    <div className="space-y-5">
      {/* Operator Header */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-white">
            Emergency Route Selection &amp; Comparison
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Review the active route to{' '}
            <span className="text-slate-200 font-medium">
              {targetHospital?.name ?? 'destination hospital'}
            </span>
            , monitor road traffic conditions, and switch between Shortest, Fastest, or
            Congestion-Aware dispatch routes.
          </p>
        </div>

        <button
          type="button"
          onClick={onRecalculate}
          disabled={snapshot.isRoutingLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${snapshot.isRoutingLoading ? 'animate-spin' : ''}`}
          />
          <span>
            {snapshot.isRoutingLoading ? 'Updating Routes...' : 'Refresh Routes'}
          </span>
        </button>
      </div>

      {/* Rerouting Notification & Time Saved / Lost Banner */}
      {comparison && (
        <div
          role="status"
          className="rounded-xl bg-[#0f172a] border border-amber-500/45 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                Automatic Reroute Active · {comparison.affectedRoadName} (
                {comparison.congestionLevel} Traffic)
              </span>
            </div>
            <span
              className={`font-mono text-xs font-bold ${
                rerouteDeltaSeconds > 0
                  ? 'text-emerald-400'
                  : rerouteDeltaSeconds < 0
                    ? 'text-amber-300'
                    : 'text-slate-300'
              }`}
            >
              {rerouteDeltaSeconds > 0
                ? `Time Saved: ${formatDuration(rerouteDeltaSeconds)}`
                : rerouteDeltaSeconds < 0
                  ? `Time Added: +${formatDuration(Math.abs(rerouteDeltaSeconds))}`
                  : 'Same Estimated Arrival'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center text-xs">
            <div className="md:col-span-5 rounded-lg bg-[#080d17] border border-orange-500/35 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-orange-400 font-semibold">
                  Previous Route
                </div>
                <div className="text-slate-200 truncate">
                  {comparison.previousRoute.corridorSummary}
                </div>
              </div>
              <div className="text-right shrink-0 font-mono tabular-nums">
                <div className="text-orange-300 font-bold">
                  {formatDuration(comparison.previousRoute.adjustedDurationSeconds)}
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatDistance(comparison.previousRoute.distanceMeters)}
                </div>
              </div>
            </div>

            <div className="md:col-span-1 flex justify-center">
              <ArrowRight className="h-4 w-4 text-emerald-400 rotate-90 md:rotate-0" />
            </div>

            <div className="md:col-span-5 rounded-lg bg-[#080d17] border border-emerald-500/45 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-emerald-400 font-semibold">
                  Updated Active Route
                </div>
                <div className="text-white font-medium truncate">
                  {comparison.newRoute.corridorSummary}
                </div>
              </div>
              <div className="text-right shrink-0 font-mono tabular-nums">
                <div className="text-emerald-400 font-bold">
                  {formatDuration(comparison.newRoute.adjustedDurationSeconds)}
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatDistance(comparison.newRoute.distanceMeters)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Route Map + Practical Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7">
          <BengaluruMap
            snapshot={snapshot}
            heightClass="h-[380px] xl:h-[420px]"
            onSelectHospital={onSelectHospital}
          />
        </div>

        <div className="xl:col-span-5 rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
                Selected Dispatch Route
              </div>
              <h3 className="font-display text-base font-bold text-white mt-0.5">
                {activeRoute?.label ?? 'Calculating...'}
              </h3>
              <div className="text-xs text-slate-400 mt-0.5">
                {activeRoute?.corridorSummary ?? '—'}
              </div>
            </div>
            {activeRoute && (
              <div className="text-right shrink-0">
                <div className="font-mono text-lg font-bold tabular-nums text-emerald-400">
                  {formatDuration(activeRoute.adjustedDurationSeconds)}
                </div>
                <div className="font-mono text-xs tabular-nums text-slate-300">
                  {formatDistance(activeRoute.distanceMeters)}
                </div>
              </div>
            )}
          </div>

          {explanation && (
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-slate-400 font-medium mb-1">
                  Why This Route Was Selected
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {explanation.selectionReason}
                </p>
              </div>

              <div className="rounded-lg bg-[#080d17] border border-slate-800 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">
                    Current Traffic Conditions
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      congestedSegments.some((s) => s.congestionLevel === 'HIGH')
                        ? 'text-red-400'
                        : congestedSegments.length > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {congestedSegments.length === 0
                      ? 'CLEAR'
                      : `${congestedSegments.length} Corridor(s) Delayed`}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {explanation.congestionSummary}
                </p>
              </div>

              {explanation.rerouteReason && (
                <div className="rounded-lg bg-amber-950/25 border border-amber-500/35 p-3 space-y-1">
                  <div className="text-amber-300 font-semibold">Reroute Summary</div>
                  <p className="text-amber-100/90 leading-relaxed">
                    {explanation.rerouteReason}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Destination Hospital</span>
                </span>
                <span className="text-slate-100 font-medium">
                  {targetHospital?.shortName ?? '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3 Route Type Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {modes.map((m) => {
          const candidate = snapshot.routeCandidates[m.id];
          const isSelected = snapshot.selectedMode === m.id;
          return (
            <div
              key={m.id}
              className={`rounded-xl p-5 border flex flex-col justify-between gap-4 transition-colors ${
                isSelected
                  ? 'bg-[#101c2e] border-emerald-500/60'
                  : 'bg-[#0f172a] border-slate-800/90'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-white">
                      {m.title}
                    </h3>
                    <div className="text-xs text-slate-400">{m.subtitle}</div>
                  </div>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 whitespace-nowrap">
                      <CheckCircle2 className="h-4 w-4" />
                      Active
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {m.description}
                </p>

                {candidate ? (
                  <dl className="divide-y divide-slate-800/80 text-xs pt-1">
                    <div className="py-2 flex justify-between gap-2">
                      <dt className="text-slate-400">Primary Corridor</dt>
                      <dd className="text-slate-200 font-medium text-right max-w-[200px] truncate">
                        {candidate.corridorSummary}
                      </dd>
                    </div>
                    <div className="py-2 flex justify-between">
                      <dt className="text-slate-400">Estimated Distance</dt>
                      <dd className="font-mono tabular-nums text-white font-semibold">
                        {formatDistance(candidate.distanceMeters)}
                      </dd>
                    </div>
                    <div className="py-2 flex justify-between">
                      <dt className="text-slate-400">Estimated Arrival Time</dt>
                      <dd
                        className={`font-mono tabular-nums font-bold ${
                          candidate.congestionPenaltySeconds > 60
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {formatDuration(candidate.adjustedDurationSeconds)}
                      </dd>
                    </div>
                    <div className="py-2 flex justify-between">
                      <dt className="text-slate-400">Average Travel Speed</dt>
                      <dd className="font-mono tabular-nums text-slate-200">
                        {candidate.averageSpeedKmh} km/h
                      </dd>
                    </div>
                    <div className="py-2 flex justify-between">
                      <dt className="text-slate-400">Traffic Delay</dt>
                      <dd
                        className={`font-mono tabular-nums ${
                          candidate.congestionPenaltySeconds > 0
                            ? 'text-red-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {candidate.congestionPenaltySeconds > 0
                          ? `+${formatDuration(candidate.congestionPenaltySeconds)}`
                          : 'No delay'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="text-xs text-slate-400 py-4">Calculating route...</div>
                )}

                {candidate && candidate.affectedSegments.length > 0 && (
                  <div className="rounded-lg bg-red-950/30 border border-red-500/30 p-2.5 text-[11px] text-red-300 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                    <div>
                      <div className="font-semibold">Delayed Road Sections</div>
                      <div>{candidate.affectedSegments.join(', ')}</div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelectMode(m.id)}
                disabled={isSelected || snapshot.isRoutingLoading}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {isSelected ? 'Currently Active' : `Select ${m.title}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Operator Alternative Route Comparison Table */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-blue-400" />
            <h3 className="font-display text-sm font-semibold text-white">
              Alternative Route Comparison
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Live comparison for {targetHospital?.shortName ?? 'selected hospital'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b111e] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Route Type</th>
                <th className="py-2.5 px-4 font-medium">Corridor</th>
                <th className="py-2.5 px-4 font-medium text-right">Distance</th>
                <th className="py-2.5 px-4 font-medium text-right">Arrival Time</th>
                <th className="py-2.5 px-4 font-medium text-right">vs Active Route</th>
                <th className="py-2.5 px-4 font-medium text-right">Traffic Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Avg Speed</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {(['shortest', 'fastest', 'congestion_aware'] as const).map((key) => {
                const c = snapshot.routeCandidates[key];
                if (!c) return null;
                const isSel = snapshot.selectedMode === key;
                const etaDiff = activeRoute
                  ? c.adjustedDurationSeconds - activeRoute.adjustedDurationSeconds
                  : 0;
                return (
                  <tr
                    key={key}
                    className={
                      isSel ? 'bg-emerald-950/20' : 'hover:bg-slate-800/30'
                    }
                  >
                    <td className="py-3 px-4 font-medium text-white whitespace-nowrap">
                      {c.label}
                      {isSel && (
                        <span className="ml-2 text-[11px] text-emerald-400 font-semibold">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{c.corridorSummary}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                      {formatDistance(c.distanceMeters)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap">
                      {formatDuration(c.adjustedDurationSeconds)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {isSel ? (
                        <span className="text-emerald-400">Selected</span>
                      ) : etaDiff > 0 ? (
                        <span className="text-amber-400">
                          +{formatDuration(etaDiff)} slower
                        </span>
                      ) : etaDiff < 0 ? (
                        <span className="text-emerald-300">
                          {formatDuration(Math.abs(etaDiff))} faster
                        </span>
                      ) : (
                        <span className="text-slate-400">Same ETA</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {c.congestionPenaltySeconds > 0 ? (
                        <span className="text-red-400">
                          +{formatDuration(c.congestionPenaltySeconds)} delay
                        </span>
                      ) : (
                        <span className="text-emerald-400">Clear</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {c.averageSpeedKmh} km/h
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isSel ? (
                        <span className="text-[11px] text-emerald-400 font-semibold">
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectMode(key)}
                          disabled={snapshot.isRoutingLoading}
                          className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
                        >
                          Switch
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
