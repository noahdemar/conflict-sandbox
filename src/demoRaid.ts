import type { LngLat } from './geo';
import type { Arrow, Keyframe, MapLabel, RosterEntry, Scenario, StatusEffect, Strike, Territory, Unit } from './types';

/**
 * Demo: Operation Neptune Spear — the raid on the Abbottabad compound,
 * night of 1–2 May 2011. Built from the widely reported public account.
 * Units are limited to those in the Wikipedia article "Killing of Osama bin
 * Laden". Compound layout, routes and individual positions are approximate;
 * timings are compressed.
 */

const US = 'f_us';
const OCC = 'f_occupants';
const NC = 'f_noncombatants';

// compound reference point (widely published location)
const C: LngLat = [73.24238, 34.16925];
const COS = Math.cos((C[1] * Math.PI) / 180);
/** Local offset in meters (x east, y north) from the compound reference. */
const L = (x: number, y: number): LngLat => [
  +(C[0] + x / (111320 * COS)).toFixed(7),
  +(C[1] + y / 111320).toFixed(7),
];

const JALALABAD: LngLat = [70.4986, 34.3995];
const BORDER_WP: LngLat = [71.35, 34.2];
const HOLDING: LngLat = [72.33, 34.26]; // backup Chinooks, ~two-thirds of the way from Jalalabad (approx.)
const HELO1_LZ = L(14, -24); // animal pen / yard
const HELO2_LZ = L(62, 52); // outside the north-east wall
const CHINOOK_LZ = L(70, 64);

export const RAID_ROSTER: RosterEntry[] = [
  { id: 'r_operator', name: 'SEAL operator (DEVGRU Red Squadron)', type: 'infantry', faction: 'United States', wikiTitle: 'United States Naval Special Warfare Development Group' },
  { id: 'r_interpreter', name: 'Interpreter', type: 'infantry', faction: 'United States' },
  { id: 'r_k9', name: 'Cairo, military working dog (K9)', type: 'infantry', faction: 'United States', wikiTitle: 'Cairo (dog)' },
  { id: 'r_stealth_hawk', name: 'Ghosthawk (modified stealth helicopter, 160th SOAR)', type: 'air', faction: 'United States', wikiTitle: 'Stealth helicopter' },
  { id: 'r_mh47', name: 'Chinook (backup)', type: 'air', faction: 'United States', wikiTitle: 'Boeing CH-47 Chinook' },
  { id: 'r_mq9', name: 'MQ-9 Reaper', type: 'air', faction: 'United States', wikiTitle: 'General Atomics MQ-9 Reaper' },
  { id: 'r_satellite', name: 'Communications satellite (illustrative)', type: 'air', faction: 'United States' },
  { id: 'r_occupant', name: 'Compound occupant', type: 'infantry', faction: 'Compound occupants' },
  { id: 'r_noncombatants', name: 'Non-combatants (women and children)', type: 'infantry', faction: 'Non-combatants' },
];

// ---------------------------------------------------------------------------
// Individuals on the ground
// ---------------------------------------------------------------------------

interface Mover {
  id: string;
  name: string;
  roster: string;
  faction: string;
  appear: number;
  /** [time, x, y] waypoints in local meters; first entry is where they appear */
  path: [number, number, number][];
  destroyedAt?: number;
  leavesAt?: number;
}

const units: Unit[] = [];
const arrows: Arrow[] = [];

/**
 * A person moving through timed waypoints. Movement between waypoints is
 * modelled as one path per unit whose timing spans first→last move; the
 * waypoint spacing keeps speeds plausible.
 */
