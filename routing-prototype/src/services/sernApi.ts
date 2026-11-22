import type {
  CongestionLevel,
  RoutingMode,
  SernSystemSnapshot,
} from '../core/types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const sernApi = {
  getState: () => requestJson<SernSystemSnapshot>('/api/state'),

  calculateRoute: async (params: {
    hospitalId?: string;
    mode?: RoutingMode;
    fromCurrentPosition?: boolean;
  }) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/route/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.snapshot;
  },

  triggerReroute: async (params?: {
    affectedRoadName?: string;
    congestionLevel?: CongestionLevel;
    reason?: string;
  }) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/route/reroute', {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    });
    return res.snapshot;
  },

  startSimulation: async () => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/simulation/start', {
      method: 'POST',
    });
    return res.snapshot;
  },

  pauseSimulation: async () => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/simulation/pause', {
      method: 'POST',
    });
    return res.snapshot;
  },

  resetSimulation: async () => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/simulation/reset', {
      method: 'POST',
    });
    return res.snapshot;
  },

  setSpeedMultiplier: async (speedMultiplier: number) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/simulation/speed', {
      method: 'POST',
      body: JSON.stringify({ speedMultiplier }),
    });
    return res.snapshot;
  },

  simulateCongestion: async (segmentId: string, level: CongestionLevel) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/traffic/congestion', {
      method: 'POST',
      body: JSON.stringify({ segmentId, level }),
    });
    return res.snapshot;
  },

  toggleGreenCorridor: async (enabled: boolean) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/traffic/green-corridor', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return res.snapshot;
  },

  setAutoReroute: async (enabled: boolean) => {
    const res = await requestJson<{ snapshot: SernSystemSnapshot }>('/api/traffic/auto-reroute', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return res.snapshot;
  },
};
