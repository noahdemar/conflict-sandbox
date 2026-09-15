import type { Arrow, Keyframe, RosterEntry, Scenario, StatusEffect, Strike, Unit } from './types';
import type { LngLat } from './geo';

/**
 * Demo: the Battle of Agincourt, 25 October 1415 (Julian calendar).
 * Henry V's English army, mostly longbowmen, held a narrow field between the
 * woods of Azincourt and Tramecourt against a much larger French army. French
 * cavalry and then dismounted men-at-arms attacked across deep mud under arrow
 * fire and were defeated in the crush and melee that followed.
 *
 * Positions, frontages and timings are a simplified reconstruction; historians
 * disagree on army sizes and on the exact deployment of the archers.
 */

const EN = 'f_english';
const FR = 'f_french';
const LAND = 'f_terrain';

export const AGINCOURT_ROSTER: RosterEntry[] = [
  { id: 'r_longbow', name: 'English longbowmen', type: 'infantry', faction: 'English army', wikiTitle: 'English longbow' },
  { id: 'r_en_maa', name: 'English men-at-arms', type: 'infantry', faction: 'English army', wikiTitle: 'Man-at-arms' },
  { id: 'r_henry', name: 'King Henry V', type: 'hq', faction: 'English army', wikiTitle: 'Henry V of England' },
  { id: 'r_baggage', name: 'English baggage train', type: 'hq', faction: 'English army' },
  { id: 'r_fr_maa', name: 'French men-at-arms (dismounted)', type: 'infantry', faction: 'French army', wikiTitle: 'Man-at-arms' },
  { id: 'r_fr_cav', name: 'French mounted knights', type: 'armor', faction: 'French army', wikiTitle: 'Knight' },
  { id: 'r_crossbow', name: 'French crossbowmen', type: 'infantry', faction: 'French army', wikiTitle: 'Crossbow' },
  { id: 'r_albret', name: "Constable Charles d'Albret", type: 'hq', faction: 'French army', wikiTitle: "Charles I d'Albret" },
];

// field between the two woods; lines run west to east, the English face north
const EN_START = 50.453;
const EN_FORWARD = 50.4568;
const FR_FIRST = 50.464;
const FR_CONTACT = 50.4582;

const P = (lng: number, lat: number): LngLat => [lng, lat];