function person(m: Mover) {
  const [t0, x0, y0] = m.path[0];
  const u: Unit = {
    id: m.id,
    factionId: m.faction,
    type: 'infantry',
    name: m.name,
    rosterId: m.roster,
    lat: L(x0, y0)[1],
    lng: L(x0, y0)[0],
    appearAt: m.appear,
    heading: 0,
    ...(m.destroyedAt !== undefined ? { destroyedAt: m.destroyedAt } : {}),
    ...(m.leavesAt !== undefined ? { leavesAt: m.leavesAt } : {}),
  };
  if (m.path.length > 1) {
    const last = m.path[m.path.length - 1];
    arrows.push({
      id: `a_${m.id}`,
      factionId: m.faction,
      points: m.path.map(([, x, y]) => L(x, y)),
      name: `${m.name} movement`,
      appearAt: t0,
      duration: Math.max(0.5, last[0] - t0),
      followRoads: false,
      hideLine: true,
      times: m.path.map(([t]) => t),
    });
    u.arrowId = `a_${m.id}`;
  }
  units.push(u);
}

// Chalk 1 — hard-lands inside the compound yard; clears guest house and main house
const chalk1: [string, [number, number, number][]][] = [
  // guest-house team
  ['1-1', [[39, 14, -24], [41, 4, -28], [44, -22, -26], [47, -27, -24]]],
  ['1-2', [[39, 16, -26], [41, 6, -30], [44, -20, -29], [47, -24, -27]]],
  ['1-3', [[39, 12, -22], [41, 2, -26], [44, -18, -23], [47, -22, -21]]],
  ['1-4', [[39, 18, -22], [42, 8, -32], [45, -16, -32], [48, -20, -30]]],
  // main-house team: breach inner gate, ground floor, stairs, upper floors
  ['1-5', [[39, 13, -20], [44, 8, -8], [51, 6, -1], [56, 8, 6], [61, 12, 12], [66, 13, 17]]],
  ['1-6', [[39, 15, -21], [44, 10, -9], [51, 8, -2], [56, 10, 5], [61, 14, 11], [66.3, 15, 16]]],
  ['1-7', [[39, 17, -20], [44, 12, -8], [51, 10, -1], [56, 4, 8], [60, 2, 10]]],
  ['1-8', [[39, 11, -21], [44, 6, -9], [51, 4, -2], [56, 2, 6], [62, 0, 12]]],
  ['1-9', [[39, 19, -24], [45, 14, -10], [52, 12, -3], [57, 14, 4], [62, 16, 10]]],
  ['1-10', [[39, 10, -25], [45, 2, -12], [52, 0, -6]]],
  ['1-11', [[39, 20, -27], [46, 24, -14], [52, 22, -6]]],
  ['1-12', [[39, 9, -27], [46, -6, -16], [52, -10, -12]]],
];

// Chalk 2 — lands outside the north-east wall: perimeter, then reinforces the main house
const chalk2: [string, [number, number, number][]][] = [
  ['2-1', [[41, 60, 50], [46, 38, 38], [52, 22, 26], [58, 16, 20], [64, 14, 18]]],
  ['2-2', [[41, 62, 48], [46, 40, 36], [52, 24, 24], [58, 18, 18]]],
  ['2-3', [[41, 64, 50], [46, 42, 38], [52, 26, 26], [58, 20, 22]]],
  ['2-4', [[41, 58, 52], [46, 36, 40], [52, 20, 28]]],
  ['2-5', [[41, 60, 54], [48, 46, 30], [54, 36, 12]]],
  ['2-6', [[41, 64, 54], [48, 50, 26], [54, 42, -2]]],
  // perimeter / cordon on the street
  ['2-7', [[41, 66, 52], [47, 30, 62]]],
  ['2-8', [[41, 60, 56], [47, -20, 58]]],
  ['2-9', [[41, 62, 56], [47, 68, 10]]],
  ['2-10', [[41, 66, 48], [48, 58, -44]]],
];

