import type { Coordinate } from './types';

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Computes great-circle Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Computes total polyline length in meters.
 */
export function polylineDistanceMeters(coords: Coordinate[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistanceMeters(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * Computes initial compass bearing in degrees [0, 360) from coordinate a to b.
 */
export function computeBearingDegrees(a: Coordinate, b: Coordinate): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export interface InterpolatedRoutePosition {
  coord: Coordinate;
  bearingDegrees: number;
  clampedDistanceMeters: number;
  segmentIndex: number;
}

/**
 * Returns the exact interpolated coordinate and heading along a route polyline
 * for a given distance traveled from the start of the route.
 */
export function interpolateAlongRoute(
  geometry: Coordinate[],
  distanceMeters: number
): InterpolatedRoutePosition {
  if (geometry.length === 0) {
    return {
      coord: { lat: 12.9176, lng: 77.6233 },
      bearingDegrees: 0,
      clampedDistanceMeters: 0,
      segmentIndex: 0,
    };
  }

  if (geometry.length === 1 || distanceMeters <= 0) {
    const bearing =
      geometry.length > 1 ? computeBearingDegrees(geometry[0], geometry[1]) : 0;
    return {
      coord: geometry[0],
      bearingDegrees: bearing,
      clampedDistanceMeters: 0,
      segmentIndex: 0,
    };
  }

  let accumulated = 0;
  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1];
    const curr = geometry[i];
    const segLen = haversineDistanceMeters(prev, curr);
    if (segLen <= 0.001) continue;

    if (accumulated + segLen >= distanceMeters) {
      const ratio = Math.max(0, Math.min(1, (distanceMeters - accumulated) / segLen));
      return {
        coord: {
          lat: prev.lat + (curr.lat - prev.lat) * ratio,
          lng: prev.lng + (curr.lng - prev.lng) * ratio,
        },
        bearingDegrees: computeBearingDegrees(prev, curr),
        clampedDistanceMeters: distanceMeters,
        segmentIndex: i - 1,
      };
    }
    accumulated += segLen;
  }

  const last = geometry[geometry.length - 1];
  const prev = geometry[geometry.length - 2];
  return {
    coord: last,
    bearingDegrees: computeBearingDegrees(prev, last),
    clampedDistanceMeters: accumulated,
    segmentIndex: geometry.length - 2,
  };
}

/**
 * Finds the shortest distance along a route polyline (in meters from start)
 * to a target coordinate, plus the perpendicular snap distance.
 */
export function projectPointOntoRoute(
  geometry: Coordinate[],
  point: Coordinate
): { distanceAlongRouteMeters: number; snapDistanceMeters: number } {
  if (geometry.length === 0) {
    return { distanceAlongRouteMeters: 0, snapDistanceMeters: Infinity };
  }
  if (geometry.length === 1) {
    return {
      distanceAlongRouteMeters: 0,
      snapDistanceMeters: haversineDistanceMeters(geometry[0], point),
    };
  }

  let bestSnap = Infinity;
  let bestAlong = 0;
  let accumulated = 0;

  // Use local flat-earth approximation around Bengaluru (~12.95°N) for fast segment projection
  const cosLat = Math.cos(toRadians(point.lat));
  const metersPerDegLat = 111132;
  const metersPerDegLng = 111320 * cosLat;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const segLen = haversineDistanceMeters(a, b);

    const ax = 0;
    const ay = 0;
    const bx = (b.lng - a.lng) * metersPerDegLng;
    const by = (b.lat - a.lat) * metersPerDegLat;
    const px = (point.lng - a.lng) * metersPerDegLng;
    const py = (point.lat - a.lat) * metersPerDegLat;

    const abSq = bx * bx + by * by;
    let t = 0;
    if (abSq > 0) {
      t = Math.max(0, Math.min(1, (px * bx + py * by) / abSq));
    }
    const projX = ax + t * bx;
    const projY = ay + t * by;
    const dist = Math.hypot(px - projX, py - projY);

    if (dist < bestSnap) {
      bestSnap = dist;
      bestAlong = accumulated + segLen * t;
    }

    accumulated += segLen;
  }

  return {
    distanceAlongRouteMeters: bestAlong,
    snapDistanceMeters: bestSnap,
  };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Returns the shortest signed angular delta in [-180, 180] from one bearing to another.
 */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

/**
 * Extracts the sub-polyline from the start of a route up to distanceMeters,
 * ending at the exact interpolated position.
 */
export function extractRoutePrefix(
  geometry: Coordinate[],
  distanceMeters: number
): Coordinate[] {
  if (geometry.length < 2 || distanceMeters <= 0) {
    return geometry.length > 0 ? [geometry[0]] : [];
  }

  const out: Coordinate[] = [geometry[0]];
  let accumulated = 0;

  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1];
    const curr = geometry[i];
    const segLen = haversineDistanceMeters(prev, curr);
    if (segLen <= 0.001) continue;

    if (accumulated + segLen >= distanceMeters) {
      const ratio = Math.max(0, Math.min(1, (distanceMeters - accumulated) / segLen));
      out.push({
        lat: prev.lat + (curr.lat - prev.lat) * ratio,
        lng: prev.lng + (curr.lng - prev.lng) * ratio,
      });
      return out;
    }

    out.push(curr);
    accumulated += segLen;
  }

  return out;
}