const units: Unit[] = [
  // ---- English, three battles of men-at-arms with archers on the wings ----
  { id: 'en_arch_w', factionId: EN, type: 'infantry', name: 'Archers (left wing)', rosterId: 'r_longbow', lat: EN_START, lng: 2.1318, heading: 0, appearAt: 0, arrowId: 'a_en_arch_w' },
  { id: 'en_maa_l', factionId: EN, type: 'infantry', name: 'Men-at-arms (Lord Camoys)', rosterId: 'r_en_maa', lat: EN_START, lng: 2.1352, heading: 0, appearAt: 0, arrowId: 'a_en_maa_l' },
  { id: 'en_maa_c', factionId: EN, type: 'infantry', name: 'Men-at-arms (King Henry)', rosterId: 'r_en_maa', lat: EN_START, lng: 2.1385, heading: 0, appearAt: 0, arrowId: 'a_en_maa_c' },
  { id: 'en_maa_r', factionId: EN, type: 'infantry', name: 'Men-at-arms (Duke of York)', rosterId: 'r_en_maa', lat: EN_START, lng: 2.1418, heading: 0, appearAt: 0, arrowId: 'a_en_maa_r' },
  { id: 'en_arch_e', factionId: EN, type: 'infantry', name: 'Archers (right wing)', rosterId: 'r_longbow', lat: EN_START, lng: 2.1452, heading: 0, appearAt: 0, arrowId: 'a_en_arch_e' },
  { id: 'en_henry', factionId: EN, type: 'hq', name: 'King Henry V and royal standard', rosterId: 'r_henry', lat: EN_START - 0.0012, lng: 2.1385, heading: 0, appearAt: 0, arrowId: 'a_en_henry' },
  { id: 'en_baggage', factionId: EN, type: 'hq', name: 'Baggage train at Maisoncelle', rosterId: 'r_baggage', lat: 50.4492, lng: 2.1405, heading: 0, appearAt: 0 },

  // ---- French first line: dismounted men-at-arms ----
  { id: 'fr_v_l', factionId: FR, type: 'infantry', name: 'French men-at-arms (vanguard west)', rosterId: 'r_fr_maa', lat: FR_FIRST, lng: 2.1345, heading: 180, appearAt: 0, arrowId: 'a_fr_v_l', destroyedAt: 70 },
  { id: 'fr_v_c', factionId: FR, type: 'infantry', name: 'French men-at-arms (vanguard centre)', rosterId: 'r_fr_maa', lat: FR_FIRST, lng: 2.1385, heading: 180, appearAt: 0, arrowId: 'a_fr_v_c', destroyedAt: 73 },
  { id: 'fr_v_r', factionId: FR, type: 'infantry', name: 'French men-at-arms (vanguard east)', rosterId: 'r_fr_maa', lat: FR_FIRST, lng: 2.1425, heading: 180, appearAt: 0, arrowId: 'a_fr_v_r', destroyedAt: 75 },
  { id: 'fr_albret', factionId: FR, type: 'hq', name: "Constable d'Albret's banner", rosterId: 'r_albret', lat: FR_FIRST + 0.0012, lng: 2.1385, heading: 180, appearAt: 0, arrowId: 'a_fr_albret', destroyedAt: 74 },
  // ---- mounted wings, meant to ride down the archers ----
  { id: 'fr_cav_w', factionId: FR, type: 'armor', name: 'Mounted knights (west wing)', rosterId: 'r_fr_cav', lat: 50.4655, lng: 2.132, heading: 180, appearAt: 0, arrowId: 'a_fr_cav_w' },
  { id: 'fr_cav_e', factionId: FR, type: 'armor', name: 'Mounted knights (east wing)', rosterId: 'r_fr_cav', lat: 50.4655, lng: 2.145, heading: 180, appearAt: 0, arrowId: 'a_fr_cav_e' },
  { id: 'fr_xbow', factionId: FR, type: 'infantry', name: 'Crossbowmen (little used)', rosterId: 'r_crossbow', lat: 50.4668, lng: 2.1385, heading: 180, appearAt: 0 },
  // ---- second line and mounted rearguard ----
  { id: 'fr_m_l', factionId: FR, type: 'infantry', name: 'French men-at-arms (main battle west)', rosterId: 'r_fr_maa', lat: 50.469, lng: 2.136, heading: 180, appearAt: 0, arrowId: 'a_fr_m_l', destroyedAt: 90 },
  { id: 'fr_m_r', factionId: FR, type: 'infantry', name: 'French men-at-arms (main battle east)', rosterId: 'r_fr_maa', lat: 50.469, lng: 2.141, heading: 180, appearAt: 0, arrowId: 'a_fr_m_r' },
  { id: 'fr_rear', factionId: FR, type: 'armor', name: 'Mounted rearguard', rosterId: 'r_fr_cav', lat: 50.4725, lng: 2.1385, heading: 180, appearAt: 0, arrowId: 'a_fr_rear' },
  // ---- the raid on the English baggage ----
  { id: 'fr_raid', factionId: FR, type: 'armor', name: "Mounted raiders (Ysembart d'Azincourt)", rosterId: 'r_fr_cav', lat: 50.46, lng: 2.127, heading: 160, appearAt: 82, arrowId: 'a_fr_raid', leavesAt: 100 },
];

