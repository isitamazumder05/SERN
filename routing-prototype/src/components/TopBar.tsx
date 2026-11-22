import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Menu,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { formatDuration } from '../core/geo';
import type { AmbulanceStatus, EventLogEntry, RerouteComparison } from '../core/types';
import { NAV_ITEMS, type NavSectionId } from './Sidebar';

interface TopBarProps {
  activeSection: NavSectionId;
  onOpenMobileMenu: () => void;
  ambulanceStatus: AmbulanceStatus;
  isPaused: boolean;
  onStartOrResume: () => void;
  onPause: () => void;
  onReset: () => void;
  events: EventLogEntry[];
  rerouteComparison: RerouteComparison | null;
  onNavigateEvents: () => void;
  isLoading: boolean;
}

export function TopBar({
  activeSection,
  onOpenMobileMenu,
  ambulanceStatus,
  isPaused,
  onStartOrResume,
  onPause,
  onReset,
  events,
  rerouteComparison,
  onNavigateEvents,
  isLoading,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date());
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeTitle = NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? 'Overview';
  const isRunning =
    (ambulanceStatus === 'DISPATCHED' || ambulanceStatus === 'EN_ROUTE') && !isPaused;

  const formattedDateTime = now.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const recentAlerts = events.slice(0, 6);

  return (
    <header className="relative z-30 flex items-center justify-between gap-4 px-4 lg:px-6 py-3 bg-[#0b111e] border-b border-slate-800/80">
      {/* Left: Mobile Trigger + Section Context + Operational Status */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-sm">
            <h1 className="font-display font-semibold text-white truncate">{activeTitle}</h1>
            <span className="hidden sm:inline text-slate-600" aria-hidden="true">
              /
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-400 whitespace-nowrap">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>System Operational</span>
            </span>
          </div>
        </div>
      </div>

      {/* Center / Right: Emergency Alert + Clock + Notifications + Primary Dispatch Action */}
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        {/* Emergency Alert Indicator */}
        <button
          type="button"
          onClick={onNavigateEvents}
          className="hidden md:flex items-center gap-2 text-xs font-medium text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
          title="View emergency alert and event history"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {rerouteComparison
              ? `Rerouted · Saved ${formatDuration(rerouteComparison.timeSavedSeconds)}`
              : 'Active Incident · RNSIT / RR Nagar'}
          </span>
        </button>

        {/* Clock */}
        <div
          className="hidden xl:block font-mono text-xs tabular-nums text-slate-400 whitespace-nowrap"
          aria-label="Current system date and time"
        >
          {formattedDateTime} IST
        </div>

        {/* Notifications Popover Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label="Toggle dispatch notifications"
            aria-expanded={notifOpen}
            className="relative rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {events.length > 0 && (
              <span className="sr-only">{events.length} dispatch events logged</span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#0f172a] border border-slate-700/80 shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-white">Recent Dispatch Alerts</span>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onNavigateEvents();
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  View all logs
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {recentAlerts.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2 rounded-lg bg-[#0b111e] border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`font-medium ${
                          evt.severity === 'CRITICAL'
                            ? 'text-red-400'
                            : evt.severity === 'WARNING'
                              ? 'text-amber-400'
                              : evt.severity === 'SUCCESS'
                                ? 'text-emerald-400'
                                : 'text-blue-400'
                        }`}
                      >
                        {evt.status}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500">
                        {new Date(evt.timestamp).toLocaleTimeString('en-IN', {
                          hour12: false,
                        })}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-snug">{evt.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Primary Dispatch Controls */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={onPause}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartOrResume}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {ambulanceStatus === 'STANDBY'
                  ? 'Start Simulation'
                  : ambulanceStatus === 'ARRIVED'
                    ? 'Replay Route'
                    : 'Resume'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onReset}
            disabled={isLoading}
            aria-label="Reset simulation scenario"
            title="Reset scenario"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
