import type { Period } from '../eras';
import type {
  Arrow,
  ArticleBlock,
  Faction,
  Keyframe,
  MapLabel,
  RosterEntry,
  Scenario,
  SensorView,
  ShotOverlay,
  StatusEffect,
  Strike,
  Territory,
  Unit,
  UnitType,
} from '../types';

/**
 * The authoring layer: everything an author may write that is *not* a literal
 * scenario. It is resolved into a plain Scenario (see resolve.ts) before the
 * app ever sees it, so the runtime types stay exact numbers and coordinates.
 *
 * Three kinds of sugar:
 *  - places: a point may be a named place or an offset from another object
 *  - times: a time may be an expression anchored to another event
 *  - structure: macros expand into many objects, beats compose the camera
 */

/**
 * A time in timeline seconds, or an expression anchored to something else:
 *   "start" | "end"          the timeline ends
 *   "u_heli"                 when that object starts (appearAt/time/start)
 *   "s_hit.end"              when it ends (impact, route end, effect end)
 *   "s_hit-4" | "k2+1.5"     any anchor, offset in seconds
 */
export type TimeExpr = number | string;

/** A point offset from something already placed: "1.2 km on bearing 210 from u_hq". */
export interface NearSpec {
  /** Unit id, label id, strike id, or a name from `places` */
  of: string;
  /** Compass bearing in degrees to travel from that anchor (0 = north) */
  bearingDeg?: number;
  /** Distance in kilometres (default 0.5) */
  km?: number;
}

/**
 * A point: a literal [lng, lat], a name from `places`, the id of something
 * already placed, or an offset from one of those.
 */
export type PointRef = string | [number, number] | NearSpec;

/** Anything that can be positioned symbolically instead of by lat/lng. */
export interface Placeable {
  /** Place name from `places`, or the id of another placed object */
  at?: string;
  /** Position relative to another object or place */
  near?: NearSpec;
}

export interface AuthoredUnit
  extends Omit<Unit, 'lat' | 'lng' | 'appearAt' | 'destroyedAt' | 'leavesAt' | 'captureAt'>,
    Placeable {
  lat?: number;
  lng?: number;
  appearAt?: TimeExpr;
  destroyedAt?: TimeExpr;
  leavesAt?: TimeExpr;
  captureAt?: TimeExpr;
}

export interface AuthoredArrow extends Omit<Arrow, 'points' | 'appearAt' | 'duration' | 'times'> {
  points?: [number, number][];
  /** Route written as places, ids or offsets instead of raw coordinates */
  via?: PointRef[];
  appearAt?: TimeExpr;
  duration?: number;
  times?: TimeExpr[];
}

export interface AuthoredStrike
  extends Omit<Strike, 'lat' | 'lng' | 'appearAt' | 'launchAt' | 'size'>,
    Placeable {
  lat?: number;
  lng?: number;
  /** Blast scale; defaults to a size that suits the weapon name */
  size?: number;
  appearAt?: TimeExpr;
  launchAt?: TimeExpr;
}

export interface AuthoredLabel extends Omit<MapLabel, 'lat' | 'lng' | 'appearAt' | 'size' | 'color'>, Placeable {
  lat?: number;
  lng?: number;
  size?: number;
  color?: string;
  appearAt?: TimeExpr;
}

export interface AuthoredTerritory extends Omit<Territory, 'points' | 'appearAt' | 'duration'> {
  points?: [number, number][];
  /** Ring written as places, ids or offsets */
  via?: PointRef[];
  appearAt?: TimeExpr;
  duration?: number;
}

export interface AuthoredEffect extends Omit<StatusEffect, 'start'> {
  start?: TimeExpr;
}

export interface AuthoredKeyframe extends Omit<Keyframe, 'time' | 'lng' | 'lat' | 'zoom' | 'pitch' | 'bearing'>, Placeable {
  time?: TimeExpr;
  lng?: number;
  lat?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
}

/** Which kind of shot the camera composer should build for a beat. */
export type ShotKind = 'establish' | 'approach' | 'action' | 'detail' | 'aftermath';

/**
 * One story beat. The author writes what happens and who matters; the camera
 * composer works out where to put the camera, how wide to frame it and how
 * long the shot needs to be for the caption to be read aloud.
 */
export interface Beat {
  id?: string;
  /** When it happens; omitted beats follow the previous one at reading pace */
  at?: TimeExpr;
  caption: string;
  /** Ids of units, strikes or labels the shot must frame */
  focus?: string[];
  shot?: ShotKind;
  /** Track this unit through the shot */
  follow?: string;
  /** Extra seconds to hold after the caption has been read */
  hold?: number;
  sensor?: SensorView;
  overlay?: ShotOverlay;
  overlayFactionIds?: string[];
  narrate?: boolean;
  media?: Keyframe['media'];
}