/** A block that steps forward between two times and holds. */
const move = (id: string, faction: string, from: LngLat, to: LngLat, t0: number, t1: number, name: string, hideLine = false): Arrow => ({
  id, factionId: faction, points: [from, from, to], times: [0, t0, t1], name, appearAt: t0, duration: t1 - t0, followRoads: false, hideLine,
});

const arrows: Arrow[] = [
  // English advance to within bowshot, around 24 to 30 s
  move('a_en_arch_w', EN, P(2.1318, EN_START), P(2.1318, EN_FORWARD), 24, 30, 'English advance', true),
  move('a_en_maa_l', EN, P(2.1352, EN_START), P(2.1352, EN_FORWARD), 24, 30, 'English advance', true),
  move('a_en_maa_c', EN, P(2.1385, EN_START), P(2.1385, EN_FORWARD), 24, 30, 'English advance'),
  move('a_en_maa_r', EN, P(2.1418, EN_START), P(2.1418, EN_FORWARD), 24, 30, 'English advance', true),
  move('a_en_arch_e', EN, P(2.1452, EN_START), P(2.1452, EN_FORWARD), 24, 30, 'English advance', true),
  move('a_en_henry', EN, P(2.1385, EN_START - 0.0012), P(2.1385, EN_FORWARD - 0.0012), 24, 30, 'Royal standard', true),
  // French cavalry charge on both wings, broken and thrown back
  {
    id: 'a_fr_cav_w', factionId: FR, name: 'Cavalry charge (west)', appearAt: 32, duration: 12, followRoads: false,
    points: [P(2.132, 50.4655), P(2.132, 50.4655), P(2.1321, 50.4588), P(2.1332, 50.4648)], times: [0, 32, 37, 44],
  },
  {
    id: 'a_fr_cav_e', factionId: FR, name: 'Cavalry charge (east)', appearAt: 32, duration: 12, followRoads: false,
    points: [P(2.145, 50.4655), P(2.145, 50.4655), P(2.1449, 50.4588), P(2.1438, 50.4648)], times: [0, 32, 37, 44],
  },
  // first line struggles forward through the mud
  move('a_fr_v_l', FR, P(2.1345, FR_FIRST), P(2.1355, FR_CONTACT), 44, 57, 'French advance on foot', true),
  move('a_fr_v_c', FR, P(2.1385, FR_FIRST), P(2.1385, FR_CONTACT), 44, 57, 'French advance on foot'),
  move('a_fr_v_r', FR, P(2.1425, FR_FIRST), P(2.1415, FR_CONTACT), 44, 57, 'French advance on foot', true),
  move('a_fr_albret', FR, P(2.1385, FR_FIRST + 0.0012), P(2.1385, FR_CONTACT + 0.0012), 44, 57, "d'Albret's banner", true),
  // second line follows into the same ground
  move('a_fr_m_l', FR, P(2.136, 50.469), P(2.1368, 50.4605), 76, 86, 'Second French line'),
  move('a_fr_m_r', FR, P(2.141, 50.469), P(2.1402, 50.4608), 76, 86, 'Second French line', true),
  // the rearguard never commits and withdraws
  move('a_fr_rear', FR, P(2.1385, 50.4725), P(2.1385, 50.479), 98, 106, 'Rearguard withdraws'),
  // raid around the western wood onto the baggage camp
  {
    id: 'a_fr_raid', factionId: FR, name: 'Raid on the baggage', appearAt: 84, duration: 8, followRoads: false, hideAt: 100,
    points: [P(2.127, 50.46), P(2.127, 50.46), P(2.1285, 50.4512), P(2.1392, 50.4494)], times: [0, 84, 88, 92],
  },
];

/** Where a unit starts, used as the nominal aim point before impacts follow it. */
const startPos = (id: string) => {
  const u = units.find((v) => v.id === id)!;
  return { lat: u.lat, lng: u.lng };
};

