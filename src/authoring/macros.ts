import type { LngLat } from '../geo';
import { MOVE_PROFILE, metersBetween } from '../realism';
import { destination } from './frame';
import { offsetExpr } from './time';
import type {
  AuthoredArrow,
  AuthoredStrike,
  AuthoredUnit,
  ColumnMacro,
  FormationMacro,
  Macro,
  PointRef,
  StrikePackageMacro,
  UnitTemplate,
  VolleyMacro,
} from './types';

/**
 * Macros: the structures authors write again and again — a column on a road,
 * a line of battle, a shooter working through a target list, volleys of
 * arrows — expanded into ordinary units, routes and strikes.
 *
 * Every macro produces plain objects with literal coordinates, so what an
 * author gets back is editable by hand afterwards. Ids are derived from the
 * macro id (`m_column` becomes `m_column_1`, `m_column_route`), which keeps
 * references stable when a count changes.
 */

/** What a point reference resolved to, and whether it was a unit. */
export interface ResolvedPoint {
  point: LngLat;
  unitId?: string;
}

/** Resolves a point reference, or returns null when its anchor is not placed yet. */
export type PointResolver = (ref: PointRef) => ResolvedPoint | null;

export interface MacroOutput {
  units: AuthoredUnit[];
  arrows: AuthoredArrow[];
  strikes: AuthoredStrike[];
}

export type MacroResult =
  | { ok: true; out: MacroOutput }
  | { ok: false; pending: string }
  | { ok: false; error: string };

const empty = (): MacroOutput => ({ units: [], arrows: [], strikes: [] });

/** How long a route should take on screen: real march speed, compressed about twentyfold. */
function routeSeconds(points: LngLat[], type: UnitTemplate['type']): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += metersBetween(points[i - 1], points[i]);
  const kph = MOVE_PROFILE[type].kph * 20;
  const seconds = (m / 1000 / kph) * 3600;
  return Math.max(5, Math.min(40, Math.round(seconds * 10) / 10));
}

function unitFrom(template: UnitTemplate, id: string, factionId: string, point: LngLat, extra: Partial<AuthoredUnit>): AuthoredUnit {
  return {
    id,
    factionId: template.factionId ?? factionId,
    type: template.type,
    name: template.name,
    lat: Number(point[1].toFixed(6)),
    lng: Number(point[0].toFixed(6)),
    ...(template.icon ? { icon: template.icon } : {}),
    ...(template.rosterId ? { rosterId: template.rosterId } : {}),
    ...(template.rangeKm ? { rangeKm: template.rangeKm } : {}),
    ...(template.sensorKm ? { sensorKm: template.sensorKm } : {}),
    ...(template.airDefenseKm ? { airDefenseKm: template.airDefenseKm } : {}),
    ...extra,
  };
}

function expandColumn(m: ColumnMacro, resolve: PointResolver): MacroResult {
  if (!m.via || m.via.length < 2) return { ok: false, error: `macro "${m.id}" needs at least two points in "via"` };
  const points: LngLat[] = [];
  for (const ref of m.via) {
    const r = resolve(ref);
    if (!r) return { ok: false, pending: typeof ref === 'string' ? ref : JSON.stringify(ref) };
    points.push(r.point);
  }
  const out = empty();
  const routeId = `${m.id}_route`;
  const start = m.startAt ?? 0;
  out.arrows.push({
    id: routeId,
    factionId: m.factionId,
    name: m.name ?? m.unit.name,
    points: points.map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))] as [number, number]),
    appearAt: start,
    duration: m.duration ?? routeSeconds(points, m.unit.type),
    ...(m.followRoads !== undefined ? { followRoads: m.followRoads } : {}),
    ...(m.hideLine ? { hideLine: true } : {}),
  });
  const count = Math.max(1, Math.round(m.count));
  for (let i = 0; i < count; i++) {
    out.units.push(
      unitFrom(m.unit, `${m.id}_${i + 1}`, m.factionId, points[0], {
        name: count > 1 ? `${m.unit.name} ${i + 1}` : m.unit.name,
        arrowId: routeId,
        appearAt: offsetExpr(start, i * (m.spacingSeconds ?? 0)),
      }),
    );
  }
  return { ok: true, out };
}

/** Offsets in metres (across the frontage, back from it) for each shape. */
function formationOffsets(shape: FormationMacro['shape'], count: number, frontageM: number): [number, number][] {
  const out: [number, number][] = [];
  const spread = (i: number, n: number) => (n === 1 ? 0 : (i / (n - 1) - 0.5) * frontageM);
  switch (shape ?? 'line') {
    case 'column': {
      const gap = frontageM / Math.max(1, count);
      for (let i = 0; i < count; i++) out.push([0, -i * gap]);
      break;
    }
    case 'wedge': {
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const rank = Math.floor(i / 2);
        out.push([(side * rank * frontageM) / Math.max(2, count), (-rank * frontageM) / Math.max(2, count)]);
      }
      break;
    }
    case 'block':
    case 'shieldwall': {
      const perRank = Math.ceil(Math.sqrt(count) * (shape === 'shieldwall' ? 1.6 : 1));
      const depth = Math.ceil(count / perRank);
      for (let i = 0; i < count; i++) {
        const col = i % perRank;
        const row = Math.floor(i / perRank);
        out.push([spread(col, perRank), (-row * frontageM) / Math.max(2, perRank * 2) - (depth > 1 ? 0 : 0)]);
      }
      break;
    }
    default:
      for (let i = 0; i < count; i++) out.push([spread(i, count), 0]);
  }
  return out;
}

