import { GitCompare, Play, Radio, TrafficCone } from 'lucide-react';
import { formatDistance, formatDuration } from '../core/geo';
import type { SernSystemSnapshot } from '../core/types';

interface EmergencyCaseSummaryProps {
  snapshot: SernSystemSnapshot;
  busyAction: boolean;
  onDispatch: () => void;
  onQuickCongestion: () => void;
  onOpenGreenCorridor: () => void;
}

export function EmergencyCaseSummary({
  snapshot,
  busyAction,
  onDispatch,
  onQuickCongestion,
  onOpenGreenCorridor,
}: EmergencyCaseSummaryProps) {
  const targetHospital = snapshot.hospitals.find(
    (h) => h.id === snapshot.selectedHospitalId
  );
  const dispatchLabel = snapshot.ambulance.isPaused
    ? 'PAUSED'
    : snapshot.ambulance.status.replace('_', ' ');

  return (
    <section
      aria-label="Emergency Case Summary"
      className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 space-y-3"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-mono text-slate-200">{snapshot.incident.id}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-red-400">
              {snapshot.incident.severity} (Simulated)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Reference: {snapshot.referenceLocation.shortName} ({snapshot.referenceLocation.coord.lat.toFixed(4)}° N, {snapshot.referenceLocation.coord.lng.toFixed(4)}° E)
            </span>
          </div>
          <h2 className="font-display text-base font-bold text-white">
            {snapshot.incident.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {snapshot.ambulance.status === 'STANDBY' && (
            <button
              type="button"
              onClick={onDispatch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Dispatch Ambulance</span>
            </button>
          )}

          <button
            type="button"
            onClick={onQuickCongestion}
            disabled={busyAction || snapshot.ambulance.status === 'ARRIVED'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <TrafficCone className="h-3.5 w-3.5" />
            <span>Simulate HIGH Congestion &amp; Reroute</span>
          </button>

          <button
            type="button"
            onClick={onOpenGreenCorridor}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
            <span>Signal Sequence</span>
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80 text-xs">
        <div>
          <dt className="text-slate-400">Accident near RNSIT</dt>
          <dd className="text-slate-100 font-medium mt-0.5 truncate">
            {snapshot.incident.locationName}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Simulated Ambulance Start</dt>
          <dd className="text-slate-100 font-medium mt-0.5 truncate">
            {snapshot.ambulance.id} · {snapshot.ambulance.startLocationName}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Destination Hospital</dt>
          <dd className="text-slate-100 font-medium mt-0.5 truncate">
            {targetHospital?.name ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Dispatch Status</dt>
          <dd
            className={`font-mono font-semibold mt-0.5 ${
              snapshot.ambulance.status === 'ARRIVED' || snapshot.ambulance.status === 'EN_ROUTE'
                ? 'text-emerald-400'
                : snapshot.ambulance.isPaused
                  ? 'text-amber-400'
                  : 'text-blue-400'
            }`}
          >
            {dispatchLabel}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Green Corridor (Simulated)</dt>
          <dd className="font-mono text-emerald-400 font-semibold mt-0.5 truncate">
            {snapshot.greenCorridor.activeSignalName
              ? `${snapshot.greenCorridor.activeSignalName} GREEN`
              : `${snapshot.greenCorridor.activatedCount}/${snapshot.greenCorridor.totalRouteSignals} GREEN`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

interface WhyThisRoutePanelProps {
  snapshot: SernSystemSnapshot;
  onCompareRoutes: () => void;
}

export function WhyThisRoutePanel({ snapshot, onCompareRoutes }: WhyThisRoutePanelProps) {
  const explanation = snapshot.routeExplanation;
  const active = snapshot.activeRoute;
  if (!explanation || !active) return null;

  return (
    <section
      aria-labelledby="why-this-route-heading"
      className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-emerald-400 shrink-0" />
          <h3 id="why-this-route-heading" className="font-display text-sm font-semibold text-white">
            Why This Route?
          </h3>
        </div>
        <button
          type="button"
          onClick={onCompareRoutes}
          className="text-xs text-blue-400 hover:text-blue-300 font-medium"
        >
          Compare All Routes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
        <div className="lg:col-span-7 space-y-2">
          <div className="font-semibold text-emerald-400">{explanation.headline}</div>
          <p className="text-slate-200 leading-relaxed">{explanation.selectionReason}</p>
          <p className="text-slate-400 leading-relaxed">{explanation.alternativesSummary}</p>
        </div>

        <div className="lg:col-span-5 space-y-2.5 lg:border-l lg:border-slate-800/80 lg:pl-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Calculated Distance &amp; ETA</span>
            <span className="font-mono tabular-nums text-white font-semibold">
              {formatDistance(active.distanceMeters)} · {formatDuration(active.adjustedDurationSeconds)}
            </span>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Traffic &amp; Congestion Conditions</div>
            <p className="text-slate-200 leading-relaxed">{explanation.congestionSummary}</p>
          </div>
          {explanation.rerouteReason && (
            <div>
              <div className="text-amber-400 font-semibold mb-0.5">Reroute Explanation</div>
              <p className="text-amber-100/90 leading-relaxed">{explanation.rerouteReason}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
