import { formatDistance, formatDuration } from '../core/geo';
import type { RoutingMode, SernSystemSnapshot } from '../core/types';

interface TelemetryPanelProps {
  snapshot: SernSystemSnapshot;
  onSelectMode: (mode: RoutingMode) => void;
  onSelectHospital: (hospitalId: string) => void;
}

export function TelemetryPanel({
  snapshot,
  onSelectMode,
  onSelectHospital,
}: TelemetryPanelProps) {
  const { ambulance, activeRoute, hospitals, selectedHospitalId, selectedMode, roadSegments } =
    snapshot;
  const targetHospital = hospitals.find((h) => h.id === selectedHospitalId);
  const congestedSegments = roadSegments.filter((s) => s.congestionLevel !== 'NONE');

  const maxCongestion = congestedSegments.some((s) => s.congestionLevel === 'HIGH')
    ? 'HIGH'
    : congestedSegments.some((s) => s.congestionLevel === 'MEDIUM')
      ? 'MEDIUM'
      : congestedSegments.some((s) => s.congestionLevel === 'LOW')
        ? 'LOW'
        : 'LOW / CLEAR';

  const statusColor =
    ambulance.status === 'ARRIVED'
      ? 'text-emerald-400'
      : ambulance.status === 'EN_ROUTE'
        ? 'text-emerald-400'
        : ambulance.status === 'DISPATCHED'
          ? 'text-blue-400'
          : 'text-slate-300';

  return (
    <aside className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div>
          <div className="text-xs text-slate-400">Active Dispatch Unit</div>
          <h2 className="font-display text-base font-bold text-white font-mono">
            {ambulance.id}
          </h2>
          <div className="text-xs text-slate-400">{ambulance.unitType}</div>
        </div>
        <div className={`text-xs font-semibold font-mono ${statusColor}`}>
          {ambulance.isPaused ? 'PAUSED' : ambulance.status.replace('_', ' ')}
        </div>
      </div>

      {/* Mode Quick Selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-400">Routing Algorithm Mode</label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#080d17] border border-slate-800">
          {(
            [
              { id: 'shortest', label: 'Shortest' },
              { id: 'fastest', label: 'Fastest' },
              { id: 'congestion_aware', label: 'Optimal' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMode(m.id)}
              disabled={snapshot.isRoutingLoading}
              className={`px-1.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                selectedMode === m.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Destination Selector */}
      <div className="space-y-1.5">
        <label htmlFor="telemetry-hospital-select" className="block text-xs font-medium text-slate-400">
          Destination Hospital
        </label>
        <select
          id="telemetry-hospital-select"
          value={selectedHospitalId}
          onChange={(e) => onSelectHospital(e.target.value)}
          disabled={snapshot.isRoutingLoading}
          className="w-full rounded-lg bg-[#080d17] border border-slate-700/80 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.shortName} ({h.area})
            </option>
          ))}
        </select>
      </div>

      {/* Completion Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Route Completion</span>
          <span className="font-mono font-semibold tabular-nums text-emerald-400">
            {ambulance.completionPercent}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${ambulance.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Telemetry Key-Value Grid */}
      <dl className="divide-y divide-slate-800/80 text-xs">
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Simulated GPS</dt>
          <dd className="font-mono tabular-nums text-slate-100">
            {ambulance.currentCoord.lat.toFixed(4)}, {ambulance.currentCoord.lng.toFixed(4)}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Destination</dt>
          <dd className="text-slate-100 font-medium text-right truncate max-w-[170px]">
            {targetHospital?.shortName ?? '—'}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Route Distance</dt>
          <dd className="font-mono tabular-nums text-slate-100">
            {activeRoute ? formatDistance(activeRoute.distanceMeters) : '—'}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Remaining Distance</dt>
          <dd className="font-mono tabular-nums text-slate-100">
            {formatDistance(ambulance.remainingDistanceMeters)}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Estimated ETA</dt>
          <dd className="font-mono tabular-nums font-semibold text-emerald-400">
            {ambulance.status === 'ARRIVED'
              ? 'Arrived'
              : formatDuration(
                  ambulance.status === 'STANDBY' && activeRoute
                    ? activeRoute.adjustedDurationSeconds
                    : ambulance.etaSeconds
                )}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Simulated Speed</dt>
          <dd className="font-mono tabular-nums text-slate-100">
            {ambulance.currentSpeedKmh > 0
              ? `${ambulance.currentSpeedKmh} km/h`
              : `${activeRoute?.averageSpeedKmh ?? 0} km/h avg`}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Simulated Traffic</dt>
          <dd
            className={`font-mono font-semibold ${
              maxCongestion === 'HIGH'
                ? 'text-red-400'
                : maxCongestion === 'MEDIUM'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }`}
          >
            {maxCongestion}
          </dd>
        </div>
        <div className="py-2 flex items-center justify-between gap-2">
          <dt className="text-slate-400">Green Corridor (Sim)</dt>
          <dd className="font-mono text-emerald-400">
            {snapshot.greenCorridor.activatedCount}/{snapshot.greenCorridor.totalRouteSignals} GREEN
          </dd>
        </div>
      </dl>
    </aside>
  );
}
