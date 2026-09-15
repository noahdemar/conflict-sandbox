import { elevationAt, onElevationLoaded } from './elevation';
import { pointAlongPath, type LngLat } from './geo';
import { MAX_SALVO_ROUNDS, expandStrikes, weaponKind, type WeaponKind } from './particles';
import type { Scenario, Strike, Unit, UnitType } from './types';

/**
 * Physical plausibility helpers: how fast things move, how long munitions
 * fly, how far weapons reach. The timeline is compressed (a two-minute film
 * can cover a night), so these shape motion and timing rather than impose
 * real-world clock time; `realismWarnings` flags what is implausible even
 * allowing for that.
 */

export const metersBetween = (a: LngLat, b: LngLat) => {
  const cosLat = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320 * cosLat, (a[1] - b[1]) * 111320);
};

/** Typical road-march speed (km/h) and whether hills slow the unit noticeably. */
export const MOVE_PROFILE: Record<UnitType, { kph: number; slopeSensitive: boolean; accelS: number }> = {
  infantry: { kph: 5, slopeSensitive: true, accelS: 0.6 },
  armor: { kph: 45, slopeSensitive: true, accelS: 2.2 },
  artillery: { kph: 40, slopeSensitive: true, accelS: 2.5 },
  missile: { kph: 50, slopeSensitive: true, accelS: 2.5 },
  hq: { kph: 55, slopeSensitive: true, accelS: 2 },
  naval: { kph: 45, slopeSensitive: false, accelS: 4 },
  air: { kph: 800, slopeSensitive: false, accelS: 4 },
};

/** Cumulative "effort" along a path: meters weighted by uphill grade, so climbs take longer. */
function effortProfile(path: LngLat[], slopeSensitive: boolean): { dist: number[]; effort: number[] } {
  const dist = [0];
  const effort = [0];
  let prevElev = slopeSensitive ? elevationAt(path[0]) : undefined;
  for (let i = 1; i < path.length; i++) {
    const d = metersBetween(path[i - 1], path[i]);
    let w = 1;
    if (slopeSensitive) {
      const e = elevationAt(path[i]);
      if (e !== undefined && prevElev !== undefined && d > 1) {
        const grade = (e - prevElev) / d;
        // climbing slows sharply, gentle descents are slightly faster, steep ones slow again
        w = grade > 0 ? 1 + grade * 9 : 1 - Math.min(0.15, -grade * 2) + Math.max(0, -grade - 0.15) * 4;
      }
      prevElev = e ?? prevElev;
    }
    dist.push(dist[i - 1] + d);
    effort.push(effort[i - 1] + d * Math.max(0.5, Math.min(4, w)));
  }
  return { dist, effort };
}

const profiles = new WeakMap<LngLat[], { dist: number[]; effort: number[]; sensitive: boolean; gen: number }>();
/** Bumped as elevation tiles arrive so profiles built on missing terrain are rebuilt. */
let elevationGen = 0;
let genTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== 'undefined') {
  onElevationLoaded(() => {
    // tiles land in bursts; rebuild once they settle
    if (genTimer) clearTimeout(genTimer);
    genTimer = setTimeout(() => elevationGen++, 400);
  });
}

/**
 * Progress (0..1 of path distance) of a ground/naval unit `e` seconds into a
 * move lasting `D` seconds: pulls away and brakes smoothly, and spends more
 * of its time on uphill stretches.
 */
export function groundProgress(path: LngLat[], type: UnitType, e: number, D: number): number {
  if (e <= 0) return 0;
  if (e >= D || D <= 0 || path.length < 2) return 1;
  const prof = MOVE_PROFILE[type];
  let p = profiles.get(path);
  if (!p || p.sensitive !== prof.slopeSensitive || (prof.slopeSensitive && p.gen !== elevationGen)) {
    p = { ...effortProfile(path, prof.slopeSensitive), sensitive: prof.slopeSensitive, gen: elevationGen };
    profiles.set(path, p);
  }
  // trapezoidal velocity in "effort" space
  const ta = Math.min(prof.accelS, D * 0.25);
  const cruise = D - 2 * ta;
  const areaTotal = cruise + ta; // two ramps of ta/2 each
  let area: number;
  if (e < ta) area = (e * e) / (2 * ta);
  else if (e < ta + cruise) area = ta / 2 + (e - ta);
  else {
    const x = D - e;
    area = areaTotal - (x * x) / (2 * ta);
  }
  const totalEffort = p.effort[p.effort.length - 1];
  const totalDist = p.dist[p.dist.length - 1];
  if (totalEffort <= 0) return Math.min(1, area / areaTotal);
  const target = (area / areaTotal) * totalEffort;
  // invert effort → distance
  let lo = 0;
  let hi = p.effort.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.effort[mid] < target) lo = mid;
    else hi = mid;
  }
  const seg = p.effort[hi] - p.effort[lo];
  const f = seg > 0 ? (target - p.effort[lo]) / seg : 0;
  return (p.dist[lo] + (p.dist[hi] - p.dist[lo]) * f) / totalDist;
}

