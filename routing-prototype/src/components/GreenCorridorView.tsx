import {
  Activity,
  CheckCircle2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { formatDistance } from '../core/geo';
import type { SernSystemSnapshot, SignalState } from '../core/types';

interface GreenCorridorViewProps {
  snapshot: SernSystemSnapshot;
  onToggleGreenCorridor: (enabled: boolean) => void;
  onStartOrResume: () => void;
  onPause: () => void;
  onReset: () => void;
}

function SignalLampIndicator({ state }: { state: SignalState }) {
  const isRed = state === 'RED';
  const isGreen = state === 'GREEN';
  const isRestored = state === 'RESTORED';

  return (
    <div
      className="inline-flex items-center gap-2 shrink-0"
      aria-label={`Signal phase ${state}`}
    >
      <div className="flex flex-col items-center gap-0.5 px-1 py-1 rounded bg-[#080d17] border border-slate-700/90">
        <span
          className={`h-2 w-2 rounded-full ${
            isRed
              ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]'
              : 'bg-slate-700'
          }`}
        />
        <span
          className={`h-2 w-2 rounded-full ${
            isRestored
              ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.85)]'
              : 'bg-slate-700'
          }`}
        />
        <span
          className={`h-2 w-2 rounded-full ${
            isGreen
              ? 'bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.95)]'
              : 'bg-slate-700'
          }`}
        />
      </div>
      <span
        className={`font-mono text-[11px] font-bold tracking-tight ${
          isGreen
            ? 'text-emerald-400'
            : isRed
              ? 'text-red-400'
              : isRestored
                ? 'text-sky-400'
                : 'text-slate-400'
        }`}
      >
        {state}
      </span>
    </div>
  );
}

export function GreenCorridorView({
  snapshot,
  onToggleGreenCorridor,
  onStartOrResume,
  onPause,
  onReset,
}: GreenCorridorViewProps) {
  const { greenCorridor, signals, ambulance, events } = snapshot;

  const isMoving =
    (ambulance.status === 'DISPATCHED' || ambulance.status === 'EN_ROUTE') &&
    !ambulance.isPaused;

  const routeSignals = signals
    .filter((s) => s.onActiveRoute)
    .sort((a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0));

  const otherSignals = signals.filter((s) => !s.onActiveRoute);

  const corridorEvents = events.filter(
    (e) => e.category === 'GREEN_CORRIDOR' || e.category === 'DISPATCH'
  );

  return (
    <div className="space-y-5">
      {/* Top Banner & Corridor Controls */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Radio
              className={`h-5 w-5 ${
                greenCorridor.status === 'ACTIVE_PRIORITIZATION'
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            />
            <h2 className="font-display text-lg font-bold text-white">
              Intelligent Green Corridor Signal Prioritization
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Sequential distance-based intersection preemption. Signals illuminate{' '}
            <strong className="text-emerald-400">GREEN</strong> strictly in route order when{' '}
            {ambulance.id} enters{' '}
            <span className="font-mono text-slate-200">{greenCorridor.activationRadiusMeters} m</span>{' '}
            approach range, and revert to <strong className="text-sky-400">RESTORED</strong> once the
            unit clears each junction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isMoving ? (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
            >
              <Pause className="h-3.5 w-3.5" />
              <span>Pause Unit</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartOrResume}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {ambulance.status === 'STANDBY'
                  ? 'Dispatch & Activate'
                  : ambulance.status === 'ARRIVED'
                    ? 'Replay Corridor'
                    : 'Resume'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleGreenCorridor(!greenCorridor.enabled)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              greenCorridor.enabled
                ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/60'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {greenCorridor.enabled ? 'Preemption: ENABLED' : 'Enable Preemption'}
          </button>
        </div>
      </div>

      {/* Signal State Visual Legend + Sequential Intersection Wave */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-white">
              Corridor Wave:{' '}
              <span
                className={
                  greenCorridor.status === 'ACTIVE_PRIORITIZATION'
                    ? 'text-emerald-400'
                    : greenCorridor.status === 'CLEARED'
                      ? 'text-sky-400'
                      : 'text-slate-400'
                }
              >
                {greenCorridor.status.replace('_', ' ')}
              </span>
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-400 font-mono">
              {greenCorridor.activatedCount > 0
                ? `Active GREEN: ${routeSignals
                    .filter((s) => s.state === 'GREEN')
                    .map((s) => `#${s.sequenceOrder ?? ''} ${s.name}`)
                    .join(' → ')}`
                : greenCorridor.nextSignalName
                  ? `Next: ${greenCorridor.nextSignalName} (${formatDistance(
                      greenCorridor.nextSignalDistanceMeters ?? 0
                    )} ahead)`
                  : ambulance.status === 'ARRIVED'
                    ? 'All route signals restored'
                    : 'Awaiting dispatch'}
            </span>
          </div>

          {/* 4-State Visual Signal Indicator Key */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span>GREEN (Preempted)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span>RED (Awaiting Approach)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              <span>RESTORED (Cleared)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
              <span>NORMAL (Standby/Off-Route)</span>
            </span>
          </div>
        </div>

        {/* Route Travel Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              Ambulance Position: {formatDistance(ambulance.distanceCoveredMeters)} /{' '}
              {formatDistance(ambulance.totalDistanceMeters)}
            </span>
            <span className="text-emerald-400 font-semibold">{ambulance.completionPercent}% traversed</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${ambulance.completionPercent}%` }}
            />
          </div>
        </div>

        {/* Visual Sequential Intersection Wave */}
        {routeSignals.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 pt-1"
            data-testid="green-corridor-wave"
          >
            {routeSignals.map((sig, idx) => {
              const delta =
                sig.distanceFromAmbulanceMeters ??
                (sig.routeDistanceMeters !== null
                  ? sig.routeDistanceMeters - ambulance.distanceCoveredMeters
                  : null);

              const cardStyle =
                sig.state === 'GREEN'
                  ? 'border-emerald-500 bg-emerald-950/45'
                  : sig.state === 'RED'
                    ? 'border-red-500/45 bg-red-950/20'
                    : sig.state === 'RESTORED'
                      ? 'border-sky-500/45 bg-sky-950/20'
                      : 'border-slate-700/80 bg-[#080d17]';

              const proximityLabel =
                delta === null
                  ? '—'
                  : sig.state === 'GREEN' && delta >= -140 && delta <= 140
                    ? 'PASSING JUNCTION'
                    : delta > 0
                      ? `${formatDistance(delta)} ahead`
                      : `${formatDistance(Math.abs(delta))} passed`;

              return (
                <div
                  key={sig.id}
                  data-signal-id={sig.id}
                  data-signal-state={sig.state}
                  className={`rounded-lg border px-3 py-2.5 flex flex-col justify-between gap-2 ${cardStyle}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-300">
                      #{sig.sequenceOrder ?? idx + 1} · {sig.id}
                    </span>
                    <SignalLampIndicator state={sig.state} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {sig.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                      {sig.routeDistanceMeters !== null
                        ? `${formatDistance(sig.routeDistanceMeters)} · `
                        : ''}
                      <span
                        className={
                          sig.state === 'GREEN'
                            ? 'text-emerald-300 font-semibold'
                            : sig.state === 'RESTORED'
                              ? 'text-sky-300'
                              : 'text-slate-300'
                        }
                      >
                        {proximityLabel}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Intersections on Route</div>
          <div className="font-display text-2xl font-bold tabular-nums text-white mt-1">
            {greenCorridor.totalRouteSignals}
          </div>
        </div>
        <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Active GREEN Signals</div>
          <div className="font-display text-2xl font-bold tabular-nums text-emerald-400 mt-1">
            {greenCorridor.activatedCount}
          </div>
        </div>
        <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Awaiting Preemption (RED)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-red-400 mt-1">
            {greenCorridor.awaitingCount}
          </div>
        </div>
        <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Cleared & Restored</div>
          <div className="font-display text-2xl font-bold tabular-nums text-sky-400 mt-1">
            {greenCorridor.restoredCount}
          </div>
        </div>
      </div>

      {/* Signal Table + Live Green Corridor Event Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 rounded-xl bg-[#0f172a] border border-slate-800/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-white">
              Sequential Signal State Matrix
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Software Preemption Simulation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b111e] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Seq</th>
                  <th className="py-2.5 px-3 font-medium">Signal</th>
                  <th className="py-2.5 px-3 font-medium">Intersection</th>
                  <th className="py-2.5 px-3 font-medium text-right">Offset</th>
                  <th className="py-2.5 px-3 font-medium text-right">Proximity</th>
                  <th className="py-2.5 px-3 font-medium">Indicator & Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {[...routeSignals, ...otherSignals].map((sig) => {
                  const proximity =
                    sig.distanceFromAmbulanceMeters ??
                    (sig.routeDistanceMeters !== null
                      ? sig.routeDistanceMeters - ambulance.distanceCoveredMeters
                      : null);
                  return (
                    <tr
                      key={sig.id}
                      className={
                        sig.state === 'GREEN'
                          ? 'bg-emerald-950/25'
                          : sig.onActiveRoute
                            ? 'bg-slate-800/15'
                            : 'opacity-60'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {sig.sequenceOrder ? `#${sig.sequenceOrder}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-200 whitespace-nowrap">
                        {sig.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-white">{sig.name}</div>
                        <div className="text-[11px] text-slate-400">{sig.corridor}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {sig.routeDistanceMeters !== null
                          ? formatDistance(sig.routeDistanceMeters)
                          : 'Off-Route'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {proximity === null
                          ? '—'
                          : proximity > 0
                            ? `${formatDistance(proximity)} ahead`
                            : `${formatDistance(Math.abs(proximity))} passed`}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <SignalLampIndicator state={sig.state} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Green Corridor Event Log */}
        <div
          className="xl:col-span-5 rounded-xl bg-[#0f172a] border border-slate-800/90 overflow-hidden"
          data-testid="green-corridor-live-log"
        >
          <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display text-sm font-semibold text-white">
                Live Signal Transition Event Log
              </h3>
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {corridorEvents.length} events
            </span>
          </div>

          <div className="divide-y divide-slate-800/70 max-h-[520px] overflow-y-auto">
            {corridorEvents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No signal transitions logged yet. Dispatch the ambulance to watch sequential GREEN preemption and RESTORED events appear in real time.
              </div>
            ) : (
              corridorEvents.map((evt) => {
                const isGreenEvt =
                  evt.status === 'SIGNAL GREEN' || evt.status === 'ACTIVE' || evt.status === 'ENABLED';
                const isRestoredEvt = evt.status === 'RESTORED';
                const isDisabledEvt = evt.status === 'DISABLED';

                return (
                  <div
                    key={evt.id}
                    className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-800/20"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            isGreenEvt
                              ? 'text-emerald-400'
                              : isRestoredEvt
                                ? 'text-sky-400'
                                : isDisabledEvt
                                  ? 'text-amber-400'
                                  : evt.severity === 'CRITICAL'
                                    ? 'text-red-400'
                                    : 'text-slate-300'
                          }`}
                        >
                          {isRestoredEvt && <CheckCircle2 className="h-3 w-3" />}
                          {evt.status}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-400">{evt.category}</span>
                      </div>
                      <p className="text-xs text-slate-100 leading-snug">{evt.description}</p>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0 pt-0.5">
                      {new Date(evt.timestamp).toLocaleTimeString('en-IN', {
                        hour12: false,
                      })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
