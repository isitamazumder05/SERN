import { formatDuration } from '../core/geo';
import type { SernSystemSnapshot } from '../core/types';

interface KpiStripProps {
  snapshot: SernSystemSnapshot;
}

export function KpiStrip({ snapshot }: KpiStripProps) {
  const { ambulance, hospitals, greenCorridor, activeRoute } = snapshot;
  const availableHospitals = hospitals.filter(
    (h) => h.availabilityStatus === 'AVAILABLE' || h.availabilityStatus === 'LIMITED'
  ).length;

  const avgResponse = activeRoute
    ? formatDuration(activeRoute.adjustedDurationSeconds)
    : '—';

  const cards = [
    {
      label: 'Active Ambulances',
      value: ambulance.status === 'ARRIVED' ? '0 / 1' : '1 / 1',
      detail: `${ambulance.id} · ${ambulance.status.replace('_', ' ')}`,
      tone: 'text-blue-400',
    },
    {
      label: 'Active Emergencies',
      value: ambulance.status === 'ARRIVED' ? '0' : '1',
      detail: `${snapshot.incident.severity} · RNSIT Gate (Simulated)`,
      tone: 'text-red-400',
    },
    {
      label: 'Available Hospitals',
      value: `${availableHospitals} / ${hospitals.length}`,
      detail: 'Simulated bed capacity',
      tone: 'text-slate-200',
    },
    {
      label: 'Estimated Response Time',
      value: avgResponse,
      detail: activeRoute
        ? `${(activeRoute.distanceMeters / 1000).toFixed(2)} km · ${activeRoute.averageSpeedKmh} km/h`
        : 'Calculating',
      tone: 'text-emerald-400',
    },
    {
      label: 'Green Corridor Status',
      value:
        greenCorridor.status === 'ACTIVE_PRIORITIZATION'
          ? 'ACTIVE'
          : greenCorridor.status === 'CLEARED'
            ? 'CLEARED'
            : greenCorridor.enabled
              ? 'ARMED'
              : 'OFF',
      detail: `${greenCorridor.activatedCount} GREEN · ${greenCorridor.awaitingCount} awaiting · ${greenCorridor.restoredCount} restored`,
      tone:
        greenCorridor.status === 'ACTIVE_PRIORITIZATION'
          ? 'text-emerald-400'
          : 'text-slate-300',
    },
  ];

  return (
    <section
      aria-label="Key dispatch metrics"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl bg-[#0f172a] border border-slate-800/90 px-4 py-3.5 flex flex-col justify-between gap-1.5"
        >
          <div className="text-xs font-medium text-slate-400">{card.label}</div>
          <div className={`font-display text-xl font-bold tabular-nums ${card.tone}`}>
            {card.value}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{card.detail}</div>
        </div>
      ))}
    </section>
  );
}