/** Arrow volley from an archer wing onto a unit, `flight` seconds in the air. */
const volley = (id: string, from: string, target: string, impact: number, flight = 2, salvo = 16): Strike => ({
  id, name: 'Longbow volley', fromUnitId: from, targetUnitId: target, ...startPos(target),
  size: 0.12, salvo, spreadM: 70, appearAt: impact, launchAt: impact - flight,
});

/** Hand-to-hand fighting where two bodies of men meet. */
const melee = (id: string, from: string, target: string, at: number, name = 'Melee', salvo = 5): Strike => ({
  id, name, fromUnitId: from, targetUnitId: target, ...startPos(target),
  size: 0.22, salvo, spreadM: 55, appearAt: at, launchAt: at - 0.3,
});

const strikes: Strike[] = [
  // opening volleys provoke the charge
  volley('v_open_w', 'en_arch_w', 'fr_cav_w', 32.5, 2.4),
  volley('v_open_e', 'en_arch_e', 'fr_cav_e', 32.8, 2.4),
  // into the charging horsemen at close range
  volley('v_cav_w', 'en_arch_w', 'fr_cav_w', 36, 1.2),
  volley('v_cav_e', 'en_arch_e', 'fr_cav_e', 36.3, 1.2),
  // steady shooting into the advancing men-at-arms
  volley('v_adv_1', 'en_arch_w', 'fr_v_l', 47, 2),
  volley('v_adv_2', 'en_arch_e', 'fr_v_r', 48, 2),
  volley('v_adv_3', 'en_arch_w', 'fr_v_c', 50.5, 1.8),
  volley('v_adv_4', 'en_arch_e', 'fr_v_c', 51.5, 1.8),
  volley('v_adv_5', 'en_arch_w', 'fr_v_l', 54, 1.4),
  volley('v_adv_6', 'en_arch_e', 'fr_v_r', 55, 1.4),
  // the lines meet
  melee('m_c1', 'en_maa_c', 'fr_v_c', 58),
  melee('m_l1', 'en_maa_l', 'fr_v_l', 59),
  melee('m_r1', 'en_maa_r', 'fr_v_r', 59.5),
  melee('m_c2', 'en_maa_c', 'fr_v_c', 62),
  melee('m_l2', 'en_maa_l', 'fr_v_l', 64),
  melee('m_r2', 'en_maa_r', 'fr_v_r', 65),
  // archers leave their stakes and join in on the flanks
  melee('m_aw', 'en_arch_w', 'fr_v_l', 67, 'Archers join the melee with mallets and swords'),
  melee('m_ae', 'en_arch_e', 'fr_v_r', 68, 'Archers join the melee with mallets and swords'),
  melee('m_c3', 'en_maa_c', 'fr_v_c', 70),
  // the second line comes on
  volley('v_second_1', 'en_arch_w', 'fr_m_l', 81, 2),
  volley('v_second_2', 'en_arch_e', 'fr_m_r', 82, 2),
  melee('m_second_1', 'en_maa_l', 'fr_m_l', 86),
  melee('m_second_2', 'en_maa_c', 'fr_m_l', 88),
  // the raid on the baggage camp
  melee('m_raid', 'fr_raid', 'en_baggage', 92, 'Mounted raid on the baggage', 3),
];

