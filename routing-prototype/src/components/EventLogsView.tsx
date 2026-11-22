import { useState } from 'react';
import { Search } from 'lucide-react';
import type { EventLogEntry, EventSeverity } from '../core/types';

interface EventLogsViewProps {
  events: EventLogEntry[];
}

export function EventLogsView({ events }: EventLogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | EventSeverity>('ALL');

  const filtered = events.filter((e) => {
    const matchesSeverity = severityFilter === 'ALL' || e.severity === severityFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesText =
      q === '' ||
      e.description.toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q);
    return matchesSeverity && matchesText;
  });

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-white">
            Real-Time Dispatch & Routing Event Log
          </h2>
          <p className="text-xs text-slate-400">
            Chronological audit stream of emergency alerts, route calculations, Green Corridor signal transitions, and congestion rerouting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter events..."
              aria-label="Filter event logs"
              className="rounded-lg bg-[#080d17] border border-slate-700 pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#080d17] border border-slate-800">
            {(['ALL', 'CRITICAL', 'WARNING', 'SUCCESS', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  severityFilter === sev
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-[#0f172a] border border-slate-800/90 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No event logs match your current search or severity filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b111e] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Event Description</th>
                  <th className="py-2.5 px-4 font-medium">Category</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/25">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleTimeString('en-IN', {
                        hour12: false,
                      })}
                    </td>
                    <td className="py-2.5 px-4 text-slate-100">{evt.description}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {evt.category}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-200 whitespace-nowrap">
                      {evt.status}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                      <span
                        className={
                          evt.severity === 'CRITICAL'
                            ? 'text-red-400'
                            : evt.severity === 'WARNING'
                              ? 'text-amber-400'
                              : evt.severity === 'SUCCESS'
                                ? 'text-emerald-400'
                                : 'text-blue-400'
                        }
                      >
                        {evt.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
