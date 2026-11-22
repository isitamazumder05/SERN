import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  Eye,
  EyeOff,
  MapPin,
  Maximize2,
  Moon,
  Sun,
} from 'lucide-react';
import {
  extractRoutePrefix,
  formatDistance,
  formatDuration,
  interpolateAlongRoute,
  shortestAngleDeltaDeg,
} from '../core/geo';
import type { Coordinate, SignalState, SernSystemSnapshot } from '../core/types';

interface BengaluruMapProps {
  snapshot: SernSystemSnapshot;
  heightClass?: string;
  onSelectHospital?: (hospitalId: string) => void;
}

function createPersistentAmbulanceIcon(initialBearing: number, isActive: boolean): L.DivIcon {
  return L.divIcon({
    className: 'sern-ambulance-icon',
    iconSize: [54, 54],
    iconAnchor: [27, 27],
    popupAnchor: [0, -20],
    html: `
      <div class="sern-ambulance-wrap" data-active="${isActive ? 'true' : 'false'}" style="width:54px;height:54px;display:flex;align-items:center;justify-content:center;pointer-events:auto;">
        <svg class="sern-amb-rotator" width="54" height="54" viewBox="0 0 54 54" style="transform: rotate(${initialBearing}deg); will-change: transform;">
          <defs>
            <linearGradient id="sernHeadlightGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="rgba(253, 224, 71, 0.36)" />
              <stop offset="100%" stop-color="rgba(253, 224, 71, 0)" />
            </linearGradient>
          </defs>
          <!-- Radar pulse ring while active -->
          <circle class="sern-amb-radar" cx="27" cy="27" r="22" fill="rgba(16,185,129,0.14)" stroke="#10b981" stroke-width="1.4" />
          <!-- Directional headlight cone -->
          <polygon class="sern-amb-headlight" points="21,13 33,13 38,1 16,1" fill="url(#sernHeadlightGrad)" />
          <!-- Ground drop shadow -->
          <rect x="17" y="13" width="22" height="30" rx="6" fill="rgba(0,0,0,0.45)" />
          <!-- Ambulance body -->
          <g transform="translate(15, 11)">
            <rect x="2" y="2" width="20" height="28" rx="5" fill="#f8fafc" stroke="#10b981" stroke-width="2"/>
            <!-- Cabin roof + windshield -->
            <path d="M5 7 C5 4.8, 19 4.8, 19 7 L18 11 L6 11 Z" fill="#0f172a" />
            <rect x="6.5" y="6" width="11" height="4" rx="1.5" fill="#38bdf8" opacity="0.9" />
            <!-- Rear emergency bay & medical cross -->
            <rect x="4.5" y="13" width="15" height="14" rx="2.5" fill="#e2e8f0" />
            <path d="M12 16v8M8 20h8" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round"/>
            <!-- Emergency lightbar (red/blue LEDs) -->
            <rect x="5" y="11" width="6.5" height="2.6" rx="1" fill="#ef4444" class="sern-amb-strobe-red" />
            <rect x="12.5" y="11" width="6.5" height="2.6" rx="1" fill="#3b82f6" class="sern-amb-strobe-blue" />
            <!-- Headlight dots -->
            <circle cx="6.2" cy="3.2" r="1.3" fill="#fef08a" />
            <circle cx="17.8" cy="3.2" r="1.3" fill="#fef08a" />
          </g>
        </svg>
      </div>
    `,
  });
}

function createAccidentIcon(): L.DivIcon {
  return L.divIcon({
    className: 'sern-accident-icon',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
    html: `
      <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="rgba(220,38,38,0.22)" stroke="#dc2626" stroke-width="2"/>
          <path d="M16 7L25 23H7L16 7Z" fill="#dc2626" stroke="#fecaca" stroke-width="1.2"/>
          <rect x="15" y="13" width="2" height="5" fill="#ffffff" rx="1"/>
          <circle cx="16" cy="20.2" r="1.1" fill="#ffffff"/>
        </svg>
      </div>
    `,
  });
}