const effects: StatusEffect[] = [
  { id: 'fx_stakes_w', kind: 'radio', unitId: 'en_arch_w', start: 30, duration: 4, label: 'Stakes planted' },
  { id: 'fx_stakes_e', kind: 'radio', unitId: 'en_arch_e', start: 30, duration: 4, label: 'Stakes planted' },
  { id: 'fx_cav_w', kind: 'panic', unitId: 'fr_cav_w', start: 37, duration: 7, label: 'Charge broken' },
  { id: 'fx_cav_e', kind: 'panic', unitId: 'fr_cav_e', start: 37, duration: 7, label: 'Charge broken' },
  { id: 'fx_mud_l', kind: 'wounded', unitId: 'fr_v_l', start: 50, duration: 20, label: 'Mud and arrows' },
  { id: 'fx_mud_c', kind: 'wounded', unitId: 'fr_v_c', start: 51, duration: 22, label: 'Mud and arrows' },
  { id: 'fx_mud_r', kind: 'wounded', unitId: 'fr_v_r', start: 52, duration: 23, label: 'Mud and arrows' },
  { id: 'fx_crush', kind: 'panic', unitId: 'fr_v_c', start: 60, duration: 12, label: 'Crushed together' },
  { id: 'fx_second', kind: 'panic', unitId: 'fr_m_r', start: 88, duration: 10, label: 'Falling back' },
  { id: 'fx_order', kind: 'radio', unitId: 'en_henry', start: 93, duration: 5, label: 'Orders prisoners killed' },
];

const C = P(2.1385, 50.4595);

const cam = (
  id: string, time: number, at: LngLat, zoom: number, pitch: number, bearing: number, caption: string,
  extra: Partial<Keyframe> = {},
): Keyframe => ({ id, time, lng: at[0], lat: at[1], zoom, pitch, bearing, caption, ...extra });

const keyframes: Keyframe[] = [
  cam('k1', 0, P(2.1385, 50.4595), 13.4, 0, 0,
    'On 25 October 1415, an exhausted English army found its road to Calais blocked near the village of Azincourt, in northern France.'),
  cam('k2', 8, P(2.1385, 50.4545), 15.2, 50, 0,
    'King Henry the Fifth had perhaps six to nine thousand men. Most of them were archers armed with the longbow.',
    { highlightUnitIds: ['en_arch_w', 'en_arch_e', 'en_maa_l', 'en_maa_c', 'en_maa_r', 'en_henry'] }),
  cam('k3', 16, P(2.1385, 50.4655), 15, 52, 180,
    'Facing them was a much larger French army, its men-at-arms packed into a narrow field between two woods.',
    { overlay: 'orbat', overlayFactionIds: [FR], highlightUnitIds: ['fr_v_l', 'fr_v_c', 'fr_v_r', 'fr_cav_w', 'fr_cav_e'] }),
  cam('k4', 24, P(2.1385, 50.4565), 15.3, 55, 15,
    'After a long morning standoff, the English moved forward to within bowshot and drove sharpened stakes into the ground.',
    { highlightUnitIds: ['en_arch_w', 'en_arch_e'] }),
  cam('k5', 32, P(2.1385, 50.4605), 14.9, 50, -20,
    'The first volleys provoked the French cavalry to charge the English flanks. Stakes, arrows, and the woods broke the charge.',
    { highlightUnitIds: ['fr_cav_w', 'fr_cav_e'] }),
  cam('k6', 44, P(2.1385, 50.4615), 15.2, 58, 200,
    'Then the French men-at-arms advanced on foot, across a ploughed field turned to deep mud by heavy rain the night before.',
    { followUnitId: 'fr_v_c', followMode: 'track', highlightUnitIds: ['fr_v_l', 'fr_v_c', 'fr_v_r'] }),
  cam('k7', 56, P(2.1385, 50.4578), 16, 55, 30,
    'Under constant arrow fire the French crowded together. When they reached the English line, many were packed too tightly to fight.',
    { orbitSpeed: 2 }),
  cam('k8', 66, P(2.1385, 50.4578), 15.8, 55, -35,
    'The English archers left their stakes and joined the fighting with swords, axes, and mallets.',
    { highlightUnitIds: ['en_arch_w', 'en_arch_e'] }),
  cam('k9', 76, P(2.1385, 50.4625), 15, 52, 190,
    'A second French line pushed into the same ground, and met the same fate.',
    { highlightUnitIds: ['fr_m_l', 'fr_m_r'] }),
  cam('k10', 84, P(2.135, 50.453), 15.2, 50, 20,
    'A raid on the English baggage camp, and fear of a renewed attack, led Henry to order the killing of many French prisoners.',
    { highlightUnitIds: ['fr_raid', 'en_baggage', 'en_henry'] }),
  cam('k11', 98, P(2.1385, 50.4605), 13.9, 30, 0,
    'By afternoon the battle was over. Thousands of French lay dead, among them the Constable of France. English losses were a few hundred at most.',
    { overlay: 'orbat' }),
];

