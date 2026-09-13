import type { RosterEntry, Scenario, Strike, Unit } from './types';
import type { LngLat } from './geo';

/**
 * Demo scenario: Battle of Khasham, Syria — night of 7–8 Feb 2018.
 * A ~500-strong Wagner/SAA column with armor and artillery crossed the
 * Euphrates deconfliction line and advanced on the Conoco gas plant,
 * held by US special operators and SDF fighters. US air power and HIMARS
 * destroyed the column over ~4 hours.
 */

const US = 'f_us';
const SDF = 'f_sdf';
const WAG = 'f_wagner';

export const DEMO_ROSTER: RosterEntry[] = [
  { id: 'r_sf', name: 'US SOF Team', type: 'infantry', faction: 'United States', wikiTitle: 'Special Operations Joint Task Force – Operation Inherent Resolve' },
  { id: 'r_sdf', name: 'SDF Fighters', type: 'infantry', faction: 'SDF', wikiTitle: 'Syrian Democratic Forces' },
  { id: 'r_sdf_tech', name: 'SDF Technical', type: 'armor', faction: 'SDF', wikiTitle: 'Technical (vehicle)' },
  { id: 'r_himars', name: 'HIMARS', type: 'missile', faction: 'United States', wikiTitle: 'M142 HIMARS' },
  { id: 'r_f15', name: 'F-15E Strike Eagle', type: 'air', faction: 'United States', wikiTitle: 'McDonnell Douglas F-15E Strike Eagle' },
  { id: 'r_mq9', name: 'MQ-9 Reaper', type: 'air', faction: 'United States', wikiTitle: 'General Atomics MQ-9 Reaper' },
  { id: 'r_ac130', name: 'AC-130J Gunship', type: 'air', faction: 'United States', wikiTitle: 'Lockheed AC-130' },
  { id: 'r_ah64', name: 'AH-64 Apache', type: 'air', faction: 'United States', wikiTitle: 'Boeing AH-64 Apache' },
  { id: 'r_b52', name: 'B-52H Stratofortress', type: 'air', faction: 'United States', wikiTitle: 'Boeing B-52 Stratofortress' },
  { id: 'r_t72', name: 'T-72 Tank', type: 'armor', faction: 'Wagner / SAA', wikiTitle: 'T-72' },
  { id: 'r_t55', name: 'T-55 Tank', type: 'armor', faction: 'Wagner / SAA', wikiTitle: 'T-54/T-55' },
  { id: 'r_bmp', name: 'BMP-1 IFV', type: 'armor', faction: 'Wagner / SAA', wikiTitle: 'BMP-1' },
  { id: 'r_tech', name: 'Technical', type: 'armor', faction: 'Wagner / SAA', wikiTitle: 'Technical (vehicle)' },
  { id: 'r_wagner', name: 'Wagner Infantry', type: 'infantry', faction: 'Wagner / SAA', wikiTitle: 'Wagner Group' },
  { id: 'r_d30', name: 'D-30 Howitzer', type: 'artillery', faction: 'Wagner / SAA', wikiTitle: '122 mm howitzer 2A18 (D-30)' },
  { id: 'r_grad', name: 'BM-21 Grad', type: 'missile', faction: 'Wagner / SAA', wikiTitle: 'BM-21 Grad' },
  { id: 'r_zu23', name: 'ZU-23-2 AA gun', type: 'artillery', faction: 'Wagner / SAA', wikiTitle: 'ZU-23-2' },
];

/** Euphrates main channel, NW → SE, traced from the basemap waterway. */
const RIVER: LngLat[] = [
  [40.05, 35.43], [40.1, 35.4], [40.118, 35.36], [40.141, 35.34], [40.165, 35.321],
  [40.185, 35.304], [40.205, 35.316], [40.223, 35.311], [40.227, 35.289],
  [40.243, 35.282], [40.259, 35.282], [40.272, 35.278], [40.275, 35.261],
  [40.29, 35.26], [40.313, 35.262], [40.345, 35.253], [40.342, 35.222],
  [40.371, 35.216], [40.403, 35.207], [40.414, 35.196], [40.43, 35.17],
];

/**
 * Column waypoints: out of Khasham on the local road network, then
 * cross-country over the last stretch to the plant (no road connection).
 * Actual paths are snapped to streets at load time.
 */