// everyone boards the reserve Chinook or Helo 2 for extraction
const exfilAt = 97;
for (const [n, path] of chalk1) {
  const last = path[path.length - 1];
  const boardPath: [number, number, number][] = [...path, [88, last[1], last[2]], [95, 62, 58]];
  person({
    id: `op_${n}`,
    name: `Operator ${n}`,
    roster: 'r_operator',
    faction: US,
    appear: 39,
    path: boardPath,
    leavesAt: exfilAt,
  });
}
for (const [n, path] of chalk2) {
  const last = path[path.length - 1];
  person({
    id: `op_${n}`,
    name: `Operator ${n}`,
    roster: 'r_operator',
    faction: US,
    appear: 41,
    path: [...path, [89, last[1], last[2]], [95, 66, 60]],
    leavesAt: exfilAt,
  });
}
person({
  id: 'interpreter',
  name: 'Interpreter',
  roster: 'r_interpreter',
  faction: US,
  appear: 41,
  path: [[41, 63, 46], [48, 10, 66], [90, 10, 66], [95, 64, 58]],
  leavesAt: exfilAt,
});
person({
  id: 'k9',
  name: 'Cairo (K9) and handler',
  roster: 'r_k9',
  faction: US,
  appear: 41,
  path: [[41, 65, 46], [48, 16, 68], [90, 16, 68], [95, 66, 56]],
  leavesAt: exfilAt,
});

// occupants, per the public account
person({ id: 'occ_courier', leavesAt: 109, name: 'Abu Ahmed al-Kuwaiti', roster: 'r_occupant', faction: OCC, appear: 0, path: [[0, -31, -24]], destroyedAt: 46.6 });
person({ id: 'occ_ground', leavesAt: 109, name: 'Abrar al-Kuwaiti', roster: 'r_occupant', faction: OCC, appear: 0, path: [[0, 6, 6]], destroyedAt: 55.8 });
person({ id: 'occ_ground2', leavesAt: 109, name: 'Bushra', roster: 'r_occupant', faction: OCC, appear: 0, path: [[0, 9, 4]], destroyedAt: 56 });
person({ id: 'occ_stairs', leavesAt: 109, name: 'Khalid bin Laden', roster: 'r_occupant', faction: OCC, appear: 0, path: [[0, 12, 12]], destroyedAt: 60.5 });
person({ id: 'occ_hvt', leavesAt: 109, name: 'Osama bin Laden (unarmed)', roster: 'r_occupant', faction: OCC, appear: 0, path: [[0, 12, 18]], destroyedAt: 66.6 });
person({
  id: 'noncombatants',
  name: 'Women and children',
  leavesAt: 109,
  roster: 'r_noncombatants',
  faction: NC,
  appear: 0,
  path: [[0, 0, 14], [78, 0, 14], [84, -12, -8]],
});

// ---------------------------------------------------------------------------
// Aircraft and space
// ---------------------------------------------------------------------------

