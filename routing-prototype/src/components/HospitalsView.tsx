import { Building2, CheckCircle2, Info } from 'lucide-react';
import { formatDistance, formatDuration } from '../core/geo';
import type { SernSystemSnapshot } from '../core/types';

interface HospitalsViewProps {
  snapshot: SernSystemSnapshot;
  onSelectHospital: (hospitalId: string) => void;
}

export function HospitalsView({ snapshot, onSelectHospital }: HospitalsViewProps) {
  const { hospitals, selectedHospitalId } = snapshot;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-white">
            Bengaluru Demonstration Hospital Network
          </h2>
          <p className="text-xs text-slate-400">
            Select a receiving hospital to recalculate shortest, fastest, and congestion-aware routes from the ambulance location.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 text-xs text-blue-300 shrink-0">
          <Info className="h-4 w-4" />
          <span>Bed availability figures are simulated for demonstration</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {hospitals.map((hosp) => {
          const isSelected = hosp.id === selectedHospitalId;
          return (
            <div
              key={hosp.id}
              className={`rounded-xl p-5 border flex flex-col justify-between gap-4 transition-colors ${
                isSelected
                  ? 'bg-[#101c2e] border-emerald-500/60'
                  : 'bg-[#0f172a] border-slate-800/90'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-bold text-white leading-snug">
                        {hosp.name}
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {hosp.area} · {hosp.traumaLevel}
                      </div>
                    </div>
                  </div>
                </div>

                <dl className="divide-y divide-slate-800/80 text-xs">
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-400">Distance from Ambulance</dt>
                    <dd className="font-mono tabular-nums font-semibold text-white">
                      {hosp.distanceMeters ? formatDistance(hosp.distanceMeters) : '—'}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-400">Estimated Travel Time</dt>
                    <dd className="font-mono tabular-nums font-semibold text-emerald-400">
                      {hosp.etaSeconds ? formatDuration(hosp.etaSeconds) : '—'}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-400">Simulated Capacity</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {hosp.emergencyBedsAvailable} ER · {hosp.icuBedsAvailable} ICU
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between">
                    <dt className="text-slate-400">Availability Status</dt>
                    <dd
                      className={`font-mono font-semibold ${
                        hosp.availabilityStatus === 'AVAILABLE'
                          ? 'text-emerald-400'
                          : hosp.availabilityStatus === 'LIMITED'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {hosp.availabilityStatus} (Simulated)
                    </dd>
                  </div>
                </dl>
              </div>

              <button
                type="button"
                onClick={() => onSelectHospital(hosp.id)}
                disabled={isSelected || snapshot.isRoutingLoading}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  isSelected
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isSelected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Selected Destination</span>
                  </>
                ) : (
                  <span>Route to {hosp.shortName}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