const ROAD: LngLat[] = [
  [40.2845, 35.2968],
  [40.2992, 35.3043],
  [40.309, 35.3105],
];
const ADVANCE_S = 30;

interface ColumnVehicle {
  id: string;
  name: string;
  roster: string;
  type: Unit['type'];
  start: number;
  killedAt: number;
}

/** Column in march order, with the time each vehicle is hit. */
const COLUMN: ColumnVehicle[] = [
  { id: 'u_t72a', name: 'T-72', roster: 'r_t72', type: 'armor', start: 6, killedAt: 31 },
  { id: 'u_t72b', name: 'T-72', roster: 'r_t72', type: 'armor', start: 7.5, killedAt: 34 },
  { id: 'u_bmp1', name: 'BMP-1', roster: 'r_bmp', type: 'armor', start: 9, killedAt: 36.5 },
  { id: 'u_t55', name: 'T-55', roster: 'r_t55', type: 'armor', start: 10.5, killedAt: 39.5 },
  { id: 'u_bmp2', name: 'BMP-1', roster: 'r_bmp', type: 'armor', start: 12, killedAt: 42 },
  { id: 'u_tech1', name: 'Technical', roster: 'r_tech', type: 'armor', start: 13.5, killedAt: 44 },
  { id: 'u_tech2', name: 'Technical', roster: 'r_tech', type: 'armor', start: 15, killedAt: 46 },
  { id: 'u_wag', name: 'Wagner infantry', roster: 'r_wagner', type: 'infantry', start: 16.5, killedAt: 49 },
];

const byId = (id: string) => COLUMN.find((v) => v.id === id)!;

/** A strike on a column vehicle; the impact tracks wherever its routed path has taken it. */
function hitVehicle(
  vehicleId: string,
  s: Omit<Strike, 'lat' | 'lng' | 'appearAt' | 'launchAt'> & { flight: number },
): Strike {
  const v = byId(vehicleId);
  const { flight, ...rest } = s;
  return {
    ...rest,
    targetUnitId: v.id,
    lat: ROAD[1][1],
    lng: ROAD[1][0],
    appearAt: v.killedAt,
    launchAt: v.killedAt - flight,
  };
}

const D30: LngLat = [40.238, 35.236];
const GRAD: LngLat = [40.222, 35.251];
const PLANT: LngLat = [40.318, 35.318];