/** Timeline seconds a munition of this kind spends in the air over `meters` (compressed but distance-scaled). */
export function flightSeconds(kind: WeaponKind, meters: number, interceptor = false): number {
  const km = meters / 1000;
  const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
  if (interceptor) return clamp(0.8, 4, 0.8 + km * 0.12);
  switch (kind) {
    case 'melee':
      return 0.3;
    case 'arrow':
      // a longbow arrow takes a few seconds to fly a couple of hundred meters
      return clamp(0.8, 3.2, 0.8 + km * 6);
    case 'gun':
      return clamp(0.15, 0.9, 0.15 + km * 0.25);
    case 'shell':
      return clamp(1.2, 8, 1 + km * 0.2);
    case 'bomb':
      return clamp(2.5, 7, 2.5 + km * 0.3);
    default:
      return clamp(1, 10, 1 + km * 0.09);
  }
}

/** Where a unit roughly is for timing purposes: route end if it moves, else its placement. */
function roughPosition(s: Scenario, u: Unit, at?: number): LngLat {
  const a = u.arrowId ? s.arrows.find((x) => x.id === u.arrowId) : undefined;
  if (!a?.points.length) return [u.lng, u.lat];
  if (at === undefined) return a.points[a.points.length - 1];
  const t = Math.min(at, u.destroyedAt ?? Infinity);
  if (a.times && a.times.length === a.points.length && a.points.length >= 2) {
    let i = 0;
    while (i < a.times.length - 2 && t >= a.times[i + 1]) i++;
    const duration = a.times[i + 1] - a.times[i];
    const f = duration > 0 ? Math.max(0, Math.min(1, (t - a.times[i]) / duration)) : 1;
    const from = a.points[i];
    const to = a.points[i + 1];
    return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
  }
  const path = a.route ?? a.points;
  return pointAlongPath(path, a.duration > 0 ? Math.max(0, Math.min(1, (t - a.appearAt) / a.duration)) : 1).point;
}

/** Launch time of a strike: explicit `launchAt`, else derived from weapon type and firing distance. */
export function strikeLaunchAt(s: Scenario, x: Strike): number {
  if (x.launchAt !== undefined) return x.launchAt;
  const from = x.fromUnitId ? s.units.find((u) => u.id === x.fromUnitId) : undefined;
  if (!from) return x.appearAt - 3;
  const kind = weaponKind(x.name);
  const d = metersBetween(roughPosition(s, from), [x.lng, x.lat]);
  return Math.max(0, x.appearAt - flightSeconds(kind, d, !!x.targetStrikeId));
}

/** Approximate maximum reach (km) of common weapons, matched by name. */
const WEAPON_RANGES: [RegExp, number, string][] = [
  [/longbow|\bbow\b|archer|arrow volley/i, 0.3, 'longbow'],
  [/crossbow/i, 0.3, 'crossbow'],
  [/gmlrs|himars|m270|mlrs/i, 85, 'GMLRS'],
  [/atacms|prsm/i, 500, 'ATACMS'],
  [/tomahawk|kalibr|cruise/i, 2500, 'cruise missile'],
  [/grad|bm-21/i, 21, 'BM-21 Grad'],
  [/d-30|122\s?mm/i, 15.4, '122mm D-30'],
  [/m777|155\s?mm|paladin|m109/i, 30, '155mm howitzer'],
  [/105\s?mm/i, 12, '105mm gun'],
  [/mortar|81\s?mm|82\s?mm|120\s?mm/i, 7, 'mortar'],
  [/hellfire|agm-114/i, 11, 'Hellfire'],
  [/javelin/i, 4, 'Javelin'],
  [/tow\b|kornet/i, 5, 'ATGM'],
  [/jdam|gbu-3[1-8]/i, 28, 'JDAM (high-altitude release)'],
  [/gbu-39|sdb/i, 110, 'Small Diameter Bomb'],
  [/mk\s?8\d|bomb string|dumb bomb/i, 12, 'unguided bomb'],
  [/30\s?mm|chain ?gun/i, 4, '30mm cannon'],
  [/25\s?mm|20\s?mm|23\s?mm|zu-23/i, 2.5, 'autocannon'],
  [/rifle|carbine|small arms|machine ?gun|m4\b|ak-?47/i, 0.8, 'small arms'],
  [/stinger|manpads|igla/i, 5, 'MANPADS'],
  [/patriot|pac-3/i, 70, 'Patriot'],
  [/iron dome|tamir/i, 70, 'Iron Dome'],
  [/s-300|s-400/i, 250, 'S-300/400'],
];