function createHospitalIcon(isSelected: boolean): L.DivIcon {
  const border = isSelected ? '#10b981' : '#60a5fa';
  const bg = isSelected ? '#064e3b' : '#0f172a';
  const size = isSelected ? 32 : 26;
  return L.divIcon({
    className: 'sern-hospital-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -14],
    html: `
      <div style="width:${size}px;height:${size}px;border-radius:8px;background:${bg};border:2px solid ${border};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.45);">
        <span style="color:#ffffff;font-weight:800;font-size:${isSelected ? 15 : 12}px;font-family:Plus Jakarta Sans,sans-serif;">H</span>
      </div>
    `,
  });
}

function createRnsitReferenceIcon(): L.DivIcon {
  return L.divIcon({
    className: 'sern-rnsit-icon',
    iconSize: [148, 30],
    iconAnchor: [14, 15],
    popupAnchor: [40, -14],
    html: `
      <div style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
        <div style="width:28px;height:28px;border-radius:8px;background:#1e1b4b;border:2px solid #818cf8;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.6);">
          <span style="color:#e0e7ff;font-weight:800;font-size:11px;font-family:JetBrains Mono,monospace;">RNS</span>
        </div>
        <span style="padding:2px 7px;border-radius:6px;background:rgba(15,23,42,0.94);border:1px solid #818cf8;color:#e0e7ff;font-family:Plus Jakarta Sans,sans-serif;font-size:11px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,0.5);">
          RNSIT Campus
        </span>
      </div>
    `,
  });
}

function createAmbulanceStartIcon(): L.DivIcon {
  return L.divIcon({
    className: 'sern-amb-start-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
    html: `
      <div style="width:22px;height:22px;border-radius:9999px;background:#0f172a;border:2px dashed #38bdf8;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);">
        <span style="color:#38bdf8;font-weight:800;font-size:9px;font-family:JetBrains Mono,monospace;">S</span>
      </div>
    `,
  });
}

function createSignalIcon(
  state: SignalState,
  onRoute: boolean,
  sequenceOrder: number | null
): L.DivIcon {
  if (!onRoute) {
    return L.divIcon({
      className: 'sern-signal-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -9],
      html: `
        <div style="width:14px;height:14px;border-radius:4px;background:rgba(15,23,42,0.85);border:1.5px solid #64748b;display:flex;align-items:center;justify-content:center;">
          <div style="width:5px;height:5px;border-radius:9999px;background:#94a3b8;"></div>
        </div>
      `,
    });
  }

  const seqLabel = sequenceOrder ? `#${sequenceOrder}` : '';
  const isGreen = state === 'GREEN';
  const isRed = state === 'RED';
  const isRestored = state === 'RESTORED';

  const borderColor = isGreen
    ? '#22c55e'
    : isRed
      ? '#ef4444'
      : isRestored
        ? '#38bdf8'
        : '#94a3b8';

  const lampHtml = isRestored
    ? `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.3L5 8.8L9.5 3.6" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
         <span style="width:6px;height:6px;border-radius:9999px;background:${isRed ? '#ef4444' : '#334155'};${isRed ? 'box-shadow:0 0 6px #ef4444;' : ''}"></span>
         <span style="width:6px;height:6px;border-radius:9999px;background:${isGreen ? '#22c55e' : '#334155'};${isGreen ? 'box-shadow:0 0 8px #22c55e;' : ''}"></span>
       </div>`;

  const stateShort = isGreen ? 'GO' : isRed ? 'WAIT' : isRestored ? 'CLR' : 'STD';

  return L.divIcon({
    className: 'sern-signal-icon',
    iconSize: [52, 24],
    iconAnchor: [-6, 12],
    popupAnchor: [18, -12],
    html: `
      <div style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
        <div class="${isGreen ? 'sern-signal-green-active' : ''}" style="width:20px;height:22px;border-radius:5px;background:#090f1c;border:2px solid ${borderColor};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.6);">
          ${lampHtml}
        </div>
        <span style="padding:1px 4px;border-radius:4px;background:rgba(9,15,28,0.92);border:1px solid ${borderColor};color:${borderColor};font-family:JetBrains Mono,monospace;font-size:9px;font-weight:700;line-height:1.2;">
          ${seqLabel ? `${seqLabel} ` : ''}${stateShort}
        </span>
      </div>
    `,
  });
}