units.push(
  {
    id: 'helo1', factionId: US, type: 'air', name: 'Ghosthawk 1', rosterId: 'r_stealth_hawk',
    lat: JALALABAD[1], lng: JALALABAD[0], arrowId: 'a_helo1', appearAt: 8, landAtEnd: true, destroyedAt: 96, leavesAt: 109,
  },
  {
    id: 'helo2', factionId: US, type: 'air', name: 'Ghosthawk 2', rosterId: 'r_stealth_hawk',
    lat: JALALABAD[1], lng: JALALABAD[0], arrowId: 'a_helo2', appearAt: 8.6, landAtEnd: true, leavesAt: 98,
  },
  {
    id: 'helo2_exfil', factionId: US, type: 'air', name: 'Ghosthawk 2', rosterId: 'r_stealth_hawk',
    lat: HELO2_LZ[1], lng: HELO2_LZ[0], arrowId: 'a_helo2_exfil', appearAt: 98, landAtEnd: true,
  },
  {
    id: 'chinook_qrf', factionId: US, type: 'air', name: 'Chinook 1 (backup)', rosterId: 'r_mh47',
    lat: HOLDING[1], lng: HOLDING[0], arrowId: 'a_chinook_in', appearAt: 20, landAtEnd: true, leavesAt: 98,
  },
  {
    id: 'chinook_exfil', factionId: US, type: 'air', name: 'Chinook 1 (backup)', rosterId: 'r_mh47',
    lat: CHINOOK_LZ[1], lng: CHINOOK_LZ[0], arrowId: 'a_chinook_exfil', appearAt: 98, landAtEnd: true,
  },
  {
    // illustrative: a daylight imaging pass over the site hours after the raid
    id: 'imager', factionId: US, type: 'air', name: 'Imaging satellite (illustrative)', rosterId: 'r_satellite',
    lat: C[1], lng: C[0], arrowId: 'a_imager', appearAt: 111, leavesAt: 128, altitudeKm: 500,
    orbitRole: 'imaging', captureAt: 118.5,
  },
  {
    // illustrative: not in the Wikipedia account; shown to model relay from orbit
    id: 'satellite', factionId: US, type: 'air', name: 'Relay satellite (illustrative)', rosterId: 'r_satellite',
    lat: 26, lng: 66, arrowId: 'a_satellite', appearAt: 8, leavesAt: 34, altitudeKm: 520,
  },
  {
    id: 'mq9', factionId: US, type: 'air', name: 'MQ-9 Reaper', rosterId: 'r_mq9',
    lat: JALALABAD[1], lng: JALALABAD[0], arrowId: 'a_mq9', appearAt: 2,
  },
  {
    id: 'chinook_2', factionId: US, type: 'air', name: 'Chinook 2 (backup)', rosterId: 'r_mh47',
    lat: HOLDING[1], lng: HOLDING[0], arrowId: 'a_chinook2', appearAt: 20, landAtEnd: true, leavesAt: 99,
  },
  {
    id: 'chinook_2_exfil', factionId: US, type: 'air', name: 'Chinook 2 (backup)', rosterId: 'r_mh47',
    lat: HOLDING[1], lng: HOLDING[0], arrowId: 'a_chinook2_exfil', appearAt: 99, landAtEnd: true,
  },
);

arrows.push(
  {
    id: 'a_helo1', factionId: US, name: 'Ghosthawk 1 ingress', appearAt: 8, duration: 30.3, followRoads: false, hideAt: 109,
    // arrive over the yard, hover and drift in the downwash, then settle hard
    points: [JALALABAD, BORDER_WP, [72.6, 34.12], L(-70, -90), L(10, -16), L(17, -21), L(11, -23), HELO1_LZ],
    times: [8, 14, 27, 33, 35, 36.4, 37.6, 38.3],
  },
  { id: 'a_helo2', factionId: US, points: [JALALABAD, [71.36, 34.22], [72.62, 34.15], L(120, 110), HELO2_LZ], name: 'Ghosthawk 2 ingress', appearAt: 8.6, duration: 32, followRoads: false, hideAt: 109 },
  { id: 'a_helo2_exfil', factionId: US, points: [HELO2_LZ, L(-400, 600), [72.6, 34.2], BORDER_WP, JALALABAD], name: 'Exfil to Jalalabad', appearAt: 98, duration: 12, followRoads: false, hideAt: 109 },
  { id: 'a_chinook_in', factionId: US, points: [HOLDING, [72.8, 34.22], L(300, 400), CHINOOK_LZ], name: 'Backup Chinook called in', appearAt: 76, duration: 10, followRoads: false, hideAt: 109 },
  { id: 'a_chinook_exfil', factionId: US, points: [CHINOOK_LZ, L(600, 900), [72.9, 34.3], BORDER_WP, JALALABAD], name: 'Exfil to Jalalabad', appearAt: 98, duration: 12, followRoads: false, hideAt: 109 },
  { id: 'a_imager', factionId: US, points: [[66.5, 26.4], [C[0], C[1]], [79.8, 41.8]], times: [111, 118.5, 126], name: 'Imaging pass ground track (illustrative)', appearAt: 111, duration: 15, followRoads: false, hideLine: true },
  { id: 'a_satellite', factionId: US, points: [[64, 24.5], [73.2, 34.2], [83, 43]], times: [8, 21, 34], name: 'Satellite ground track (illustrative)', appearAt: 8, duration: 26, followRoads: false, hideLine: true },
  { id: 'a_mq9', factionId: US, points: [JALALABAD, [71.9, 34.3], L(0, 2500)], name: 'MQ-9 to station', appearAt: 2, duration: 22, followRoads: false, hideLine: true },
  { id: 'a_chinook2', factionId: US, points: [JALALABAD, [71.4, 34.3], HOLDING], name: 'Backup Chinooks to staging area', appearAt: 11, duration: 9, followRoads: false, hideAt: 109 },
  { id: 'a_chinook2_exfil', factionId: US, points: [HOLDING, BORDER_WP, JALALABAD], name: 'Return to Jalalabad', appearAt: 99, duration: 9, followRoads: false, hideLine: true },
);

