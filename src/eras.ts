import type { SilhouetteKey } from './silhouettes';
import type { Period } from './types';

/**
 * Periods split the authoring content — icons, unit packs, macros, guidance
 * and examples — into sets that belong together. An author picks one period
 * and only ever sees material that fits it: no Hellfires in a medieval
 * scenario, no shield walls in a modern one.
 *
 * `era` on a Scenario stays the *visual* treatment (two looks: modern map or
 * aged parchment). `period` is the finer authoring-side choice and implies an
 * era unless the document sets one explicitly.
 */
export type { Period };

export interface PeriodDef {
  id: Period;
  label: string;
  /** Rough span, for menus and prompts */
  years: string;
  /** Visual treatment this period implies when the document sets no `era` */
  era: 'modern' | 'historical';
  summary: string;
  /** Content packs published under public/packs/ for this period */
  packs: string[];
  /** Period-specific authoring rules, pasted into prompts and the guide */
  guidance: string[];
}

export const PERIODS: Record<Period, PeriodDef> = {
  ancient: {
    id: 'ancient',
    label: 'Ancient',
    years: 'to about 500 AD',
    era: 'historical',
    summary: 'Massed foot and horse, chariots, oared ships.',
    packs: ['ancient/formations'],
    guidance: [
      'Name formations, not head counts: "Hoplite phalanx", "Skirmishers", "Companion cavalry".',
      'Weapons are melee, javelin, sling and bow. Name strikes "Melee", "Cavalry charge", "Javelin volley" or "Arrow volley".',
      'There is no road network: routes cross open ground and follow the terrain.',
    ],
  },
  medieval: {
    id: 'medieval',
    label: 'Medieval',
    years: 'about 500 to 1500',
    era: 'historical',
    summary: 'Men-at-arms, longbows, knights, castles and siege engines.',
    packs: ['medieval/formations'],
    guidance: [
      'Name formations clearly: "Longbowmen", "Dismounted men-at-arms", "Mounted knights", "Royal standard", "Baggage train".',
      'Name strikes "Longbow volley" for arrows and "Melee" or "Cavalry charge" for close combat.',
      'Ground is the story: mud, woods and a narrow frontage decide these battles. Say so in the captions.',
    ],
  },
  gunpowder: {
    id: 'gunpowder',
    label: 'Gunpowder',
    years: 'about 1500 to 1800',
    era: 'historical',
    summary: 'Pike and shot, musket lines, field cannon, sailing warships.',
    packs: ['gunpowder/formations'],
    guidance: [
      'Formations are battalions and squadrons: "Line infantry", "Pike block", "Grenadiers", "Horse".',
      'Name strikes "Musket volley", "Cannonade" or "Broadside". Ranges are short: a few hundred metres for muskets.',
      'Powder smoke hangs over the field; a little haze suits these scenes.',
    ],
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    years: 'about 1800 to 1913',
    era: 'historical',
    summary: 'Rifled muskets, massed artillery, railways, ironclads.',
    packs: ['industrial/formations'],
    guidance: [
      'Formations are regiments and batteries: "Rifle regiment", "Field battery", "Cavalry squadron".',
      'Name strikes "Rifle volley", "Artillery barrage" or "Naval gunfire".',
      'Railways and the telegraph shape the approach march; the present-day road network does not, so keep routes off modern highways.',
    ],
  },
  ww1: {
    id: 'ww1',
    label: 'First World War',
    years: '1914 to 1918',
    era: 'modern',
    summary: 'Trench lines, barrages, early tanks and aircraft.',
    packs: ['ww1/western-front'],
    guidance: [
      'Front lines are territories, not units: draw trench systems as territories and the attack as arrows across no man’s land.',
      'Name strikes "Creeping barrage", "Counter-battery fire" or "Machine gun fire". A barrage is a salvo, not a single blast.',
      'Aircraft are scouts and observers; do not give them guided weapons.',
    ],
  },
  ww2: {
    id: 'ww2',
    label: 'Second World War',
    years: '1939 to 1945',
    era: 'modern',
    summary: 'Combined arms, armoured thrusts, amphibious landings, strategic bombing.',
    packs: ['ww2/combined-arms'],
    guidance: [
      'Use period icons: halftrack, propfighter, propbomber, higgins, uboat. No jets, drones, helicopters or satellites.',
      'Name strikes "Bomb run", "Artillery barrage", "Naval gunfire" or "Strafing run"; bomb sticks and strafing runs use pattern "line".',
      'Radio exists; datalink and precision guidance do not. Keep effects to radio calls.',
    ],
  },
  coldwar: {
    id: 'coldwar',
    label: 'Cold War',
    years: '1946 to 1991',
    era: 'modern',
    summary: 'Jets, helicopters, missile air defence, mechanised corps.',
    packs: ['coldwar/mech-forces'],
    guidance: [
      'Guided weapons exist but are few; most fires are guns, rockets and unguided bombs.',
      'Air defence is a real constraint: give launcher units airDefenseKm and route aircraft around it.',
      'No armed drones and no live satellite imagery feeds; reconnaissance is film and photo passes.',
    ],
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    years: '1991 onwards',
    era: 'modern',
    summary: 'Precision fires, drones, networked sensors, satellites.',
    packs: ['modern/nato', 'modern/opfor'],
    guidance: [
      'Precision weapons need explicit launchAt and targetUnitId so the flight time reads correctly.',
      'Show sensing as well as shooting: sensorKm, airDefenseKm, datalink effects and an imaging satellite pass.',
      'Do not invent jamming, casualty figures or sensor footage that sources do not support.',
    ],
  },
};

