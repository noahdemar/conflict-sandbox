import type { Environment } from './types';

/** Local hour (0..24) at timeline time t. Handles scenarios that cross midnight. */
export function hourAt(env: Environment, t: number, duration: number): number {
  return ((localHoursAbs(env, t, duration) % 24) + 24) % 24;
}

const smooth = (e0: number, e1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/**
 * Lighting at a given hour: `dark` 0 (day) .. 1 (deep night) and `warm` 0..1
 * for golden-hour tint around dawn and dusk.
 */
export function lighting(hour: number): { dark: number; warm: number } {
  const dawn = smooth(4.5, 7, hour);
  const dusk = 1 - smooth(17.5, 20, hour);
  const day = Math.min(dawn, dusk);
  const warm = Math.max(0, 1 - Math.abs(hour - 6.3) / 1.3) + Math.max(0, 1 - Math.abs(hour - 18.7) / 1.3);
  return { dark: 1 - day, warm: Math.min(1, warm) * 0.8 };
}

const RAD = Math.PI / 180;

/** Hours since the scenario's start-of-day in local time, continuous across midnight. */
function localHoursAbs(env: Environment, t: number, duration: number): number {
  const keys = env.hourKeys;
  if (keys && keys.length >= 2) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, h1] = keys[i];
      const [t0, h0] = keys[i - 1];
      if (t <= t1) return h0 + (h1 - h0) * ((t - t0) / Math.max(0.001, t1 - t0));
    }
    return keys[keys.length - 1][1];
  }
  let end = env.endHour;
  if (end < env.startHour) end += 24;
  return env.startHour + (end - env.startHour) * Math.min(1, Math.max(0, t / Math.max(1, duration)));
}

/** UTC instant for timeline time t (milliseconds since epoch). */
export function utcInstant(env: Environment, t: number, duration: number): number {
  const date = env.date ?? '2024-03-20';
  const [y, m, d] = date.split('-').map(Number);
  const midnightUtc = Date.UTC(y, (m || 1) - 1, d || 1);
  const utcHours = localHoursAbs(env, t, duration) - (env.utcOffset ?? 0);
  return midnightUtc + utcHours * 3600_000;
}

/** Subsolar point [lng, lat] in degrees at a UTC instant (low-precision solar model). */
export function subsolarPoint(ms: number): [number, number] {
  const days = ms / 86400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * days) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * days; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * days) * RAD; // obliquity
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  // equation of time (minutes) from mean vs apparent right ascension
  let eqt = (q * RAD - ra) / RAD;
  eqt = ((eqt % 360) + 540) % 360 - 180;
  const utcH = ((ms / 3600_000) % 24 + 24) % 24;
  const lng = -15 * (utcH - 12) - eqt;
  return [((lng + 540) % 360) - 180, decl / RAD];
}

/** Sun elevation in degrees at [lng, lat] for a UTC instant. */
export function sunElevation(ms: number, [lng, lat]: [number, number]): number {
  const [sLng, sLat] = subsolarPoint(ms);
  const phi = lat * RAD;
  const dec = sLat * RAD;
  const h = (lng - sLng) * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / RAD;
}

/**
 * Polygon of the region where the sun is below `elevationDeg`
 * (0 = sunset line, -6 civil, -12 nautical twilight), clipped to mercator latitudes.
 */
export function nightPolygon(ms: number, elevationDeg: number): [number, number][] {
  const [sLng, sLat] = subsolarPoint(ms);
  const dec = sLat * RAD;
  const c = Math.sin(elevationDeg * RAD);
  const MAX = 85;
  const line: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const h = (lng - sLng) * RAD;
    const a = Math.sin(dec);
    const b = Math.cos(dec) * Math.cos(h);
    const r = Math.hypot(a, b);
    const alpha = Math.atan2(b, a);
    const k = Math.max(-1, Math.min(1, c / r));
    // solve a*sin(phi) + b*cos(phi) = c for phi within [-90, 90]
    let phi = Math.asin(k) - alpha;
    if (phi > Math.PI / 2 || phi < -Math.PI / 2) phi = Math.PI - Math.asin(k) - alpha;
    phi = ((phi + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    line.push([lng, Math.max(-MAX, Math.min(MAX, phi / RAD))]);
  }
  // the dark pole is the one facing away from the sun
  const darkPole = sLat >= 0 ? -MAX : MAX;
  return [...line, [180, darkPole], [-180, darkPole], line[0]];
}

/**
 * Lighting from sun elevation (degrees): `dark` 0 (day) .. 1 (night) and
 * `warm` 0..1 golden-hour tint near the horizon.
 */
export function lightingFromSun(elevationDeg: number): { dark: number; warm: number } {
  const dark = 1 - smooth(-12, 2, elevationDeg);
  const warm = Math.max(0, 1 - Math.abs(elevationDeg - 3) / 9);
  return { dark, warm: warm * 0.8 };
}

/** Map-space wind vector (mercator x east, y south) scaled so ~15 km/h ≈ 1. */
export function windVector(env: Environment | undefined): { x: number; y: number } {
  if (!env) return { x: 1, y: -0.35 };
  const b = (env.windDirDeg * Math.PI) / 180;
  const k = Math.min(3, Math.max(0.15, env.windKph / 15));
  return { x: Math.sin(b) * k, y: -Math.cos(b) * k };
}
