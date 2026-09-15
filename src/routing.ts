import { useStore } from './store';
import { pathLength, roundCorners, smoothPath, type LngLat } from './geo';
import type { Arrow, Scenario } from './types';

/**
 * Road routing for ground movement. Arrows that carry a ground unit are
 * snapped to the street network (OSRM driving profile) by default; the
 * routed polyline is cached on the arrow so playback and export never
 * need the network.
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** A leg whose road route is longer than this multiple of the straight line goes off-road. */
const MAX_DETOUR = 2.5;

const GROUND = new Set(['infantry', 'armor', 'artillery', 'missile', 'hq']);

/** Path units actually travel along: the road route when present, else the smoothed arrow. */
export function arrowPath(a: Arrow): LngLat[] {
  if (a.route && a.route.length >= 2) {
    let rounded = rounding.get(a.route);
    if (!rounded) {
      rounded = roundCorners(a.route);
      rounding.set(a.route, rounded);
    }
    return rounded;
  }
  return smoothPath(a.points);
}

/** Corner-rounded routes, cached per route array (routes are immutable once stored). */
const rounding = new WeakMap<LngLat[], LngLat[]>();

export const routeKey = (points: LngLat[]) =>
  points.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(';');

/** Arrow carries at least one ground unit and hasn't opted out of roads. */
export function wantsRoads(s: Scenario, a: Arrow): boolean {
  if (a.followRoads === false) return false;
  // modern road networks didn't exist; historical movement goes cross-country
  if (s.era === 'historical') return false;
  return s.units.some((u) => u.arrowId === a.id && GROUND.has(u.type));
}

/** Road route for one leg, or null if there is no reasonable road connection. */
async function fetchLeg(a: LngLat, b: LngLat): Promise<LngLat[] | null> {
  const res = await fetch(`${OSRM}/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`routing ${res.status}`);
  const json = (await res.json()) as {
    code: string;
    routes?: { geometry: { coordinates: LngLat[] } }[];
  };
  const line = json.routes?.[0]?.geometry.coordinates;
  if (json.code !== 'Ok' || !line || line.length < 2) return null;
  // start/end exactly on the drawn points, not the nearest road node
  const leg: LngLat[] = [a, ...line, b];
  if (pathLength(leg) > pathLength([a, b]) * MAX_DETOUR) return null;
  return leg;
}

const legCache = new Map<string, LngLat[] | null>();

/**
 * Route leg by leg: each leg follows roads where a sensible road connection
 * exists and goes cross-country (straight) where it doesn't.
 * Returns null when no leg could be routed.
 */
async function fetchRoute(points: LngLat[]): Promise<LngLat[] | null> {
  const out: LngLat[] = [];
  let anyRoad = false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const key = routeKey([a, b]);
    let leg = legCache.get(key);
    if (leg === undefined) {
      leg = await fetchLeg(a, b);
      legCache.set(key, leg);
      await new Promise((r) => setTimeout(r, 1100)); // public server rate limit
    }
    if (leg) anyRoad = true;
    const seg = leg ?? [a, b];
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return anyRoad ? out : null;
}

const failed = new Set<string>();
let running = false;

/** Route every arrow that needs it, one at a time. */
async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const s = useStore.getState().scenario;
      const next = s.arrows.find((a) => {
        const key = routeKey(a.points);
        if (!wantsRoads(s, a)) return !!a.route; // clear stale routes
        return a.routeKey !== key && !failed.has(key);
      });
      if (!next) break;
      const key = routeKey(next.points);
      if (!wantsRoads(s, next)) {
        useStore.getState().updateArrow(next.id, { route: undefined, routeKey: undefined });
        continue;
      }
      let route: LngLat[] | null = null;
      try {
        route = await fetchRoute(next.points);
      } catch {
        route = null;
      }
      // arrow may have been edited or deleted while the request was in flight
      const cur = useStore.getState().scenario.arrows.find((a) => a.id === next.id);
      if (!cur || routeKey(cur.points) !== key) continue;
      if (route) {
        useStore.getState().updateArrow(next.id, { route, routeKey: key });
      } else {
        failed.add(key);
        if (cur.route) useStore.getState().updateArrow(next.id, { route: undefined, routeKey: undefined });
      }
    }
  } finally {
    running = false;
  }
}

/** Start watching the scenario and keep ground routes up to date. Returns an unsubscribe. */
export function startRouting(): () => void {
  let last: Scenario | null = null;
  const check = () => {
    const s = useStore.getState().scenario;
    if (s === last) return;
    last = s;
    void pump();
  };
  check();
  return useStore.subscribe(check);
}