function expandFormation(m: FormationMacro, resolve: PointResolver): MacroResult {
  const center = resolve(m.center);
  if (!center) return { ok: false, pending: typeof m.center === 'string' ? m.center : JSON.stringify(m.center) };
  const count = Math.max(1, Math.round(m.count));
  const facing = m.facingDeg ?? 0;
  const frontage = m.frontageM ?? 400;
  const out = empty();
  formationOffsets(m.shape, count, frontage).forEach(([across, back], i) => {
    // across the front is 90 degrees off the facing; back is behind it
    const p1 = destination(center.point, facing + 90, across / 1000);
    const p2 = destination(p1, facing + 180, -back / 1000);
    out.units.push(
      unitFrom(m.unit, `${m.id}_${i + 1}`, m.factionId, p2, {
        name: count > 1 ? `${m.unit.name} ${i + 1}` : m.unit.name,
        heading: facing,
        appearAt: m.appearAt ?? 0,
      }),
    );
  });
  return { ok: true, out };
}

/** Blast scale that suits a weapon, so authors rarely have to pick one. */
export function defaultStrikeSize(weapon: string): number {
  if (/nuclear|thermobaric/i.test(weapon)) return 3;
  if (/jdam|gbu|bomb|cruise|tomahawk|kalibr/i.test(weapon)) return 1.3;
  if (/himars|gmlrs|atacms|grad|rocket/i.test(weapon)) return 1.1;
  if (/howitzer|artillery|barrage|shell|155|122|mortar|cannonade/i.test(weapon)) return 0.8;
  if (/hellfire|javelin|tow|kornet|atgm|missile/i.test(weapon)) return 0.7;
  if (/arrow|longbow|volley|javelin|musket|melee|charge/i.test(weapon)) return 0.4;
  return 0.8;
}

function expandStrikePackage(m: StrikePackageMacro, resolve: PointResolver): MacroResult {
  if (!m.targets?.length) return { ok: false, error: `macro "${m.id}" needs at least one target` };
  const out = empty();
  const interval = m.intervalSeconds ?? 2;
  for (let i = 0; i < m.targets.length; i++) {
    const t = resolve(m.targets[i]);
    if (!t) return { ok: false, pending: typeof m.targets[i] === 'string' ? String(m.targets[i]) : JSON.stringify(m.targets[i]) };
    out.strikes.push({
      id: `${m.id}_${i + 1}`,
      name: m.weapon,
      fromUnitId: m.from,
      lat: Number(t.point[1].toFixed(6)),
      lng: Number(t.point[0].toFixed(6)),
      size: m.size ?? defaultStrikeSize(m.weapon),
      appearAt: offsetExpr(m.at, i * interval),
      ...(t.unitId ? { targetUnitId: t.unitId } : {}),
      ...(m.salvo ? { salvo: m.salvo } : {}),
      ...(m.pattern ? { pattern: m.pattern } : {}),
    });
  }
  return { ok: true, out };
}

function expandVolley(m: VolleyMacro, resolve: PointResolver): MacroResult {
  const t = resolve(m.target);
  if (!t) return { ok: false, pending: typeof m.target === 'string' ? m.target : JSON.stringify(m.target) };
  const out = empty();
  const count = Math.max(1, Math.round(m.count ?? 3));
  const interval = m.intervalSeconds ?? 3;
  const name = m.name ?? 'Arrow volley';
  for (let i = 0; i < count; i++) {
    out.strikes.push({
      id: `${m.id}_${i + 1}`,
      name,
      fromUnitId: m.from,
      lat: Number(t.point[1].toFixed(6)),
      lng: Number(t.point[0].toFixed(6)),
      size: defaultStrikeSize(name),
      appearAt: offsetExpr(m.at, i * interval),
      salvo: Math.max(1, Math.round(m.rounds ?? 12)),
      spreadM: m.spreadM ?? 60,
      ...(t.unitId ? { targetUnitId: t.unitId } : {}),
    });
  }
  return { ok: true, out };
}

export function expandMacro(m: Macro, resolve: PointResolver): MacroResult {
  switch (m.macro) {
    case 'column':
      return expandColumn(m, resolve);
    case 'formation':
      return expandFormation(m, resolve);
    case 'strike-package':
      return expandStrikePackage(m, resolve);
    case 'volley':
      return expandVolley(m, resolve);
    default:
      return { ok: false, error: `unknown macro "${(m as { macro: string }).macro}"` };
  }
}