// ---------------------------------------------------------------------------
// Fire, demolition and status
// ---------------------------------------------------------------------------

const shots = (
  id: string, from: string, target: string, at: number, name: string, rounds = 2,
): Strike => {
  const t = units.find((u) => u.id === target)!;
  return {
    id, name, fromUnitId: from, targetUnitId: target,
    lat: t.lat, lng: t.lng, size: 0.08, salvo: rounds, spreadM: 1.2,
    appearAt: at, launchAt: at - 0.15,
  };
};

const strikes: Strike[] = [
  // guest house: the courier fires through the door and is killed in the exchange
  shots('sh_courier_fire', 'occ_courier', 'op_1-1', 45.4, 'Rifle fire from guest house', 3),
  shots('sh_gh1', 'op_1-1', 'occ_courier', 46.2, 'Suppressed rifle fire', 3),
  shots('sh_gh2', 'op_1-2', 'occ_courier', 46.5, 'Suppressed rifle fire', 2),
  // main house, ground floor
  shots('sh_mh1', 'op_1-5', 'occ_ground', 55.4, 'Suppressed rifle fire', 3),
  shots('sh_mh2', 'op_1-6', 'occ_ground', 55.6, 'Suppressed rifle fire', 2),
  // stairwell
  shots('sh_st1', 'op_1-5', 'occ_stairs', 60.2, 'Suppressed rifle fire', 2),
  // third floor
  shots('sh_hvt1', 'op_1-5', 'occ_hvt', 66.2, 'Suppressed rifle fire', 2),
  shots('sh_hvt2', 'op_1-6', 'occ_hvt', 66.5, 'Suppressed rifle fire', 2),
  // damaged helicopter destroyed before departure
  {
    id: 'demo_helo1', name: 'Demolition charges', targetUnitId: 'helo1',
    lat: HELO1_LZ[1], lng: HELO1_LZ[0], size: 0.4, appearAt: 96,
  },
];

const effects: StatusEffect[] = [
  { id: 'fx_sat_helo1', kind: 'datalink', unitId: 'satellite', targetUnitId: 'helo1', start: 12, duration: 20, label: 'SATCOM' },
  { id: 'fx_sat_helo2', kind: 'datalink', unitId: 'satellite', targetUnitId: 'helo2', start: 12.6, duration: 19.4, label: 'SATCOM' },
  { id: 'fx_isr_feed', kind: 'datalink', unitId: 'mq9', targetUnitId: 'helo1', start: 26, duration: 12, label: 'LIVE VIDEO' },
  { id: 'fx_hard_landing', kind: 'wounded', unitId: 'helo1', start: 38.3, duration: 57.5, label: 'HARD LANDING' },
  { id: 'fx_breach_radio', kind: 'radio', unitId: 'op_1-5', start: 50, duration: 3, label: 'BREACHING' },
  { id: 'fx_geronimo', kind: 'radio', unitId: 'op_1-5', start: 67, duration: 5, label: 'GERONIMO — EKIA' },
  { id: 'fx_sse', kind: 'radio', unitId: 'op_1-9', start: 72, duration: 12, label: 'COLLECTING MATERIAL' },
  { id: 'fx_qrf_call', kind: 'radio', unitId: 'op_2-1', start: 74, duration: 4, label: 'REQUESTING BACKUP CHINOOK' },
];

