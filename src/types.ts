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
  /**
   * Icon from the shared library (see the catalog in llms.txt), e.g. "tank",
   * "archers", "carrier". Unknown names fall back to a generic icon for the
   * unit type and are reported when the scenario is imported.
   */
  icon?: string;
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
  /** Orbital payload role: wide relay coverage or a narrow imaging footprint */
  orbitRole?: 'relay' | 'imaging';
  /** Timeline time an imaging satellite captures its target */
  captureAt?: number;
}

export interface Strike {
  id: string;
  lat: number;
  lng: number;
  name: string;
  /** Explosion visual scale multiplier */
  size: number;
  impactStyle?: 'blast' | 'fireball';
  appearAt: number;
  /** Unit the missile launches from; ballistic arc is rendered in flight */
  fromUnitId?: string;
  /** Launch time (s); defaults to a flight time derived from weapon type and distance */
  launchAt?: number;
  /** Target strike id for interceptor strikes */
  targetStrikeId?: string;
  /** Unit being hit: impact follows that unit's position at detonation time */
  targetUnitId?: string;
  /** Number of rounds in a salvo (gunship/artillery); impacts scatter around the aim point */
  salvo?: number;
  /** Salvo scatter radius in meters (default 120; half-length when pattern is "line") */
  spreadM?: number;
  /** Salvo spread shape. "disc" scatters rounds around the aim point (artillery
   *  sheaf — the default for ground weapons). "line" walks them along the
   *  attack axis from the firing unit toward the aim point: strafing runs,
   *  bomb sticks and rocket ripples. Needs fromUnitId. Air-launched gun, bomb
   *  and missile salvos use "line" automatically unless set to "disc". */
  pattern?: 'disc' | 'line';
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
  /** Timeline time after which the arrow is no longer drawn */
  hideAt?: number;
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
  /** Icon from the shared library used by units placed from this entry */
  icon?: string;
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
  /** Units emphasized on the map and in the caption while this keyframe is active */
  highlightUnitIds?: string[];
  /** Camera tracks this unit while the keyframe is active */
  followUnitId?: string;
  /** 'track' keeps unit centered; 'chase' also turns camera to unit heading */
  followMode?: 'track' | 'chase';
  /** Camera orbit speed in deg/s while this keyframe is active */
  orbitSpeed?: number;
  /** Speak this caption aloud (default true); false shows it as text only */
  narrate?: boolean;
  /** Sensor view applied while this keyframe is active */
  sensor?: SensorView;
  /** While this keyframe is active, show the 3D aerial scene from this camera shot instead of the map */
  aerial?: AerialShot;
  /** On-screen graphic flashed up while this keyframe is active */
  overlay?: ShotOverlay;
  /** Factions included when the order-of-battle overlay is active */
  overlayFactionIds?: string[];
  /** Full-screen image card shown while this keyframe is active */
  media?: {
    src: string;
    caption?: string;
    credit?: string;
    /** Place the image beside this map point instead of at the screen edge */
    anchor?: [number, number];
    /** Half-width of the site at the anchor in meters, so the image clears it */
    anchorRadiusM?: number;
  };
}

export type SensorView = 'normal' | 'nvg' | 'thermal';

/** On-screen graphics a keyframe can flash up over the map. */
export type ShotOverlay = 'orbat';

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
  /**
   * Optional piecewise clock: [timeline seconds, local hours since start day]
   * pairs (hours may exceed 24), e.g. to cut from night to the next morning.
   * Overrides the linear start→end mapping.
   */
  hourKeys?: [number, number][];
  /** Direction the wind blows toward, compass degrees */
  windDirDeg: number;
  windKph: number;
  /** Dust/haze density 0..1 */
  haze: number;
  /** Cloud cover 0..1: flattens and greys the light, mutes golden hour */
  cloudCover?: number;
  /** Falling weather drawn over the scene */
  precipitation?: 'none' | 'rain' | 'snow' | 'dust';
  /** Precipitation strength 0..1 (default 0.5) */
  precipIntensity?: number;
}

/**
 * One block of the article presentation. A scene embeds the map and plays the
 * timeline from keyframe `from` up to the keyframe that follows `to` (or the
 * end), holding on its last frame.
 */
export type ArticleBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'scene'; from: string; to?: string; caption?: string }
  | { kind: 'image'; src: string; caption?: string; credit?: string }
  /**
   * Image callout floated beside the prose. `image` is a URL; or give
   * `wikiTitle` to use that Wikipedia article's lead image, credited with a link.
   */
  | { kind: 'callout'; title: string; text: string; image?: string; wikiTitle?: string; credit?: string; side?: 'left' | 'right' };