export function weaponRangeKm(name: string): { km: number; label: string } | null {
  for (const [re, km, label] of WEAPON_RANGES) if (re.test(name)) return { km, label };
  return null;
}

/**
 * Plausibility problems worth fixing: weapons fired beyond their reach,
 * ground units moving faster than their vehicles could even on a compressed
 * timeline, munitions that arrive implausibly fast, and events out of order.
 */
export function scenarioErrors(s: Scenario, duration = s.duration): string[] {
  const errors: string[] = [];
  const lists = { factions: s.factions, units: s.units, arrows: s.arrows, strikes: s.strikes, keyframes: s.keyframes,
    labels: s.labels, territories: s.territories, effects: s.effects ?? [] };
  for (const [name, items] of Object.entries(lists)) {
    const ids = new Set<string>();
    items.forEach((item, i) => {
      if (ids.has(item.id)) errors.push(`/${name}/${i}/id duplicates "${item.id}"`);
      ids.add(item.id);
    });
  }
  const ref = (path: string, id: string | undefined, items: { id: string }[]) => {
    if (id !== undefined && !items.some((x) => x.id === id)) errors.push(`${path} references missing id "${id}"`);
  };
  const time = (path: string, t: number | undefined) => {
    if (t !== undefined && (!Number.isFinite(t) || t < 0 || (duration !== undefined && t > duration + 0.001)))
      errors.push(`${path} must be within the timeline`);
  };
  s.units.forEach((u, i) => {
    ref(`/units/${i}/factionId`, u.factionId, s.factions);
    ref(`/units/${i}/arrowId`, u.arrowId, s.arrows);
    for (const key of ['appearAt', 'destroyedAt', 'leavesAt', 'captureAt'] as const) time(`/units/${i}/${key}`, u[key]);
    if ((u.destroyedAt ?? Infinity) < u.appearAt || (u.leavesAt ?? Infinity) < u.appearAt)
      errors.push(`/units/${i} leaves or is destroyed before appearing`);
  });
  s.arrows.forEach((a, i) => {
    ref(`/arrows/${i}/factionId`, a.factionId, s.factions);
    time(`/arrows/${i}/appearAt`, a.appearAt);
    time(`/arrows/${i}/end`, a.appearAt + a.duration);
    if (a.duration <= 0 || a.points.length < 2) errors.push(`/arrows/${i} needs two points and a positive duration`);
    if (a.times) {
      if (a.times.length !== a.points.length || a.times.some((t, j) => j > 0 && t <= a.times![j - 1]))
        errors.push(`/arrows/${i}/times must match points and increase strictly (repeat positions, not times, for a hover)`);
      a.times.forEach((t, j) => time(`/arrows/${i}/times/${j}`, t));
    }
  });
  s.strikes.forEach((x, i) => {
    ref(`/strikes/${i}/fromUnitId`, x.fromUnitId, s.units);
    ref(`/strikes/${i}/targetUnitId`, x.targetUnitId, s.units);
    ref(`/strikes/${i}/targetStrikeId`, x.targetStrikeId, s.strikes);
    time(`/strikes/${i}/appearAt`, x.appearAt);
    time(`/strikes/${i}/launchAt`, x.launchAt);
    if (x.size <= 0) errors.push(`/strikes/${i}/size must be positive`);
    if (x.salvo !== undefined && (!Number.isInteger(x.salvo) || x.salvo < 1 || x.salvo > MAX_SALVO_ROUNDS))
      errors.push(`/strikes/${i}/salvo must be an integer from 1 to ${MAX_SALVO_ROUNDS}`);
    if (x.spreadM !== undefined && x.spreadM < 0) errors.push(`/strikes/${i}/spreadM must not be negative`);
    if (x.launchAt !== undefined && x.launchAt >= x.appearAt) errors.push(`/strikes/${i}/launchAt must precede impact`);
    if (x.targetStrikeId === x.id) errors.push(`/strikes/${i}/targetStrikeId cannot reference itself`);
  });
  s.keyframes.forEach((k, i) => {
    time(`/keyframes/${i}/time`, k.time);
    ref(`/keyframes/${i}/followUnitId`, k.followUnitId, s.units);
    k.highlightUnitIds?.forEach((id, j) => ref(`/keyframes/${i}/highlightUnitIds/${j}`, id, s.units));
    k.overlayFactionIds?.forEach((id, j) => ref(`/keyframes/${i}/overlayFactionIds/${j}`, id, s.factions));
  });
  s.effects?.forEach((e, i) => {
    ref(`/effects/${i}/unitId`, e.unitId, s.units);
    ref(`/effects/${i}/targetUnitId`, e.targetUnitId, s.units);
    time(`/effects/${i}/start`, e.start);
    time(`/effects/${i}/end`, e.start + e.duration);
  });
  s.territories.forEach((x, i) => {
    ref(`/territories/${i}/factionId`, x.factionId, s.factions);
    time(`/territories/${i}/appearAt`, x.appearAt);
  });
  s.labels.forEach((x, i) => time(`/labels/${i}/appearAt`, x.appearAt));
  s.article?.forEach((b, i) => {
    if (b.kind !== 'scene') return;
    ref(`/article/${i}/from`, b.from, s.keyframes);
    ref(`/article/${i}/to`, b.to, s.keyframes);
    const from = s.keyframes.find((k) => k.id === b.from);
    const to = s.keyframes.find((k) => k.id === (b.to ?? b.from));
    if (from && to && to.time < from.time) errors.push(`/article/${i}/to must not precede from`);
  });
  return errors;
}

