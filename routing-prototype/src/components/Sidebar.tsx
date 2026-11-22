import {
  Activity,
  Building2,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Navigation,
  Radio,
  TrafficCone,
  X,
} from 'lucide-react';

export type NavSectionId =
  | 'overview'
  | 'live_map'
  | 'route_optimization'
  | 'ambulance_simulation'
  | 'traffic_management'
  | 'green_corridor'
  | 'hospitals'
  | 'event_logs';

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live_map', label: 'Live Map', icon: MapIcon },
  { id: 'route_optimization', label: 'Route Optimization', icon: GitBranch },
  { id: 'ambulance_simulation', label: 'Ambulance Simulation', icon: Navigation },
  { id: 'traffic_management', label: 'Traffic Management', icon: TrafficCone },
  { id: 'green_corridor', label: 'Green Corridor', icon: Radio },
  { id: 'hospitals', label: 'Hospitals', icon: Building2 },
  { id: 'event_logs', label: 'Event Logs', icon: ListChecks },
];

interface SidebarProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  eventCount: number;
  greenCorridorActive: boolean;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  eventCount,
  greenCorridorActive,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-[#0b111e] border-r border-slate-800/80">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600/15 border border-red-500/30 text-red-400">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-normal text-white truncate">
              SERN Smart Routing
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Routing &amp; Traffic Control
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800/90 text-white border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'event_logs' && (
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {eventCount}
                </span>
              )}
              {item.id === 'green_corridor' && greenCorridorActive && (
                <span className="text-[11px] font-medium text-emerald-400">Active</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Scenario & Data Notice */}
      <div className="p-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-1.5">
        <div className="font-medium text-slate-300">Simulation Environment</div>
        <p className="leading-relaxed text-[11px] text-slate-400">
          Traffic congestion and hospital bed capacities are simulated for Bengaluru demonstration.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-full">{navContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