export function demoScenario(): Scenario {
  return {
    name: 'Battle of Khasham — Feb 7, 2018',
    factions: [
      { id: US, name: 'United States', color: '#3a6fc0', affiliation: 'friend' },
      { id: SDF, name: 'SDF', color: '#3f9b4b', affiliation: 'friend' },
      { id: WAG, name: 'Wagner / SAA', color: '#cf5a50', affiliation: 'hostile' },
    ],
    units: [
      // --- defenders at the Conoco plant (east bank) ---
      { id: 'u_sf', factionId: US, type: 'infantry', name: 'US SOF', rosterId: 'r_sf', lat: 35.321, lng: 40.314, heading: 220, appearAt: 0, sensorKm: 4.5 },
      { id: 'u_sdf', factionId: SDF, type: 'infantry', name: 'SDF', rosterId: 'r_sdf', lat: 35.314, lng: 40.33, heading: 220, appearAt: 0 },
      { id: 'u_sdf_tech', factionId: SDF, type: 'armor', name: 'SDF technical', rosterId: 'r_sdf_tech', lat: 35.31, lng: 40.318, heading: 210, appearAt: 0 },
      { id: 'u_sdf_cp', factionId: SDF, type: 'infantry', name: 'SDF checkpoint', rosterId: 'r_sdf', lat: 35.279, lng: 40.338, heading: 240, appearAt: 0, sensorKm: 3 },
      { id: 'u_himars', factionId: US, type: 'missile', name: 'HIMARS', rosterId: 'r_himars', lat: 35.372, lng: 40.43, heading: 225, appearAt: 0 },

      // --- Wagner column, single file on the road ---
      ...COLUMN.map<Unit>((v) => ({
        id: v.id,
        factionId: WAG,
        type: v.type,
        name: v.name,
        rosterId: v.roster,
        lat: ROAD[0][1],
        lng: ROAD[0][0],
        arrowId: `a_${v.id}`,
        appearAt: 0,
        destroyedAt: v.killedAt,
      })),

      // --- Wagner fire support, west bank ---
      { id: 'u_d30', factionId: WAG, type: 'artillery', name: 'D-30 battery', rosterId: 'r_d30', lat: D30[1], lng: D30[0], heading: 40, appearAt: 0, destroyedAt: 47.5 },
      { id: 'u_grad', factionId: WAG, type: 'missile', name: 'BM-21 Grad', rosterId: 'r_grad', lat: GRAD[1], lng: GRAD[0], heading: 60, appearAt: 0, destroyedAt: 50.5 },
      // mobile air defense covering the column's assembly area
      { id: 'u_zu23', factionId: WAG, type: 'artillery', name: 'ZU-23-2', rosterId: 'r_zu23', lat: 35.2935, lng: 40.2805, heading: 60, appearAt: 0, airDefenseKm: 2.5, destroyedAt: 45.5 },

      // --- US air response ---
      { id: 'u_f15a', factionId: US, type: 'air', name: 'F-15E', rosterId: 'r_f15', lat: 35.44, lng: 40.52, arrowId: 'a_f15a', appearAt: 22 },
      { id: 'u_f15b', factionId: US, type: 'air', name: 'F-15E', rosterId: 'r_f15', lat: 35.45, lng: 40.5, arrowId: 'a_f15b', appearAt: 23 },
      { id: 'u_mq9', factionId: US, type: 'air', name: 'MQ-9', rosterId: 'r_mq9', lat: 35.36, lng: 40.44, arrowId: 'a_mq9', appearAt: 22 },
      { id: 'u_ac130', factionId: US, type: 'air', name: 'AC-130J', rosterId: 'r_ac130', lat: 35.4, lng: 40.4, arrowId: 'a_ac130', appearAt: 27 },
      { id: 'u_ah64a', factionId: US, type: 'air', name: 'AH-64', rosterId: 'r_ah64', lat: 35.34, lng: 40.4, arrowId: 'a_ah64a', appearAt: 32 },
      { id: 'u_ah64b', factionId: US, type: 'air', name: 'AH-64', rosterId: 'r_ah64', lat: 35.33, lng: 40.41, arrowId: 'a_ah64b', appearAt: 33 },
      { id: 'u_b52', factionId: US, type: 'air', name: 'B-52H', rosterId: 'r_b52', lat: 35.5, lng: 40.5, arrowId: 'a_b52', appearAt: 40 },

    ],
    arrows: [
      ...COLUMN.map((v, i) => ({
        id: `a_${v.id}`,
        factionId: WAG,
        points: ROAD,
        name: i === 0 ? 'Wagner advance' : `${v.name} follows`,
        appearAt: v.start,
        duration: ADVANCE_S,
      })),
      { id: 'a_f15a', factionId: US, points: [[40.52, 35.44], [40.42, 35.37], [40.34, 35.322]], name: 'F-15E ingress', appearAt: 22, duration: 7 },
      { id: 'a_f15b', factionId: US, points: [[40.5, 35.45], [40.4, 35.39], [40.325, 35.335]], name: 'F-15E ingress', appearAt: 23, duration: 8 },
      { id: 'a_mq9', factionId: US, points: [[40.44, 35.36], [40.39, 35.32], [40.335, 35.28]], name: 'MQ-9 on station', appearAt: 22, duration: 12 },
      { id: 'a_ac130', factionId: US, points: [[40.4, 35.4], [40.33, 35.36], [40.272, 35.31]], name: 'AC-130 orbit', appearAt: 27, duration: 10 },
      { id: 'a_ah64a', factionId: US, points: [[40.4, 35.34], [40.36, 35.29], [40.31, 35.27]], name: 'AH-64 attack run', appearAt: 32, duration: 7 },
      { id: 'a_ah64b', factionId: US, points: [[40.41, 35.33], [40.37, 35.3], [40.322, 35.285]], name: 'AH-64 attack run', appearAt: 33, duration: 7 },
      { id: 'a_b52', factionId: US, points: [[40.5, 35.5], [40.38, 35.38], [40.27, 35.27]], name: 'B-52 bomb run', appearAt: 40, duration: 9 },
    ],
    territories: [
      {
        id: 't_sdf', factionId: SDF,
        points: [...RIVER, [40.6, 35.17], [40.6, 35.5], [40.0, 35.5], [40.0, 35.43]],
        name: 'SDF-held east bank', label: 'SDF', labelAt: [40.4, 35.34], labelRotate: -12,
        appearAt: 0, duration: 4,
      },
      {
        id: 't_saa', factionId: WAG,
        points: [...RIVER, [40.43, 35.05], [40.0, 35.05], [40.0, 35.43]],
        name: 'SAA-held west bank', label: 'SAA', labelAt: [40.18, 35.22], labelRotate: -12,
        appearAt: 0, duration: 4,
      },
    ],
    labels: [
      { id: 'l_conoco', text: 'Conoco gas plant', facility: 'gas', lat: PLANT[1], lng: PLANT[0], size: 12, color: '#1c1f22', appearAt: 0 },
      { id: 'l_euph', text: 'Euphrates River', lat: 35.268, lng: 40.33, size: 11, color: '#3d5a66', appearAt: 0 },
      { id: 'l_flag_us', text: 'US & SDF', flag: 'us', lat: 35.345, lng: 40.36, size: 12, color: '#1c1f22', appearAt: 0 },
      { id: 'l_flag_ru', text: 'Wagner PMC', flag: 'ru', lat: 35.288, lng: 40.268, size: 12, color: '#1c1f22', appearAt: 2 },
      { id: 'l_flag_sy', text: 'Syrian Army', flag: 'sy', lat: 35.26, lng: 40.18, size: 12, color: '#1c1f22', appearAt: 2 },
    ],
    strikes: [
      // Wagner fire support opens on the plant and the checkpoint
      { id: 's_d30a', lat: PLANT[1], lng: PLANT[0], name: 'D-30 fire mission', size: 0.7, salvo: 4, spreadM: 160, appearAt: 17, fromUnitId: 'u_d30', launchAt: 14 },
      { id: 's_d30b', lat: 35.321, lng: 40.328, name: 'D-30 fire mission', size: 0.7, salvo: 4, spreadM: 160, appearAt: 20.5, fromUnitId: 'u_d30', launchAt: 17.5 },
      { id: 's_grad', lat: 35.28, lng: 40.337, name: 'Grad rocket barrage', size: 0.55, salvo: 12, spreadM: 280, appearAt: 23, fromUnitId: 'u_grad', launchAt: 19.5 },

      // US air response walks down the column
      hitVehicle('u_t72a', { id: 's_jdam1', name: 'GBU-38 JDAM', size: 1.5, fromUnitId: 'u_f15a', flight: 4 }),
      hitVehicle('u_t72b', { id: 's_jdam2', name: 'GBU-38 JDAM', size: 1.5, fromUnitId: 'u_f15b', flight: 4 }),
      hitVehicle('u_bmp1', { id: 's_hellfire1', name: 'AGM-114 Hellfire', size: 0.9, fromUnitId: 'u_mq9', flight: 3 }),
      hitVehicle('u_t55', { id: 's_ac130a', name: '105mm howitzer', size: 0.8, salvo: 5, spreadM: 70, fromUnitId: 'u_ac130', flight: 1.2 }),
      hitVehicle('u_bmp2', { id: 's_ah64a', name: '30mm chain gun', size: 0.35, salvo: 10, spreadM: 45, fromUnitId: 'u_ah64a', flight: 1.4 }),
      hitVehicle('u_tech1', { id: 's_hellfire2', name: 'AGM-114 Hellfire', size: 0.9, fromUnitId: 'u_ah64b', flight: 2.5 }),
      hitVehicle('u_tech2', { id: 's_ac130b', name: '105mm howitzer', size: 0.8, salvo: 5, spreadM: 70, fromUnitId: 'u_ac130', flight: 1.2 }),
      hitVehicle('u_wag', { id: 's_b52', name: 'Mk 82 bomb string', size: 1.1, salvo: 9, spreadM: 320, fromUnitId: 'u_b52', flight: 5 }),

      // gunship silences the AA gun before the bomber run
      { id: 's_zu23', targetUnitId: 'u_zu23', lat: 35.2935, lng: 40.2805, name: '105mm howitzer', size: 0.8, salvo: 3, spreadM: 40, appearAt: 45.5, fromUnitId: 'u_ac130', launchAt: 44.3 },

      // HIMARS counter-battery
      { id: 's_himars1', lat: D30[1], lng: D30[0], name: 'GMLRS counter-battery', size: 1.3, salvo: 3, spreadM: 90, appearAt: 47.5, fromUnitId: 'u_himars', launchAt: 43.5 },
      { id: 's_himars2', lat: GRAD[1], lng: GRAD[0], name: 'GMLRS counter-battery', size: 1.3, salvo: 2, spreadM: 60, appearAt: 50.5, fromUnitId: 'u_himars', launchAt: 46.5 },
    ],
    // overnight battle: evening assault, air campaign through the night, dawn at the end
    environment: { startHour: 21.5, endHour: 5.9, windDirDeg: 65, windKph: 14, haze: 0.15 },
    effects: [
      // JTAC calls in air support and hands targets to the strike aircraft
      { id: 'fx_radio', kind: 'radio', unitId: 'u_sf', start: 18, duration: 6, label: 'CALLING AIR SUPPORT' },
      { id: 'fx_handoff', kind: 'datalink', unitId: 'u_sf', targetUnitId: 'u_f15a', start: 24.5, duration: 5, label: 'TARGET HANDOFF' },
      { id: 'fx_isr', kind: 'datalink', unitId: 'u_mq9', targetUnitId: 'u_ac130', start: 29, duration: 11, label: 'ISR FEED' },
      // Wagner electronic warfare tries to blind the defenders
      { id: 'fx_jam', kind: 'jamming', unitId: 'u_grad', start: 12, duration: 14, radiusM: 3200, label: 'EW JAMMING' },
      // the column comes apart
      { id: 'fx_t55_hit', kind: 'wounded', unitId: 'u_t55', start: 36.5, duration: 3 },
      { id: 'fx_panic', kind: 'panic', unitId: 'u_wag', start: 41, duration: 8, label: 'ROUTED' },
      { id: 'fx_d30_dry', kind: 'noammo', unitId: 'u_d30', start: 40, duration: 7.5 },
    ],
    keyframes: [
      {
        id: 'k1', time: 0, lng: 40.29, lat: 35.285, zoom: 11.3, pitch: 0, bearing: 0,
        caption: 'Deir ez-Zor, Syria — the Euphrates deconfliction line, February 7, 2018',
      },
      {
        id: 'k2', time: 5, lng: 40.322, lat: 35.314, zoom: 13.5, pitch: 50, bearing: -20,
        caption: 'Conoco gas plant — US special operators and SDF fighters hold the facility',
      },
      {
        id: 'k3', time: 11, lng: 40.29, lat: 35.3, zoom: 13.2, pitch: 55, bearing: 25,
        followUnitId: 'u_t72a', followMode: 'track', orbitSpeed: 3,
        caption: 'A Wagner column — T-72s, T-55s, BMPs, ~500 men — rolls out of Khasham toward the plant',
      },
      {
        id: 'k4', time: 17, lng: 40.29, lat: 35.29, zoom: 12.5, pitch: 50, bearing: 35,
        caption: 'Wagner howitzers and Grad rockets open fire on the defenders',
      },
      {
        id: 'k5', time: 24, lng: 40.35, lat: 35.33, zoom: 12, pitch: 45, bearing: -30,
        caption: 'US aircraft respond — F-15Es, an MQ-9, an AC-130 gunship, Apaches',
      },
      {
        id: 'k6', time: 30, lng: 40.298, lat: 35.305, zoom: 13.4, pitch: 55, bearing: 10, orbitSpeed: 5,
        caption: 'Precision strikes walk down the column, vehicle by vehicle',
      },
      {
        id: 'k7', time: 40, lng: 40.294, lat: 35.302, zoom: 13, pitch: 50, bearing: 40, orbitSpeed: 4,
        caption: 'A B-52 arrives to finish the survivors on the road',
      },
      {
        id: 'k8', time: 46, lng: 40.25, lat: 35.25, zoom: 12.7, pitch: 50, bearing: -15,
        caption: 'HIMARS counter-battery fire silences the Wagner artillery',
      },
      {
        id: 'k9', time: 53, lng: 40.3, lat: 35.285, zoom: 11.7, pitch: 30, bearing: 0,
        caption: 'By dawn the column is destroyed — no US casualties',
      },
    ],
  };
}
