import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';
import { formatDistance, formatDuration } from '../core/geo';
import type { AmbulanceStatus, SernSystemSnapshot } from '../core/types';
import { BengaluruMap } from './BengaluruMap';

interface SimulationViewProps {
  snapshot: SernSystemSnapshot;
  onStartOrResume: () => void;
  onPause: () => void;
  onReset: () => void;
  onSetSpeed: (multiplier: number) => void;
  onSelectHospital: (hospitalId: string) => void;
}

const LIFECYCLE_STEPS: { status: AmbulanceStatus; label: string; detail: string }[] = [
  { status: 'STANDBY', label: 'Standby', detail: 'Staged at emergency location with route precomputed' },
  { status: 'DISPATCHED', label: 'Dispatched', detail: 'Dispatch order acknowledged & Green Corridor armed' },
  { status: 'EN_ROUTE', label: 'En Route', detail: 'Traversing live road geometry toward hospital' },
  { status: 'ARRIVED', label: 'Arrived', detail: 'Reached hospital trauma bay; signals restored' },
];

export function SimulationView({
  snapshot,
  onStartOrResume,
  onPause,
  onReset,
  onSetSpeed,
  onSelectHospital,
}: SimulationViewProps) {
  const { ambulance, activeRoute } = snapshot;
  const isRunning =
    (ambulance.status === 'DISPATCHED' || ambulance.status === 'EN_ROUTE') &&
    !ambulance.isPaused;

  const currentStepIdx = LIFECYCLE_STEPS.findIndex((s) => s.status === ambulance.status);

  return (
    <div className="space-y-5">
      {/* Control Deck */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-white">
            Ambulance Dispatch & Telemetry Simulation
          </h2>
          <p className="text-xs text-slate-400">
            Interpolates {ambulance.id} continuously along the active route geometry and updates Green Corridor signal phases in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isRunning ? (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
            >
              <Pause className="h-4 w-4" />
              <span>Pause Simulation</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartOrResume}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
            >
              <Play className="h-4 w-4" />
              <span>
                {ambulance.status === 'STANDBY'
                  ? 'Start Simulation'
                  : ambulance.status === 'ARRIVED'
                    ? 'Restart Route'
                    : 'Resume Simulation'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </button>

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
            <Gauge className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-400 mr-1">Speed:</span>
            {[1, 2, 4, 8, 12].map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => onSetSpeed(mult)}
                className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                  ambulance.speedMultiplier === mult
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* State Progression Stepper */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {LIFECYCLE_STEPS.map((step, idx) => {
          const completed = idx < currentStepIdx || ambulance.status === 'ARRIVED';
          const active = idx === currentStepIdx;
          return (
            <div
              key={step.status}
              className={`rounded-xl p-4 border ${
                active
                  ? 'bg-[#101c2e] border-emerald-500/60'
                  : completed
                    ? 'bg-[#0f172a] border-slate-700/80'
                    : 'bg-[#0b111e] border-slate-800/70 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-mono text-slate-400">0{idx + 1}</span>
                <span
                  className={`font-semibold ${
                    active
                      ? 'text-emerald-400'
                      : completed
                        ? 'text-blue-400'
                        : 'text-slate-500'
                  }`}
                >
                  {active ? (ambulance.isPaused ? 'PAUSED' : 'CURRENT') : completed ? 'DONE' : 'PENDING'}
                </span>
              </div>
              <div className="font-display text-sm font-bold text-white">{step.label}</div>
              <div className="text-[11px] text-slate-400 mt-1">{step.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Live Map + Detailed Simulation Readout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8">
          <BengaluruMap
            snapshot={snapshot}
            heightClass="h-[440px]"
            onSelectHospital={onSelectHospital}
          />
        </div>

        <div className="xl:col-span-4 rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 space-y-4">
          <h3 className="font-display text-sm font-bold text-white border-b border-slate-800 pb-2.5">
            Simulated GPS &amp; Telemetry
          </h3>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Route Progress</span>
              <span className="font-mono font-bold tabular-nums text-emerald-400">
                {ambulance.completionPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${ambulance.completionPercent}%` }}
              />
            </div>
          </div>

          <dl className="divide-y divide-slate-800/80 text-xs">
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Simulated GPS (Lat / Lng)</dt>
              <dd className="font-mono tabular-nums text-white">
                {ambulance.currentCoord.lat.toFixed(5)}, {ambulance.currentCoord.lng.toFixed(5)}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Heading Bearing</dt>
              <dd className="font-mono tabular-nums text-slate-200">{ambulance.bearingDegrees}°</dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Simulated Speed</dt>
              <dd className="font-mono tabular-nums text-emerald-400 font-semibold">
                {ambulance.currentSpeedKmh} km/h
              </dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Distance Covered</dt>
              <dd className="font-mono tabular-nums text-slate-100">
                {formatDistance(ambulance.distanceCoveredMeters)}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Remaining Distance</dt>
              <dd className="font-mono tabular-nums text-slate-100">
                {formatDistance(ambulance.remainingDistanceMeters)}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Remaining ETA</dt>
              <dd className="font-mono tabular-nums text-white font-semibold">
                {ambulance.status === 'ARRIVED'
                  ? '0s (Arrived)'
                  : formatDuration(
                      ambulance.status === 'STANDBY' && activeRoute
                        ? activeRoute.adjustedDurationSeconds
                        : ambulance.etaSeconds
                    )}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-slate-400">Active Corridor</dt>
              <dd className="text-slate-200 text-right max-w-[180px] truncate">
                {activeRoute?.corridorSummary ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