function getSignalPhaseDescription(state: SignalState): string {
  switch (state) {
    case 'GREEN':
      return 'GREEN — Preempted for Emergency Corridor';
    case 'RED':
      return 'RED — Awaiting Sequential Ambulance Approach';
    case 'RESTORED':
      return 'RESTORED — Cleared & Returned to Normal Phase';
    default:
      return 'NORMAL — Standard Cycle (Off-Route / Standby)';
  }
}

export function BengaluruMap({
  snapshot,
  heightClass = 'h-[500px] xl:h-[560px]',
  onSelectHospital,
}: BengaluruMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilePaneRef = useRef<HTMLElement | null>(null);

  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const congestionLayerRef = useRef<L.LayerGroup | null>(null);
  const signalsLayerRef = useRef<L.LayerGroup | null>(null);
  const hospitalsLayerRef = useRef<L.LayerGroup | null>(null);
  const incidentMarkerRef = useRef<L.Marker | null>(null);
  const rnsitMarkerRef = useRef<L.Marker | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const traversedTrailRef = useRef<L.Polyline | null>(null);

  const [followAmbulance, setFollowAmbulance] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [showSignals, setShowSignals] = useState(true);
  const [darkMapTiles, setDarkMapTiles] = useState(true);

  const hasFitInitialRef = useRef(false);
  const followRef = useRef(followAmbulance);
  followRef.current = followAmbulance;

  // Live animation state for 60fps road-curve interpolation between server snapshots
  const animRef = useRef<{
    baseDistanceMeters: number;
    speedMps: number;
    syncedAtMs: number;
    totalDistanceMeters: number;
    geometry: Coordinate[];
    routeId: string | null;
    isMoving: boolean;
    smoothDistanceMeters: number;
    smoothBearing: number;
    lastPanMs: number;
  }>({
    baseDistanceMeters: snapshot.ambulance.distanceCoveredMeters,
    speedMps: 0,
    syncedAtMs: performance.now(),
    totalDistanceMeters: snapshot.activeRoute?.distanceMeters ?? 0,
    geometry: snapshot.activeRoute?.geometry ?? [],
    routeId: snapshot.activeRoute?.id ?? null,
    isMoving: false,
    smoothDistanceMeters: snapshot.ambulance.distanceCoveredMeters,
    smoothBearing: snapshot.ambulance.bearingDegrees,
    lastPanMs: 0,
  });

  // Initialize Leaflet map centered on RNSIT Campus, RR Nagar, Bengaluru
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [snapshot.referenceLocation.coord.lat, snapshot.referenceLocation.coord.lng],
      zoom: 14,
      zoomControl: true,
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });
    tileLayer.addTo(map);
    tilePaneRef.current = map.getPane('tilePane') ?? null;

    routesLayerRef.current = L.layerGroup().addTo(map);
    congestionLayerRef.current = L.layerGroup().addTo(map);
    signalsLayerRef.current = L.layerGroup().addTo(map);
    hospitalsLayerRef.current = L.layerGroup().addTo(map);

    traversedTrailRef.current = L.polyline([], {
      color: '#6ee7b7',
      weight: 6,
      opacity: 0.92,
      lineCap: 'round',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      ambulanceMarkerRef.current = null;
      incidentMarkerRef.current = null;
      rnsitMarkerRef.current = null;
      startMarkerRef.current = null;
      traversedTrailRef.current = null;
    };
  }, []);

  // Apply dark/light OSM tile filter without reloading tiles
  useEffect(() => {
    const pane = tilePaneRef.current;
    if (!pane) return;
    pane.style.filter = darkMapTiles
      ? 'invert(92%) hue-rotate(180deg) brightness(92%) contrast(92%) saturate(75%)'
      : 'none';
  }, [darkMapTiles]);

  // Sync routes & congestion overlays
  useEffect(() => {
    const map = mapRef.current;
    const routesGroup = routesLayerRef.current;
    const congestionGroup = congestionLayerRef.current;
    if (!map || !routesGroup || !congestionGroup) return;

    routesGroup.clearLayers();
    congestionGroup.clearLayers();

    // 1. Congested road segment highlights
    for (const seg of snapshot.roadSegments) {
      if (seg.congestionLevel === 'NONE') continue;
      const color =
        seg.congestionLevel === 'HIGH'
          ? '#ef4444'
          : seg.congestionLevel === 'MEDIUM'
            ? '#f97316'
            : '#eab308';
      const line = L.polyline(
        seg.waypoints.map((w) => [w.lat, w.lng] as [number, number]),
        {
          color,
          weight: 8,
          opacity: 0.72,
        }
      );
      line.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-white">${seg.name}</div>
          <div>Simulated Congestion: <strong style="color:${color}">${seg.congestionLevel}</strong></div>
          <div>Delay Impact: <strong>${seg.congestionMultiplier}x travel time</strong></div>
        </div>`
      );
      line.addTo(congestionGroup);
    }

    // 2. Alternative non-selected candidate routes (dashed blue)
    if (showAlternatives) {
      for (const modeKey of ['shortest', 'fastest', 'congestion_aware'] as const) {
        const candidate = snapshot.routeCandidates[modeKey];
        if (!candidate || modeKey === snapshot.selectedMode) continue;
        const altLine = L.polyline(
          candidate.geometry.map((c) => [c.lat, c.lng] as [number, number]),
          {
            color: '#3b82f6',
            weight: 3.5,
            opacity: 0.65,
            dashArray: '6 8',
          }
        );
        altLine.bindPopup(
          `<div class="text-xs space-y-1">
            <div class="font-semibold text-blue-300">Alternative: ${candidate.label}</div>
            <div>Corridor: ${candidate.corridorSummary}</div>
            <div>Distance: ${formatDistance(candidate.distanceMeters)} · ETA: ${formatDuration(candidate.adjustedDurationSeconds)}</div>
          </div>`
        );
        altLine.addTo(routesGroup);
      }
    }

    // 3. Previous route before reroute (dashed orange)
    if (snapshot.previousRoute) {
      const oldLine = L.polyline(
        snapshot.previousRoute.geometry.map((c) => [c.lat, c.lng] as [number, number]),
        {
          color: '#f97316',
          weight: 4.5,
          opacity: 0.85,
          dashArray: '8 6',
        }
      );
      oldLine.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-orange-400">Previous Route (Congested)</div>
          <div>Corridor: ${snapshot.previousRoute.corridorSummary}</div>
          <div>Distance: ${formatDistance(snapshot.previousRoute.distanceMeters)}</div>
          <div>Congested ETA: ${formatDuration(snapshot.previousRoute.adjustedDurationSeconds)}</div>
        </div>`
      );
      oldLine.addTo(routesGroup);
    }

    // 4. Active selected ambulance route (vivid green)
    if (snapshot.activeRoute && snapshot.activeRoute.geometry.length > 1) {
      const latLngs = snapshot.activeRoute.geometry.map(
        (c) => [c.lat, c.lng] as [number, number]
      );

      // Subtle dark casing for high contrast
      L.polyline(latLngs, {
        color: '#064e3b',
        weight: 8,
        opacity: 0.7,
      }).addTo(routesGroup);

      const mainLine = L.polyline(latLngs, {
        color: '#10b981',
        weight: 4.5,
        opacity: 0.88,
      });
      mainLine.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-emerald-400">Active Route · ${snapshot.activeRoute.label}</div>
          <div>Corridor: ${snapshot.activeRoute.corridorSummary}</div>
          <div>Distance: ${formatDistance(snapshot.activeRoute.distanceMeters)} · ETA: ${formatDuration(snapshot.activeRoute.adjustedDurationSeconds)}</div>
        </div>`
      );
      mainLine.addTo(routesGroup);

      if (!hasFitInitialRef.current) {
        const bounds = mainLine.getBounds();
        bounds.extend([
          snapshot.referenceLocation.coord.lat,
          snapshot.referenceLocation.coord.lng,
        ]);
        map.fitBounds(bounds, {
          paddingTopLeft: [46, 36],
          paddingBottomRight: [46, 72],
          maxZoom: 14,
        });
        hasFitInitialRef.current = true;
      }
    }
  }, [
    snapshot.activeRoute,
    snapshot.previousRoute,
    snapshot.routeCandidates,
    snapshot.selectedMode,
    snapshot.roadSegments,
    snapshot.referenceLocation,
    showAlternatives,
  ]);

  // Sync hospitals, RNSIT reference landmark, ambulance start, and incident markers
  useEffect(() => {
    const map = mapRef.current;
    const hospitalsGroup = hospitalsLayerRef.current;
    if (!map || !hospitalsGroup) return;

    hospitalsGroup.clearLayers();
    for (const hosp of snapshot.hospitals) {
      const isSelected = hosp.id === snapshot.selectedHospitalId;
      const marker = L.marker([hosp.coord.lat, hosp.coord.lng], {
        icon: createHospitalIcon(isSelected),
        zIndexOffset: isSelected ? 400 : 200,
      });
      marker.bindPopup(
        `<div class="text-xs space-y-1.5 min-w-[200px]">
          <div class="font-semibold text-white">${hosp.name}</div>
          <div class="text-slate-300">${hosp.traumaLevel}</div>
          <div>Beds (Simulated): <strong>${hosp.emergencyBedsAvailable} ER</strong> · <strong>${hosp.icuBedsAvailable} ICU</strong></div>
          ${hosp.distanceMeters ? `<div>Route Distance: <strong>${formatDistance(hosp.distanceMeters)}</strong></div>` : ''}
          ${hosp.etaSeconds ? `<div>Estimated ETA: <strong>${formatDuration(hosp.etaSeconds)}</strong></div>` : ''}
          <div class="text-[11px] text-emerald-400">${isSelected ? 'Selected Destination' : 'Double-click marker or select in sidebar to route here'}</div>
        </div>`
      );
      if (onSelectHospital) {
        marker.on('dblclick', () => onSelectHospital(hosp.id));
      }
      marker.addTo(hospitalsGroup);
    }

    // RNSIT Campus Reference Marker
    if (!rnsitMarkerRef.current) {
      rnsitMarkerRef.current = L.marker(
        [snapshot.referenceLocation.coord.lat, snapshot.referenceLocation.coord.lng],
        { icon: createRnsitReferenceIcon(), zIndexOffset: 560 }
      ).addTo(map);
    } else {
      rnsitMarkerRef.current.setLatLng([
        snapshot.referenceLocation.coord.lat,
        snapshot.referenceLocation.coord.lng,
      ]);
    }
    rnsitMarkerRef.current.bindPopup(
      `<div class="text-xs space-y-1 min-w-[220px]">
        <div class="font-semibold text-indigo-300">Reference Campus · ${snapshot.referenceLocation.shortName}</div>
        <div class="text-white font-medium">${snapshot.referenceLocation.name}</div>
        <div class="text-slate-300">${snapshot.referenceLocation.address}</div>
        <div class="font-mono text-[11px] text-slate-400">${snapshot.referenceLocation.coord.lat.toFixed(4)}° N, ${snapshot.referenceLocation.coord.lng.toFixed(4)}° E</div>
      </div>`
    );

    // Simulated Ambulance Starting Point Marker
    if (!startMarkerRef.current) {
      startMarkerRef.current = L.marker(
        [snapshot.ambulance.startCoord.lat, snapshot.ambulance.startCoord.lng],
        { icon: createAmbulanceStartIcon(), zIndexOffset: 420 }
      ).addTo(map);
    } else {
      startMarkerRef.current.setLatLng([
        snapshot.ambulance.startCoord.lat,
        snapshot.ambulance.startCoord.lng,
      ]);
    }
    startMarkerRef.current.bindPopup(
      `<div class="text-xs space-y-1 min-w-[200px]">
        <div class="font-semibold text-sky-300">Simulated Ambulance Starting Point</div>
        <div class="text-white">${snapshot.ambulance.startLocationName}</div>
        <div class="font-mono text-[11px] text-slate-400">${snapshot.ambulance.startCoord.lat.toFixed(4)}° N, ${snapshot.ambulance.startCoord.lng.toFixed(4)}° E</div>
      </div>`
    );

    // Accident Marker near RNSIT
    if (!incidentMarkerRef.current) {
      incidentMarkerRef.current = L.marker(
        [snapshot.incident.coord.lat, snapshot.incident.coord.lng],
        { icon: createAccidentIcon(), zIndexOffset: 540 }
      ).addTo(map);
    } else {
      incidentMarkerRef.current.setLatLng([
        snapshot.incident.coord.lat,
        snapshot.incident.coord.lng,
      ]);
    }
    incidentMarkerRef.current.bindPopup(
      `<div class="text-xs space-y-1">
        <div class="font-semibold text-red-400">Simulated Accident · ${snapshot.incident.severity}</div>
        <div class="text-white">${snapshot.incident.locationName}</div>
        <div>Incident ID: <span class="font-mono">${snapshot.incident.id}</span></div>
      </div>`
    );
  }, [
    snapshot.hospitals,
    snapshot.selectedHospitalId,
    snapshot.incident,
    snapshot.referenceLocation,
    snapshot.ambulance.startCoord,
    snapshot.ambulance.startLocationName,
    onSelectHospital,
  ]);

  // Sync traffic signal markers with sequential phase indicators
  useEffect(() => {
    const signalsGroup = signalsLayerRef.current;
    if (!signalsGroup) return;
    signalsGroup.clearLayers();
    if (!showSignals) return;

    for (const sig of snapshot.signals) {
      const marker = L.marker([sig.coord.lat, sig.coord.lng], {
        icon: createSignalIcon(sig.state, sig.onActiveRoute, sig.sequenceOrder),
        zIndexOffset: sig.state === 'GREEN' ? 620 : sig.onActiveRoute ? 480 : 150,
      });

      const delta = sig.distanceFromAmbulanceMeters;
      const proximityLine =
        delta === null
          ? 'Off-Route Intersection'
          : delta > 0
            ? `${formatDistance(delta)} ahead of ambulance`
            : `${formatDistance(Math.abs(delta))} behind ambulance`;

      marker.bindPopup(
        `<div class="text-xs space-y-1 min-w-[210px]">
          <div class="font-semibold text-white">${sig.sequenceOrder ? `#${sig.sequenceOrder} · ` : ''}${sig.name}</div>
          <div>Signal ID: <span class="font-mono">${sig.id}</span> · ${sig.corridor}</div>
          <div>Simulated Signal: <strong>${getSignalPhaseDescription(sig.state)}</strong></div>
          <div>Proximity: <span class="font-mono">${proximityLine}</span></div>
          ${sig.routeDistanceMeters !== null ? `<div>Route Offset: <span class="font-mono">${formatDistance(sig.routeDistanceMeters)}</span></div>` : ''}
        </div>`
      );
      marker.addTo(signalsGroup);
    }
  }, [snapshot.signals, showSignals]);

  // Sync authoritative server state into smooth rAF interpolator (without recreating the SVG icon)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const {
      currentCoord,
      bearingDegrees,
      status,
      id,
      callSign,
      currentSpeedKmh,
      speedMultiplier,
      isPaused,
      distanceCoveredMeters,
      remainingDistanceMeters,
      etaSeconds,
    } = snapshot.ambulance;

    const isMoving = (status === 'DISPATCHED' || status === 'EN_ROUTE') && !isPaused;
    const geometry = snapshot.activeRoute?.geometry ?? [];
    const routeId = snapshot.activeRoute?.id ?? null;
    const totalDistanceMeters = snapshot.activeRoute?.distanceMeters ?? 0;

    if (!ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current = L.marker([currentCoord.lat, currentCoord.lng], {
        icon: createPersistentAmbulanceIcon(bearingDegrees, isMoving),
        zIndexOffset: 900,
      })
        .bindPopup('')
        .addTo(map);
    }

    ambulanceMarkerRef.current.setPopupContent(
      `<div class="text-xs space-y-1">
        <div class="font-semibold text-emerald-400">${id} (${callSign})</div>
        <div>Status: <strong>${status.replace('_', ' ')}${isPaused ? ' (PAUSED)' : ''}</strong></div>
        <div>Simulated GPS: <span class="font-mono">${currentCoord.lat.toFixed(4)}, ${currentCoord.lng.toFixed(4)}</span></div>
        <div>Simulated Speed: <strong>${currentSpeedKmh} km/h</strong> · Sim: <strong>${speedMultiplier}x</strong></div>
        <div>Remaining: <strong>${formatDistance(remainingDistanceMeters)}</strong> · ETA: <strong>${formatDuration(etaSeconds)}</strong></div>
      </div>`
    );

    const prev = animRef.current;
    const routeChanged = prev.routeId !== routeId;
    const jumped = Math.abs(distanceCoveredMeters - prev.smoothDistanceMeters) > 350;

    animRef.current = {
      baseDistanceMeters: distanceCoveredMeters,
      speedMps: isMoving ? (currentSpeedKmh / 3.6) * speedMultiplier : 0,
      syncedAtMs: performance.now(),
      totalDistanceMeters,
      geometry,
      routeId,
      isMoving,
      smoothDistanceMeters:
        routeChanged || jumped || status === 'STANDBY' || status === 'ARRIVED'
          ? distanceCoveredMeters
          : Math.max(prev.smoothDistanceMeters, distanceCoveredMeters),
      smoothBearing:
        routeChanged || status === 'STANDBY' ? bearingDegrees : prev.smoothBearing,
      lastPanMs: prev.lastPanMs,
    };

    // Update persistent marker active state & DOM transform immediately
    const markerEl = ambulanceMarkerRef.current.getElement();
    if (markerEl) {
      const wrap = markerEl.querySelector('.sern-ambulance-wrap') as HTMLElement | null;
      if (wrap) {
        wrap.dataset.active = isMoving ? 'true' : 'false';
      }
    }

    if (!isMoving) {
      ambulanceMarkerRef.current.setLatLng([currentCoord.lat, currentCoord.lng]);
      const rotator = markerEl?.querySelector('.sern-amb-rotator') as HTMLElement | null;
      if (rotator) {
        rotator.style.transform = `rotate(${bearingDegrees}deg)`;
      }
      if (traversedTrailRef.current) {
        const trail =
          status === 'ARRIVED'
            ? geometry
            : status === 'STANDBY'
              ? []
              : extractRoutePrefix(geometry, distanceCoveredMeters);
        traversedTrailRef.current.setLatLngs(
          trail.map((c) => [c.lat, c.lng] as [number, number])
        );
      }
    }
  }, [snapshot.ambulance, snapshot.activeRoute]);

  // 60fps continuous road-curve glide loop while ambulance is actively dispatched/en-route
  useEffect(() => {
    const isActiveMovement =
      (snapshot.ambulance.status === 'DISPATCHED' || snapshot.ambulance.status === 'EN_ROUTE') &&
      !snapshot.ambulance.isPaused;
    if (!isActiveMovement) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let frameId = 0;
    let lastFrameMs = performance.now();

    const tick = (now: number) => {
      const dtSec = Math.min(0.08, Math.max(0.001, (now - lastFrameMs) / 1000));
      lastFrameMs = now;

      const st = animRef.current;
      const marker = ambulanceMarkerRef.current;
      if (st.isMoving && st.geometry.length >= 2 && marker) {
        const elapsedSinceSync = Math.min(0.32, Math.max(0, (now - st.syncedAtMs) / 1000));
        const targetDist = Math.min(
          st.totalDistanceMeters,
          st.baseDistanceMeters + st.speedMps * elapsedSinceSync
        );

        const nextDist = Math.max(
          st.smoothDistanceMeters,
          st.smoothDistanceMeters + (targetDist - st.smoothDistanceMeters) * Math.min(1, dtSec * 14)
        );
        st.smoothDistanceMeters = Math.min(st.totalDistanceMeters, nextDist);

        const pos = interpolateAlongRoute(st.geometry, st.smoothDistanceMeters);
        const angleDelta = shortestAngleDeltaDeg(st.smoothBearing, pos.bearingDegrees);
        st.smoothBearing = st.smoothBearing + angleDelta * Math.min(1, dtSec * 12);

        marker.setLatLng([pos.coord.lat, pos.coord.lng]);

        const markerEl = marker.getElement();
        const rotator = markerEl?.querySelector('.sern-amb-rotator') as HTMLElement | null;
        if (rotator) {
          rotator.style.transform = `rotate(${st.smoothBearing.toFixed(1)}deg)`;
        }

        if (traversedTrailRef.current) {
          const trailCoords = extractRoutePrefix(st.geometry, st.smoothDistanceMeters);
          traversedTrailRef.current.setLatLngs(
            trailCoords.map((c) => [c.lat, c.lng] as [number, number])
          );
        }

        if (containerRef.current) {
          containerRef.current.dataset.ambulanceLat = pos.coord.lat.toFixed(5);
          containerRef.current.dataset.ambulanceLng = pos.coord.lng.toFixed(5);
        }

        if (followRef.current && mapRef.current && now - st.lastPanMs > 180) {
          st.lastPanMs = now;
          mapRef.current.panTo([pos.coord.lat, pos.coord.lng], {
            animate: true,
            duration: 0.2,
          });
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [snapshot.ambulance.status, snapshot.ambulance.isPaused]);

  const handleFitRoute = () => {
    const map = mapRef.current;
    if (!map || !snapshot.activeRoute || snapshot.activeRoute.geometry.length < 2) return;
    const bounds = L.latLngBounds(
      snapshot.activeRoute.geometry.map((c) => [c.lat, c.lng] as [number, number])
    );
    bounds.extend([snapshot.referenceLocation.coord.lat, snapshot.referenceLocation.coord.lng]);
    map.fitBounds(bounds, {
      paddingTopLeft: [46, 36],
      paddingBottomRight: [46, 72],
    });
  };

  const handleFocusRnsit = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([snapshot.referenceLocation.coord.lat, snapshot.referenceLocation.coord.lng], 15, {
      animate: true,
    });
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-800/90 bg-[#0b1220]">
      {/* Map Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#0f172a] border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="font-semibold text-white">RNSIT · RR Nagar GIS</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-400">
            OpenStreetMap Live Emergency Routing
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleFocusRnsit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-xs text-indigo-200 border border-indigo-500/40 transition-colors"
          >
            <MapPin className="h-3.5 w-3.5 text-indigo-300" />
            <span>Focus RNSIT</span>
          </button>

          <button
            type="button"
            onClick={handleFitRoute}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Fit Route</span>
          </button>

          <button
            type="button"
            onClick={() => setFollowAmbulance((v) => !v)}
            aria-pressed={followAmbulance}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              followAmbulance
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700/80 text-slate-300'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>Follow Unit</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAlternatives((v) => !v)}
            aria-pressed={showAlternatives}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              showAlternatives
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700/80 text-slate-300'
            }`}
          >
            {showAlternatives ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>Alternatives</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSignals((v) => !v)}
            aria-pressed={showSignals}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              showSignals
                ? 'bg-slate-800 border-slate-600 text-slate-100'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span>Signals</span>
          </button>

          <button
            type="button"
            onClick={() => setDarkMapTiles((v) => !v)}
            aria-label="Toggle map tile theme"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 transition-colors"
          >
            {darkMapTiles ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{darkMapTiles ? 'Light OSM' : 'Dark OSM'}</span>
          </button>
        </div>
      </div>

      {/* Leaflet Canvas */}
      <div
        ref={containerRef}
        data-testid="bengaluru-map"
        data-ambulance-lat={snapshot.ambulance.currentCoord.lat.toFixed(5)}
        data-ambulance-lng={snapshot.ambulance.currentCoord.lng.toFixed(5)}
        className={`w-full ${heightClass}`}
      />

      {/* Map Legend Overlay */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2 bg-[#0f172a]/95 border-t border-slate-800/80 text-[11px] text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-1 rounded bg-emerald-500" />
          Active Route
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-1 rounded bg-emerald-300" />
          Traversed Path
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-blue-400" />
          Alternative
        </span>
        {snapshot.previousRoute && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-orange-500" />
            Congested Prior Route
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-300" />
          Signal GREEN (Go)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 border border-red-300" />
          Signal RED (Awaiting)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-400 border border-sky-200" />
          Signal RESTORED
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-500 border border-slate-300" />
          Off-Route Normal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded bg-indigo-900 border border-indigo-400" />
          RNSIT Campus (Ref)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border border-dashed border-sky-400" />
          Simulated Start
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded bg-blue-500" />
          Hospital
        </span>
      </div>
    </div>
  );
}