/** Fields shared by the units a macro stamps out. */
export interface UnitTemplate {
  name: string;
  type: UnitType;
  icon?: string;
  rosterId?: string;
  factionId?: string;
  rangeKm?: number;
  sensorKm?: number;
  airDefenseKm?: number;
}

/** A moving column: `count` units queued along one route, spaced in time. */
export interface ColumnMacro {
  macro: 'column';
  id: string;
  factionId: string;
  unit: UnitTemplate;
  count: number;
  /** The route, as places, ids, offsets or literal [lng, lat] */
  via: PointRef[];
  name?: string;
  /** Seconds between vehicles entering the route (default 2) */
  spacingSeconds?: number;
  startAt?: TimeExpr;
  /** Seconds the lead element takes to run the route */
  duration?: number;
  followRoads?: boolean;
  hideLine?: boolean;
}

/** A static formation: units laid out around a centre point. */
export interface FormationMacro {
  macro: 'formation';
  id: string;
  factionId: string;
  unit: UnitTemplate;
  count: number;
  center: PointRef;
  /** line and shieldwall spread across the frontage; wedge and column go back from it */
  shape?: 'line' | 'wedge' | 'block' | 'column' | 'shieldwall';
  /** Direction the formation faces, compass degrees (default 0) */
  facingDeg?: number;
  /** Width of the formation in metres (default 400) */
  frontageM?: number;
  appearAt?: TimeExpr;
}

/** One shooter engaging several targets in sequence. */
export interface StrikePackageMacro {
  macro: 'strike-package';
  id: string;
  /** Firing unit id */
  from: string;
  /** Unit ids, place names or points being hit, in order */
  targets: PointRef[];
  /** Weapon name, used for the strike name and its flight timing */
  weapon: string;
  /** Time of the first impact */
  at: TimeExpr;
  /** Seconds between impacts (default 2) */
  intervalSeconds?: number;
  salvo?: number;
  size?: number;
  pattern?: 'disc' | 'line';
}

/** Pre-modern massed ranged fire: repeated volleys onto one target area. */
export interface VolleyMacro {
  macro: 'volley';
  id: string;
  from: string;
  target: PointRef;
  /** Strike name (default "Arrow volley") */
  name?: string;
  at: TimeExpr;
  /** Number of volleys (default 3) */
  count?: number;
  /** Seconds between volleys (default 3) */
  intervalSeconds?: number;
  /** Rounds per volley (default 12) */
  rounds?: number;
  spreadM?: number;
}

export type Macro = ColumnMacro | FormationMacro | StrikePackageMacro | VolleyMacro;

/**
 * A reusable content pack: rosters, places, factions and macros for one
 * period, published under public/packs/ and pulled in with `include`.
 */
export interface ContentPack {
  id: string;
  name: string;
  period: Period;
  description?: string;
  roster?: RosterEntry[];
  places?: Record<string, [number, number]>;
  factions?: Faction[];
  /** Named macro presets an author can copy or reference by id */
  macros?: Macro[];
  notes?: string[];
}

export interface AuthoredScenario
  extends Omit<
    Scenario,
    'units' | 'arrows' | 'strikes' | 'labels' | 'territories' | 'keyframes' | 'effects' | 'factions'
  > {
  factions?: Faction[];
  units?: AuthoredUnit[];
  arrows?: AuthoredArrow[];
  strikes?: AuthoredStrike[];
  labels?: AuthoredLabel[];
  territories?: AuthoredTerritory[];
  effects?: AuthoredEffect[];
  /** "auto" composes the camera from `beats` (or from the events themselves) */
  keyframes?: AuthoredKeyframe[] | 'auto';
  /** Story beats the camera composer turns into shots */
  beats?: Beat[];
  /** Structures expanded into units, routes and strikes */
  macros?: Macro[];
  /** Named anchor points every `at`/`near`/`via` can refer to */
  places?: Record<string, [number, number]>;
  /** Historical period; selects content packs and implies `era` */
  period?: Period;
  article?: ArticleBlock[];
}

/**
 * The document an author (or an assistant) writes. Everything except
 * `scenario` is optional, and a plain exported scenario file is also a valid
 * authoring document — the sugar is additive.
 */
export interface AuthoringDocument {
  format: 'conflict-sandbox-scenario' | 'openbrief-authoring';
  version?: number;
  exportedAt?: string;
  duration?: number;
  roster?: RosterEntry[];
  /** Content packs to merge in: "modern/nato", or any URL */
  include?: string[];
  /** Named anchor points, shared by everything in the document */
  places?: Record<string, [number, number]>;
  scenario: AuthoredScenario;
}