/** Visual treatment of the 3D aerial scene. */
export type AerialStyle = 'cinematic' | 'briefing';

/** Built-in procedural airframes (no model files). */
export type Airframe = 'f4' | 'mig17' | 'jet';

/** One aircraft in the aerial scene. */
export interface AerialAircraft {
  id: string;
  name: string;
  factionId: string;
  airframe: Airframe;
  /**
   * Flight path as [flight seconds, meters east, meters north, meters altitude]
   * relative to the scene origin. Points are smoothed; bank and pitch come from
   * the curvature, so sample every second or two through maneuvers.
   */
  track: [number, number, number, number][];
  /** Flight time the aircraft is shot down: it falls trailing smoke from here */
  destroyedAt?: number;
}

/** Guns burst or missile shot between aircraft. Times are flight seconds. */
export interface AerialWeapon {
  id: string;
  kind: 'guns' | 'missile';
  from: string;
  target: string;
  /** Fire time (flight seconds) */
  time: number;
  /** Seconds the burst lasts, or the missile flies (default 1.2 guns, 3 missile) */
  duration?: number;
  /** Missile hits its target at the end of its flight (default true) */
  hit?: boolean;
  label?: string;
}

/** One line of an aircraft comparison: a value for each aircraft and optional bar sizes. */
export interface AerialCompareRow {
  label: string;
  /** Text for [left, right] */
  values: [string, string];
  /** Numbers for [left, right] to draw proportional bars (same unit on both sides) */
  bars?: [number, number];
}

/** Camera for a keyframe in the aerial scene. */
export interface AerialShot {
  /**
   * chase: behind the target; side: beside it; flyby: fixed point it passes;
   * overview: orbit above the fight; compare: the target and secondary aircraft
   * side by side on turntables with a stats panel (pair it with a hold)
   */
  mode: 'chase' | 'side' | 'flyby' | 'overview' | 'compare';
  /** Aircraft the camera follows or frames */
  target: string;
  /** Second aircraft kept in frame (overview) */
  secondary?: string;
  /** Camera distance in meters (defaults per mode) */
  distanceM?: number;
  /** Degrees per second the overview orbits */
  orbitDegPerS?: number;
  /** Stats panel for the compare shot: target on the left, secondary on the right */
  compare?: {
    rows: AerialCompareRow[];
    /** Small print under the panel, e.g. that figures are approximate */
    note?: string;
  };
}

/**
 * A 3D air-combat reconstruction, in a local frame anchored at `origin`.
 * Aircraft times are flight seconds; `holds` pause the aircraft (not the
 * camera) for explanation, so flight time falls behind timeline time.
 */
export interface AerialScene {
  /** [lng, lat] of the local origin */
  origin: [number, number];
  /** Default look; viewers can switch */
  style?: AerialStyle;
  aircraft: AerialAircraft[];
  weapons?: AerialWeapon[];
  /** Explanatory freezes: at timeline second `at`, aircraft hold for `seconds` */
  holds?: { at: number; seconds: number }[];
  /**
   * Ground: "real" builds the actual terrain around `origin` from elevation
   * data; the others are stylized textures on flat ground (default plain).
   */
  terrain?: 'real' | 'jungle' | 'desert' | 'sea' | 'plain';
  /**
   * Texture draped on real terrain: "basemap" is our map with every name,
   * road, border and building removed; "satellite" is cloud-free Sentinel-2
   * imagery (shows the present-day landscape). Default basemap.
   */
  terrainTexture?: 'basemap' | 'satellite';
  /** Half-width of the real-terrain square in km (default 30) */
  terrainRadiusKm?: number;
  /** Vertical exaggeration for real terrain (default 1) */
  terrainExaggeration?: number;
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
  /** Folder of pre-recorded caption narration (with manifest.json), relative to the site base */
  narrationPack?: string;
  /** Standfirst under the article headline, e.g. "Deir ez-Zor, Syria · 7–8 February 2018" */
  subtitle?: string;
  /** References listed at the end of the article, e.g. "US Department of Defense briefing, 13 February 2018" */
  sources?: string[];
  /**
   * Visual era. "historical" hides modern map features (roads, buildings,
   * borders, place labels), uses an aged parchment palette, and drops modern
   * interface elements; for events before the modern period.
   */
  era?: 'modern' | 'historical';
  /** 3D air-combat scene shown by keyframes that set `aerial` */
  aerial?: AerialScene;
  /** Article presentation: prose with embedded map scenes. Generated from captions when absent */
  article?: ArticleBlock[];
}