export const PERIOD_IDS = Object.keys(PERIODS) as Period[];

export const isPeriod = (v: unknown): v is Period => typeof v === 'string' && v in PERIODS;

/** The period a scenario is authored in: explicit, else inferred from its visual era. */
export function periodOf(s: { period?: Period; era?: 'modern' | 'historical' }): Period {
  if (s.period && isPeriod(s.period)) return s.period;
  return s.era === 'historical' ? 'medieval' : 'modern';
}

/** Visual treatment a period implies when the document sets no `era`. */
export const eraForPeriod = (p: Period): 'modern' | 'historical' => PERIODS[p].era;

/**
 * Which periods each icon belongs to. Typed over every library key, so a new
 * icon cannot be added without placing it in time.
 */
export const ICON_PERIODS: Record<SilhouetteKey, Period[]> = {
  soldier: ['ww1', 'ww2', 'coldwar', 'modern'],
  troops: ['industrial', 'ww1', 'ww2', 'coldwar', 'modern'],
  officer: ['industrial', 'ww1', 'ww2', 'coldwar', 'modern'],
  medic: ['ww1', 'ww2', 'coldwar', 'modern'],
  sniper: ['ww1', 'ww2', 'coldwar', 'modern'],
  civilians: PERIOD_IDS,
  dog: ['ww1', 'ww2', 'coldwar', 'modern'],

  // the shape is a later tank, but it is the closest match for 1916-18 armour
  tank: ['ww1', 'ww2', 'coldwar', 'modern'],
  abrams: ['coldwar', 'modern'],
  bradley: ['coldwar', 'modern'],
  halftrack: ['ww2'],
  ifv: ['coldwar', 'modern'],
  apc: ['coldwar', 'modern'],
  jeep: ['ww2', 'coldwar', 'modern'],
  truck: ['ww1', 'ww2', 'coldwar', 'modern'],
  motorcycle: ['ww1', 'ww2', 'coldwar', 'modern'],
  ambulance: ['ww1', 'ww2', 'coldwar', 'modern'],
  tanker: ['ww2', 'coldwar', 'modern'],
  engineer: ['ww2', 'coldwar', 'modern'],
  howitzer: ['ww1', 'ww2', 'coldwar', 'modern'],
  spg: ['ww2', 'coldwar', 'modern'],
  mortar: ['ww1', 'ww2', 'coldwar', 'modern'],
  launcher: ['ww2', 'coldwar', 'modern'],
  sam: ['coldwar', 'modern'],
  aagun: ['ww1', 'ww2', 'coldwar', 'modern'],
  radar: ['ww2', 'coldwar', 'modern'],

  jet: ['coldwar', 'modern'],
  f15: ['coldwar', 'modern'],
  f22: ['modern'],
  bomber: ['coldwar', 'modern'],
  propfighter: ['ww1', 'ww2'],
  propbomber: ['ww1', 'ww2'],
  proptransport: ['ww2'],
  flyingwing: ['modern'],
  transport: ['coldwar', 'modern'],
  gunship: ['coldwar', 'modern'],
  airliner: ['coldwar', 'modern'],
  heli: ['coldwar', 'modern'],
  mi8: ['coldwar', 'modern'],
  attackheli: ['coldwar', 'modern'],
  drone: ['modern'],
  cruisemissile: ['coldwar', 'modern'],
  satellite: ['coldwar', 'modern'],

  ship: ['industrial', 'ww1', 'ww2', 'coldwar', 'modern'],
  carrier: ['ww2', 'coldwar', 'modern'],
  submarine: ['coldwar', 'modern'],
  uboat: ['ww1', 'ww2'],
  patrolboat: ['ww2', 'coldwar', 'modern'],
  landingcraft: ['ww2', 'coldwar', 'modern'],
  higgins: ['ww2'],
  lcac: ['coldwar', 'modern'],
  cargoship: ['industrial', 'ww1', 'ww2', 'coldwar', 'modern'],

  hq: PERIOD_IDS,
  bunker: ['ww1', 'ww2', 'coldwar', 'modern'],
  checkpoint: ['industrial', 'ww1', 'ww2', 'coldwar', 'modern'],
  camp: PERIOD_IDS,
  fort: ['ancient', 'medieval', 'gunpowder', 'industrial'],

  menatarms: ['ancient', 'medieval'],
  spearmen: ['ancient', 'medieval'],
  pikemen: ['medieval', 'gunpowder'],
  archers: ['ancient', 'medieval'],
  musketeers: ['gunpowder', 'industrial'],
  cavalry: ['ancient', 'medieval', 'gunpowder', 'industrial'],
  chariot: ['ancient'],
  cannon: ['gunpowder', 'industrial'],
  siege: ['ancient', 'medieval', 'gunpowder'],
  banner: ['ancient', 'medieval', 'gunpowder'],
  baggage: ['ancient', 'medieval', 'gunpowder', 'industrial'],
  sailingship: ['medieval', 'gunpowder', 'industrial'],
  galley: ['ancient', 'medieval'],
};

/** Icons that belong to a period. */
export function iconsForPeriod(p: Period): SilhouetteKey[] {
  return (Object.keys(ICON_PERIODS) as SilhouetteKey[]).filter((k) => ICON_PERIODS[k].includes(p));
}

/** True when an icon is out of place in a period (reported as a warning, never an error). */
export function iconOutOfPeriod(icon: SilhouetteKey, p: Period): boolean {
  return !ICON_PERIODS[icon].includes(p);
}