/** Approximate outlines of the two woods that framed the field. */
const WOOD_W: LngLat[] = [
  P(2.1235, 50.4555), P(2.1302, 50.4552), P(2.1312, 50.4585), P(2.1305, 50.4625),
  P(2.1285, 50.4648), P(2.1238, 50.4645), P(2.1222, 50.46),
];
const WOOD_E: LngLat[] = [
  P(2.1468, 50.4545), P(2.1535, 50.4548), P(2.1552, 50.4595), P(2.1535, 50.4642),
  P(2.1478, 50.4648), P(2.1462, 50.4608), P(2.1466, 50.4575),
];

export function agincourtScenario(): Scenario {
  return {
    name: 'Battle of Agincourt',
    era: 'historical',
    subtitle: 'Azincourt, northern France · 25 October 1415',
    sources: [
      'Anne Curry, Agincourt: A New History (2005)',
      'Juliet Barker, Agincourt: The King, the Campaign, the Battle (2005)',
      'John Keegan, The Face of Battle (1976)',
      'Gesta Henrici Quinti, account by an English royal chaplain present at the battle (c. 1417)',
    ],
    article: [
      { kind: 'text', text: 'In the autumn of 1415, Henry the Fifth of England had taken the port of Harfleur after a long siege, but disease had cost him much of his army. He set out to march his remaining troops overland to English-held Calais. A French army gathered to stop him.' },
      { kind: 'text', text: 'On 24 October the French blocked his road near the village of Azincourt. Both armies spent a cold, wet night within sight of each other.' },
      { kind: 'callout', title: 'Henry the Fifth', text: 'King of England from 1413 to 1422. He led his army in person at Agincourt and fought in the centre of the line.', wikiTitle: 'Henry V of England' },
      { kind: 'scene', from: 'k1', to: 'k2', caption: 'The English army at the southern end of the field.' },
      { kind: 'heading', text: 'Two armies, one narrow field' },
      { kind: 'text', text: 'Henry had perhaps six to nine thousand men, most of them archers. The French army was larger, though how much larger is still debated. It was led by the Constable of France, Charles d’Albret, and many of the kingdom’s great nobles.' },
      { kind: 'text', text: 'The ground favoured the defenders. Woods on either side squeezed the French into a front little wider than the English line, and the freshly ploughed field between them was soaked by rain.' },
      { kind: 'callout', title: 'The English longbow', text: 'A tall bow of yew that took years of training to draw. Massed archers could keep up a heavy rate of fire at a couple of hundred meters.', wikiTitle: 'English longbow', side: 'left' },
      { kind: 'scene', from: 'k3', to: 'k4', caption: 'The French lines, and the English advance to within bowshot.' },
      { kind: 'heading', text: 'The attack' },
      { kind: 'text', text: 'Neither side wanted to attack first. Late in the morning Henry moved his army forward, and his archers planted sharpened stakes in front of them and began to shoot.' },
      { kind: 'text', text: 'Mounted French knights charged the archers on the flanks, but the stakes, the arrows and the woods broke the charge. Horses and riders fell back into their own advancing infantry.' },
      { kind: 'scene', from: 'k5', caption: 'The French cavalry charge the English wings.' },
      { kind: 'text', text: 'The French men-at-arms advanced on foot, wearing heavy armour, through mud that could reach their calves. Arrow fire drove them inward toward the centre, and by the time they reached the English line they were crowded so closely that many could hardly swing a weapon.' },
      { kind: 'callout', title: 'Plate armour', text: 'By 1415 a man-at-arms could be protected head to foot in steel plate. It resisted many arrows, but was exhausting to wear while walking through deep mud.', wikiTitle: 'Plate armour' },
      { kind: 'scene', from: 'k6', to: 'k7', caption: 'The French first line advances through the mud and meets the English.' },
      { kind: 'text', text: 'The English archers dropped their bows and joined the melee with swords, axes and mallets. The French first line collapsed, and a second line that followed it into the same ground was also defeated.' },
      { kind: 'scene', from: 'k8', to: 'k9', caption: 'The archers join the fighting, and the second French line is thrown back.' },
      { kind: 'heading', text: 'Aftermath' },
      { kind: 'text', text: 'Late in the battle, a French force attacked the English baggage camp at Maisoncelle. Fearing a new assault while his men guarded large numbers of prisoners, Henry ordered many of the prisoners killed, an act that still draws debate.' },
      { kind: 'scene', from: 'k10', caption: 'The raid on the English baggage.' },
      { kind: 'text', text: 'French losses ran into the thousands and included the Constable, several dukes and many other nobles; others, such as the Duke of Orléans, were captured. The English lost a few hundred men at most, among them the Duke of York. Henry went on to Calais, and within five years a treaty named him heir to the French throne.' },
      { kind: 'callout', title: 'A contemporary image', text: 'Fifteenth-century chroniclers and illuminators made Agincourt one of the most famous battles of the Middle Ages.', wikiTitle: 'Battle of Agincourt', side: 'left' },
      { kind: 'scene', from: 'k11', caption: 'The field at the end of the day.' },
    ],
    factions: [
      { id: EN, name: 'English army', color: '#a8352b', affiliation: 'friend' },
      { id: FR, name: 'French army', color: '#2f539b', affiliation: 'hostile' },
      { id: LAND, name: 'Woodland', color: '#5f6b37', affiliation: 'neutral' },
    ],
    units,
    arrows,
    territories: [
      { id: 't_wood_w', factionId: LAND, points: WOOD_W, name: 'Azincourt wood (approx.)', label: 'Azincourt wood', appearAt: 0, duration: 2 },
      { id: 't_wood_e', factionId: LAND, points: WOOD_E, name: 'Tramecourt wood (approx.)', label: 'Tramecourt wood', appearAt: 0, duration: 2 },
    ],
    labels: [
      { id: 'l_azincourt', text: 'Azincourt', facility: 'town', lat: 50.4648, lng: 2.1283, size: 12, color: '#3b2c1a', appearAt: 0 },
      { id: 'l_tramecourt', text: 'Tramecourt', facility: 'town', lat: 50.4592, lng: 2.1515, size: 12, color: '#3b2c1a', appearAt: 0 },
      { id: 'l_maisoncelle', text: 'Maisoncelle', facility: 'town', lat: 50.4478, lng: 2.1418, size: 12, color: '#3b2c1a', appearAt: 0 },
      { id: 'l_field', text: 'Ploughed field, deep mud', lat: C[1], lng: C[0] + 0.0045, size: 11, color: '#5a4a32', appearAt: 0 },
      { id: 'l_calais', text: 'Road to Calais (north)', lat: 50.4755, lng: 2.1330, size: 11, color: '#5a4a32', appearAt: 0 },
    ],
    strikes,
    effects,
    keyframes,
    // 25 October 1415 in the Julian calendar is 3 November in the proleptic
    // Gregorian calendar the sun model uses. Overcast after a night of rain.
    environment: {
      startHour: 7, endHour: 16, date: '1415-11-03', utcOffset: 0,
      hourKeys: [[0, 7.3], [22, 10.8], [32, 11.2], [98, 15], [110, 15.6]],
      windDirDeg: 45, windKph: 10, haze: 0.2, cloudCover: 0.6,
    },
    duration: 110,
  };
}