// ---------------------------------------------------------------------------
// Structures (approximate layout) and places
// ---------------------------------------------------------------------------

const territories: Territory[] = [
  {
    id: 't_compound', factionId: NC, name: 'Compound outer wall (approx.)',
    points: [L(-48, -44), L(44, -44), L(50, 38), L(-8, 48), L(-48, 22)],
    appearAt: 0, duration: 2,
  },
  {
    id: 't_mainhouse', factionId: NC, name: 'Main house — 3 floors (approx.)',
    points: [L(-4, 0), L(22, 0), L(22, 22), L(-4, 22)],
    appearAt: 0, duration: 2,
  },
  {
    id: 't_guesthouse', factionId: NC, name: 'Guest house (approx.)',
    points: [L(-40, -32), L(-24, -32), L(-24, -18), L(-40, -18)],
    appearAt: 0, duration: 2,
  },
  {
    id: 't_innerwall', factionId: NC, name: 'Inner courtyard wall (approx.)',
    points: [L(-14, -12), L(34, -12), L(34, -10), L(-14, -10)],
    appearAt: 0, duration: 2,
  },
];

const labels: MapLabel[] = [
  { id: 'l_jbad', text: 'Jalalabad airfield', facility: 'airbase', lat: JALALABAD[1], lng: JALALABAD[0], size: 12, color: '#1c1f22', appearAt: 0 },
  { id: 'l_abbottabad', text: 'Abbottabad', facility: 'town', lat: 34.1495, lng: 73.1995, size: 12, color: '#1c1f22', appearAt: 0 },
  { id: 'l_holding', text: 'Backup Chinooks staging (approx.)', facility: 'base', lat: HOLDING[1], lng: HOLDING[0], size: 11, color: '#1c1f22', appearAt: 0 },
  { id: 'l_mainhouse', text: 'MAIN HOUSE', lat: L(9, 25)[1], lng: L(9, 25)[0], size: 10, color: '#1c1f22', appearAt: 0 },
  { id: 'l_guesthouse', text: 'GUEST HOUSE', lat: L(-32, -14)[1], lng: L(-32, -14)[0], size: 10, color: '#1c1f22', appearAt: 0 },
  { id: 'l_af', text: 'AFGHANISTAN', lat: 34.0, lng: 69.6, size: 13, color: '#4a4a4a', appearAt: 0 },
  { id: 'l_pk', text: 'PAKISTAN', lat: 33.4, lng: 72.6, size: 13, color: '#4a4a4a', appearAt: 0 },
];

// ---------------------------------------------------------------------------
// Camera, captions and sensor views
// ---------------------------------------------------------------------------

const cam = (
  id: string, time: number, at: LngLat, zoom: number, pitch: number, bearing: number, caption: string,
  extra: Partial<Keyframe> = {},
): Keyframe => ({ id, time, lng: at[0], lat: at[1], zoom, pitch, bearing, caption, ...extra });

