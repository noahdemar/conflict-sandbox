import type { FacilityKind } from './facilities';

export type Tool =
  | 'select'
  | 'unit'
  | 'arrow'
  | 'territory'
  | 'strike'
  | 'label'
  | 'erase';

export type UnitType =
  | 'infantry'
  | 'armor'
  | 'artillery'
  | 'air'
  | 'naval'
  | 'missile'
  | 'hq';

export type ObjectKind =
  | 'unit'
  | 'arrow'
  | 'territory'
  | 'strike'
  | 'label'
  | 'keyframe';

export interface Selection {
  kind: ObjectKind;
  id: string;
}

export type Affiliation = 'friend' | 'hostile' | 'neutral' | 'unknown';

export interface Faction {
  id: string;
  name: string;
  color: string;
  /** Symbol frame shape; inferred from faction order/name when unset */
  affiliation?: Affiliation;
}

export interface Unit {
  id: string;
  factionId: string;
  type: UnitType;
  name: string;
  lat: number;
  lng: number;
  /** Arrow id this unit advances along during playback */
  arrowId?: string;
  /** Roster entry this unit was placed from (enables custom 3D assets) */
  rosterId?: string;
  /** Facing direction in degrees when not following an arrow */
  heading?: number;
  /** Weapon/sensor range ring in km; 0/undefined = none */
  rangeKm?: number;
  /** Seconds on the timeline when the unit appears */
  appearAt: number;
  /** Seconds on the timeline when the unit is destroyed (becomes a burning wreck) */
  destroyedAt?: number;
  /** Observation/sensor range in km: draws a terrain-aware line-of-sight area */
  sensorKm?: number;
  /** Air-defense engagement range in km: draws an envelope that reacts to enemy aircraft */
  airDefenseKm?: number;
  /** Aircraft sets down at the end of its route instead of loitering */
  landAtEnd?: boolean;
  /** Seconds on the timeline when the unit leaves the scene (e.g. boards an aircraft) */
  leavesAt?: number;
  /** Orbital/very-high altitude in km: rendered in 3D space above its ground track */
  altitudeKm?: number;
}

export interface Strike {
  id: string;
  lat: number;
  lng: number;
  name: string;
  /** Explosion visual scale multiplier */
  size: number;
  appearAt: number;
  /** Unit the missile launches from; ballistic arc is rendered in flight */
  fromUnitId?: string;
  /** Launch time (s); defaults to appearAt - 3 */
  launchAt?: number;
  /** Target strike id for interceptor strikes */
  targetStrikeId?: string;
  /** Unit being hit: impact follows that unit's position at detonation time */
  targetUnitId?: string;
  /** Number of rounds in a salvo (gunship/artillery); impacts scatter around the aim point */
  salvo?: number;
  /** Salvo scatter radius in meters (default 120) */
  spreadM?: number;
}

export interface Arrow {
  id: string;
  factionId: string;
  /** [lng, lat] control points */
  points: [number, number][];
  name: string;
  appearAt: number;
  /** Seconds the arrow takes to fully draw */
  duration: number;
  /** Snap ground units on this arrow to real roads (default true) */
  followRoads?: boolean;
  /** Movement path only: don't draw the arrow on the map */
  hideLine?: boolean;
  /** Absolute time (s) for each control point: move between them, holding when two are equal in place */
  times?: number[];
  /** Cached road route [lng, lat] through the control points */
  route?: [number, number][];
  /** Control-point signature the cached route was computed for */
  routeKey?: string;
}

export interface Territory {
  id: string;
  factionId: string;
  /** [lng, lat] ring */
  points: [number, number][];
  name: string;
  appearAt: number;
  /** Seconds the fill takes to fade in */
  duration: number;
  /** Large watermark text drawn across the territory (e.g. "SDF") */
  label?: string;
  /** Watermark position [lng, lat]; defaults to the polygon centroid */
  labelAt?: [number, number];
  /** Watermark rotation in degrees */
  labelRotate?: number;
}

export interface MapLabel {
  id: string;
  text: string;
  lat: number;
  lng: number;
  size: number;
  color: string;
  appearAt: number;
  /** ISO 3166 country code: render a flag sticker instead of plain text */
  flag?: string;
  /** Render as a facility marker (icon sticker + caption) */
  facility?: FacilityKind;
}

export interface RosterEntry {
  id: string;
  name: string;
  type: UnitType;
  /** Faction name to auto-assign on placement (optional) */
  faction?: string;
  /** URL of a .glb/.gltf model to render instead of the built-in symbol */
  modelUrl?: string;
  /** Extra yaw (degrees) to correct model forward axis */
  modelYaw?: number;
  /** Default range ring (km) applied to placed units */
  rangeKm?: number;
  /** Card image shown above the unit icon (e.g. from Wikipedia) */
  imageUrl?: string;
  /** Wikipedia article title the image came from */
  wikiTitle?: string;
}

export interface Keyframe {
  id: string;
  /** Seconds on the timeline */
  time: number;
  lng: number;
  lat: number;
  zoom: number;
  /** Camera tilt in degrees (0 = top-down) */
  pitch: number;
  /** Camera rotation in degrees */
  bearing: number;
  /** Slide-style caption shown while this keyframe is active */
  caption: string;
  /** Camera tracks this unit while the keyframe is active */
  followUnitId?: string;
  /** 'track' keeps unit centered; 'chase' also turns camera to unit heading */
  followMode?: 'track' | 'chase';
  /** Camera orbit speed in deg/s while this keyframe is active */
  orbitSpeed?: number;
  /** Sensor view applied while this keyframe is active */
  sensor?: SensorView;
}

export type SensorView = 'normal' | 'nvg' | 'thermal';

export type StatusKind =
  | 'radio'
  | 'datalink'
  | 'jamming'
  | 'panic'
  | 'wounded'
  | 'noammo';

/** A timed status/activity shown on a unit (radio call, jamming, panic…). */
export interface StatusEffect {
  id: string;
  kind: StatusKind;
  unitId: string;
  /** Other end of a datalink */
  targetUnitId?: string;
  /** Seconds on the timeline when the effect starts */
  start: number;
  /** Seconds it lasts */
  duration: number;
  /** Jamming radius in meters */
  radiusM?: number;
  /** Custom badge text (defaults per kind) */
  label?: string;
}

/** Lighting and weather over the scenario timeline. */
export interface Environment {
  /** Local hour (0-24) at timeline start */
  startHour: number;
  /** Local hour at timeline end; may be less than start to cross midnight */
  endHour: number;
  /** Calendar date at timeline start (YYYY-MM-DD) for sun position */
  date?: string;
  /** Local time zone offset from UTC in hours (e.g. 5 for Pakistan) */
  utcOffset?: number;
  /** Direction the wind blows toward, compass degrees */
  windDirDeg: number;
  windKph: number;
  /** Dust/haze density 0..1 */
  haze: number;
}

export interface Scenario {
  name: string;
  factions: Faction[];
  units: Unit[];
  arrows: Arrow[];
  territories: Territory[];
  labels: MapLabel[];
  strikes: Strike[];
  keyframes: Keyframe[];
  /** Unit status effects; optional for older scenarios */
  effects?: StatusEffect[];
  /** Lighting & weather; optional (defaults to midday, calm, clear) */
  environment?: Environment;
  /** Timeline length in seconds (defaults to 60) */
  duration?: number;
}