export function realismWarnings(s: Scenario): string[] {
  const out: string[] = [];
  // compressed timelines are expected; only flag moves beyond ~200x real speed
  const MAX_COMPRESSION = 200;
  for (const u of s.units) {
    const a = u.arrowId ? s.arrows.find((x) => x.id === u.arrowId) : undefined;
    if (!a || u.type === 'air' || a.points.length < 2) continue;
    let m = 0;
    for (let i = 1; i < a.points.length; i++) m += metersBetween(a.points[i - 1], a.points[i]);
    const secs = a.times?.length ? a.times[a.times.length - 1] - a.times[0] : a.duration;
    if (secs <= 0) continue;
    const kph = (m / 1000) / (secs / 3600);
    const limit = MOVE_PROFILE[u.type].kph * MAX_COMPRESSION;
    if (kph > limit) {
      out.push(
        `Unit "${u.name}" covers ${(m / 1000).toFixed(1)} km in ${secs}s (${Math.round(kph / MOVE_PROFILE[u.type].kph)}x real ${u.type} speed); lengthen route "${a.name || a.id}" duration.`,
      );
    }
  }
  for (const x of expandStrikes(s.strikes)) {
    const from = x.fromUnitId ? s.units.find((u) => u.id === x.fromUnitId) : undefined;
    if (!from || x.targetStrikeId) continue;
    const kind = weaponKind(x.name);
    const r = kind === 'melee' ? null : weaponRangeKm(x.name);
    const launch = strikeLaunchAt(s, x);
    const target = x.targetUnitId ? s.units.find((u) => u.id === x.targetUnitId) : undefined;
    const impact: LngLat = target ? roughPosition(s, target, x.appearAt) : [x.lng, x.lat];
    const d = metersBetween(roughPosition(s, from, launch), impact) / 1000;
    if (!x.id.includes('#') && r && d > r.km * 1.15 && from.type !== 'air') {
      out.push(`Strike "${x.name}" (${x.id}) hits ${d.toFixed(1)} km from "${from.name}", beyond ${r.label} range of about ${r.km} km.`);
    }
    if (!x.id.includes('#') && kind !== 'gun' && x.appearAt - launch < flightSeconds(kind, d * 1000) * 0.35) {
      out.push(`Strike "${x.name}" (${x.id}) flies ${d.toFixed(1)} km in ${(x.appearAt - launch).toFixed(1)}s; give it more flight time.`);
    }
    if (launch < from.appearAt) out.push(`Strike ${x.id} launches before its shooter "${from.name}" appears.`);
    if (from.leavesAt !== undefined && launch >= from.leavesAt) out.push(`Strike ${x.id} launches after its shooter leaves the scene.`);
    if (from.destroyedAt !== undefined && launch > from.destroyedAt) {
      out.push(`Strike ${x.id} is fired after its shooter "${from.name}" is destroyed.`);
    }
    if (s.duration !== undefined && x.appearAt > s.duration) out.push(`Strike ${x.id} lands after the timeline ends.`);
  }
  return out;
}