const keyframes: Keyframe[] = [
  cam('k1', 0, [71.8, 34.1], 6.4, 0, 0, 'Night of 1–2 May 2011 — Jalalabad, Afghanistan to Abbottabad, Pakistan'),
  cam('k2', 7, [70.62, 34.38], 9.5, 45, 70, 'Two Ghosthawks — modified stealth helicopters — lift off from Jalalabad with about two dozen SEALs, an interpreter and a dog, Cairo', {
    followUnitId: 'helo1', followMode: 'track',
  }),
  cam('k2b', 13, [70.2, 29.4], 4.35, 62, 14, 'Illustrative: in low Earth orbit, a communications satellite relays radio traffic to the helicopters'),
  cam('k2c', 19, [71.4, 30.8], 4.6, 60, 22, 'Illustrative: in low Earth orbit, a communications satellite relays radio traffic to the helicopters'),
  cam('k3', 22, [71.9, 34.25], 7.4, 0, 0, 'Backup Chinooks carrying a quick-reaction force wait about two-thirds of the way to Abbottabad'),
  cam('k4', 26.5, [73.1, 34.2], 9.2, 40, -20, 'An MQ-9 Reaper circles above Abbottabad, streaming live video'),
  cam('k5', 31, C, 16.4, 55, 35, 'The flight from Jalalabad takes about 90 minutes', { sensor: 'nvg' }),
  cam('k6', 34, L(10, -12), 18.4, 55, 20, 'Ghosthawk 1 hovers over the high-walled yard, loses lift and hard-lands', { sensor: 'nvg' }),
  cam('k7', 43, L(-24, -22), 19.1, 50, -10, 'At the guest house, the courier Abu Ahmed al-Kuwaiti opens fire and is killed', { sensor: 'nvg' }),
  cam('k8', 49, L(10, 0), 18.9, 55, 25, 'Teams breach the inner gate while Chalk 2 sets a cordon on the street outside', { sensor: 'nvg' }),
  cam('k9', 54, L(8, 6), 19.4, 45, 0, 'Ground floor of the main house: Abrar al-Kuwaiti and his wife Bushra are killed', { sensor: 'thermal' }),
  cam('k10', 59, L(12, 12), 19.5, 45, 40, 'On the stairs, bin Laden\'s son Khalid is killed', { sensor: 'thermal' }),
  cam('k11', 65, L(12, 17), 19.5, 50, 60, 'Third floor: Osama bin Laden, unarmed, is killed — "Geronimo, EKIA" is relayed back', { sensor: 'thermal' }),
  cam('k12', 72, L(4, 8), 18.2, 40, 10, 'Operators collect computers, drives and documents; women and children are moved to safety in the yard'),
  cam('k13', 80, L(40, 30), 17.4, 50, -30, 'A backup Chinook is called in to replace the damaged Ghosthawk', { sensor: 'nvg' }),
  cam('k14', 92, HELO1_LZ, 17.8, 50, 15, 'Before leaving, the team destroys the damaged Ghosthawk to protect its technology', { sensor: 'nvg' }),
  cam('k14b', 101, HELO1_LZ, 17.6, 50, 18, 'Before leaving, the team destroys the damaged Ghosthawk to protect its technology', { sensor: 'nvg' }),
  cam('k15', 104, [72.2, 34.2], 7.2, 20, 0, 'Roughly 38 minutes on target. The force returns to Jalalabad with no American casualties'),
  cam('k16', 108, [71.9, 34.2], 6.2, 0, 0, 'Operation Neptune Spear'),
  cam('k17', 111, [72.4, 31.6], 4.5, 60, 20, 'Illustrative: later that morning, an imaging satellite passes over Abbottabad'),
  cam('k18', 116, C, 12.5, 40, 10, 'Illustrative: the satellite images the compound in daylight'),
  // top-down, north up, compound offset left so the image pane sits beside it
  cam('k19', 120, L(55, 0), 17.4, 0, 0, 'The compound after the raid, as later seen in satellite imagery', {
    media: {
      src: 'media/abbottabad-aftermath.jpg',
      caption: 'Aftermath imagery of the site',
      credit: 'Imagery © Google Earth / its data providers',
    },
  }),
];

export function raidScenario(): Scenario {
  // rebuild on every call so state never leaks between loads
  return structuredClone({
    name: 'Bin Laden raid — Abbottabad, 2 May 2011',
    factions: [
      { id: US, name: 'United States', color: '#3a6fc0', affiliation: 'friend' as const },
      { id: OCC, name: 'Compound occupants', color: '#b0413e', affiliation: 'hostile' as const },
      { id: NC, name: 'Non-combatants', color: '#8a8f94', affiliation: 'neutral' as const },
    ],
    units,
    arrows,
    territories,
    labels,
    strikes,
    keyframes,
    effects,
    environment: { startHour: 23, endHour: 2.6, date: '2011-05-01', utcOffset: 5, hourKeys: [[0, 23], [109, 26.6], [110.5, 33.2], [128, 34.4]], windDirDeg: 120, windKph: 6, haze: 0.1 },
  });
}
