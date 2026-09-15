import type { AerialAircraft, Keyframe, RosterEntry, Scenario } from './types';

/**
 * Demo: F-4C Phantom versus MiG-17 over North Vietnam, 20 May 1967.
 *
 * An ILLUSTRATIVE reconstruction for explaining tactics: the aircraft paths
 * below are generated to show a head-on pass, a MiG break turn and a Phantom
 * vertical maneuver ending behind the MiG. They are not recovered flight
 * data, and the timing, altitudes and weapon details are simplified.
 */

const US = 'f_usaf';
const VN = 'f_vpaf';

export const DOGFIGHT_ROSTER: RosterEntry[] = [
  { id: 'r_f4c', name: 'F-4C Phantom II', type: 'air', faction: 'US Air Force', wikiTitle: 'McDonnell Douglas F-4 Phantom II' },
  { id: 'r_mig17', name: 'MiG-17', type: 'air', faction: 'North Vietnamese Air Force', wikiTitle: 'Mikoyan-Gurevich MiG-17' },
];

type Pt = [number, number, number, number];

/** Simple flight path builder: heading in compass degrees, speed in m/s, sampled every half second. */
class Path {
  pts: Pt[] = [];
  /** Current turn and climb rates, eased toward each segment's values so maneuvers start smoothly. */
  private turnNow = 0;
  private climbNow = 0;
  constructor(
    public t: number,
    public x: number,
    public y: number,
    public alt: number,
    public hdg: number,
    public v: number,
  ) {
    this.pts.push([t, x, y, alt]);
  }
  /** Fly for `s` seconds turning `turn` deg/s (positive = right) and climbing `climb` m/s. */
  fly(s: number, turn = 0, climb = 0, accel = 0) {
    const dt = 0.5;
    for (let k = 0; k < Math.round(s / dt); k++) {
      // pilots roll into turns and ease into climbs over a second or two
      this.turnNow += (turn - this.turnNow) * 0.35;
      this.climbNow += (climb - this.climbNow) * 0.3;
      this.hdg += this.turnNow * dt;
      this.v += accel * dt;
      const r = (this.hdg * Math.PI) / 180;
      this.x += Math.sin(r) * this.v * dt;
      this.y += Math.cos(r) * this.v * dt;
      this.alt += this.climbNow * dt;
      this.t += dt;
      this.pts.push([this.t, this.x, this.y, this.alt]);
    }
    return this;
  }
}

/** Linear sample of a dense track at time t. */
function sample(track: Pt[], t: number): [number, number, number] {
  if (t <= track[0][0]) return [track[0][1], track[0][2], track[0][3]];
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i][0]) {
      const a = track[i - 1];
      const b = track[i];
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  const l = track[track.length - 1];
  return [l[1], l[2], l[3]];
}

// ---- the MiG pair: head-on toward the Phantoms, then a hard break turn ----
const mig1 = new Path(0, -500, 6000, 3200, 180, 185).fly(34, 0, -3).fly(24, -12, -12).fly(20, -4, -5).pts;

// ---- the lead Phantom: head-on pass, vertical "yo-yo", then pursuit of MiG 1 ----
const leadOwn = new Path(0, 300, -8000, 4200, 0, 230).fly(34, 0, -8).fly(10, 9, 70).fly(8, 13, -80).pts;

/** Seconds the Phantom trails the MiG along its path once in firing position (about 1.1 km at MiG speed). */
const TRAIL_LAG = 6;

/**
 * After the yo-yo the Phantom rejoins the fight on the MiG's own path,
 * TRAIL_LAG seconds behind it. A Hermite curve bridges the two, matching
 * velocity at both ends, and its duration is chosen so the Phantom holds a
 * steady speed through the bridge.
 */
function bridgeToPursuit(
  own: Pt[],
  quarry: Pt[],
  lag = TRAIL_LAG,
  altOffset = 150,
  until = 80,
): { track: Pt[]; joinT: number } {
  const [t0, x0, y0, a0] = own[own.length - 1];
  const [tp, xp, yp, ap] = own[own.length - 2];
  const v0: [number, number, number] = [(x0 - xp) / (t0 - tp), (y0 - yp) / (t0 - tp), (a0 - ap) / (t0 - tp)];
  const ghost = (t: number): [number, number, number] => {
    const [x, y, alt] = sample(quarry, t - lag);
    return [x, y, alt + altOffset];
  };
  const speed0 = Math.hypot(...v0);
  // The Hermite curve's shape is sampled densely, then walked by distance so
  // speed eases evenly from the entry speed to the pursuit speed. The bridge
  // duration follows from the curve length and those two speeds.
  let T = 8;
  let track: Pt[] = [];
  for (let iter = 0; iter < 10; iter++) {
    const t1 = t0 + T;
    const p1 = ghost(t1);
    const q = ghost(t1 + 0.5);
    const v1: [number, number, number] = [(q[0] - p1[0]) * 2, (q[1] - p1[1]) * 2, (q[2] - p1[2]) * 2];
    const speed1 = Math.hypot(...v1);
    const N = 400;
    const pts: [number, number, number][] = [];
    const cum: number[] = [0];
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      const pt = [0, 1, 2].map((i) => h00 * [x0, y0, a0][i] + h10 * T * v0[i] + h01 * p1[i] + h11 * T * v1[i]) as [number, number, number];
      if (k > 0) {
        const pr = pts[k - 1];
        cum.push(cum[k - 1] + Math.hypot(pt[0] - pr[0], pt[1] - pr[1], pt[2] - pr[2]));
      }
      pts.push(pt);
    }
    const length = cum[N];
    const nextT = Math.max(4, Math.round(((2 * length) / (speed0 + speed1)) * 2) / 2);
    track = [];
    let j = 0;
    for (let k = 1; k <= nextT * 2; k++) {
      const tau = k / 2;
      // distance flown with speed changing linearly across the bridge
      const dist = Math.min(length, speed0 * tau + ((speed1 - speed0) * tau * tau) / (2 * nextT));
      while (j < N - 1 && cum[j + 1] < dist) j++;
      const f = (dist - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const a = pts[j];
      const c = pts[j + 1];
      track.push([t0 + tau, a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f]);
    }
    if (nextT === T) break;
    T = nextT;
  }
  const joinT = t0 + T;
  const out = own.concat(track);
  for (let t = joinT + 0.5; t <= until; t += 0.5) {
    const [x, y, alt] = ghost(t);
    // after the shot the Phantom climbs away
    out.push([t, x, y, alt + Math.max(0, t - (joinT + 8)) * 40]);
  }
  return { track: out, joinT };
}

const { track: lead, joinT } = bridgeToPursuit(leadOwn, mig1);

/** Continue a track from its last point: fly on, turning and climbing, for `seconds`. */
function continueTrack(track: Pt[], seconds: number, turn: number, climb: number, speed: number): Pt[] {
  const [t, x, y, alt] = track[track.length - 1];
  const [, px, py] = track[track.length - 2];
  const hdg = (Math.atan2(x - px, y - py) * 180) / Math.PI;
  return track.concat(new Path(t, x, y, alt, hdg, speed).fly(seconds, turn, climb).pts.slice(1));
}
/** Flight time the Phantom fires, and the missile's impact. */
const MISSILE_AT = Math.round((joinT + 1.5) * 2) / 2;
const MISSILE_FLIGHT = 2.8;
const IMPACT_AT = MISSILE_AT + MISSILE_FLIGHT;
/** Timeline seconds lost to the explanatory hold before the fight. */
const HOLD_S = 4;
/** Timeline seconds the aircraft wait while the head-to-head comparison is on screen. */
const COMPARE_S = 12;
const tl = (flight: number) => Math.round((flight + HOLD_S + COMPARE_S) * 2) / 2;

// ---- the wingman holds a loose position on the lead ----
const wing: Pt[] = lead.map(([t]) => {
  const [x0, y0, a0] = sample(lead, t - 2.2);
  const [x1, y1] = sample(lead, t - 1.7);
  const hx = x1 - x0;
  const hy = y1 - y0;
  const l = Math.hypot(hx, hy) || 1;
  // 300 m to the right of the lead's track, slightly higher
  return [t, x0 + (hy / l) * 300, y0 - (hx / l) * 300, a0 + 150];
});

// ---- MiG 2: after the pass it turns in behind a Phantom, closes to cannon range, fires, then dives away ----
/** Seconds MiG 2 trails the Phantom along its path when firing: about 420 m at Phantom speed. */
const MIG_GUN_LAG = 1.8;
const mig2Own = new Path(0, -950, 6700, 3350, 180, 185).fly(36, 0, -3).fly(8, -11, -10).pts;
const mig2Attack = bridgeToPursuit(mig2Own, lead, MIG_GUN_LAG, 0, 0);
/** Flight time of MiG 2's first cannon burst, just after it settles on the wingman's tail. */
const MIG_GUNS_AT = Math.round((mig2Attack.joinT + 0.5) * 2) / 2;
const mig2Path = mig2Attack.track.filter(([t]) => t <= MIG_GUNS_AT + 3);
const mig2 = continueTrack(continueTrack(mig2Path, 3, 14, -30, 245), 25, 6, -70, 250);

const thin = (track: Pt[]) => track.filter((_, i) => i % 2 === 0);

const aircraft: AerialAircraft[] = [
  { id: 'f4_lead', name: 'F-4C (Olds and Croker)', factionId: US, airframe: 'f4', track: thin(lead) },
  { id: 'f4_wing', name: 'F-4C wingman', factionId: US, airframe: 'f4', track: thin(wing) },
  { id: 'mig_1', name: 'MiG-17', factionId: VN, airframe: 'mig17', track: thin(mig1), destroyedAt: IMPACT_AT },
  { id: 'mig_2', name: 'MiG-17', factionId: VN, airframe: 'mig17', track: thin(mig2) },
];

const KEP: [number, number] = [106.262, 21.395];

const kf = (id: string, time: number, caption: string, extra: Partial<Keyframe>): Keyframe => ({
  id, time, lng: KEP[0], lat: KEP[1], zoom: 8.2, pitch: 0, bearing: 0, caption, ...extra,
});

export function dogfightScenario(): Scenario {
  return {
    name: 'Phantom versus MiG-17',
    subtitle: 'Near Kep airfield, North Vietnam · 20 May 1967',
    sources: [
      'Office of Air Force History, Aces and Aerial Victories: The United States Air Force in Southeast Asia, 1965 to 1973 (1976)',
      'Robin Olds, with Christina Olds and Ed Rasimus, Fighter Pilot: The Memoirs of Legendary Ace Robin Olds (2010)',
    ],
    factions: [
      { id: US, name: 'US Air Force', color: '#3a6fc0', affiliation: 'friend' },
      { id: VN, name: 'North Vietnamese Air Force', color: '#c0392b', affiliation: 'hostile' },
    ],
    units: [],
    arrows: [],
    territories: [],
    labels: [
      { id: 'l_hanoi', text: 'Hanoi', facility: 'town', lat: 21.028, lng: 105.854, size: 12, color: '#1c1f22', appearAt: 0 },
      { id: 'l_kep', text: 'Kep airfield (approx.)', facility: 'airbase', lat: KEP[1], lng: KEP[0], size: 12, color: '#1c1f22', appearAt: 0 },
    ],
    strikes: [],
    keyframes: [
      kf('k1', 0, 'On 20 May 1967, American F-4 Phantoms were escorting a strike near Kep airfield, northeast of Hanoi.', { zoom: 7.6 }),
      kf('k2', 7, 'What follows is an illustrative reconstruction. The flight paths are drawn to explain the tactics, not taken from recorded data.', {
        aerial: { mode: 'chase', target: 'mig_1', distanceM: 70 },
      }),
      kf('k3', 14, 'Colonel Robin Olds led the flight, with Lieutenant Stephen Croker in the rear seat running the radar.', {
        aerial: { mode: 'chase', target: 'f4_lead' },
      }),
      kf('k3c', 21, 'Two very different fighters. The Phantom was big, fast and heavily armed with missiles; the MiG-17 was small, light and built around its guns.', {
        aerial: {
          mode: 'compare',
          target: 'f4_lead',
          secondary: 'mig_1',
          compare: {
            rows: [
              { label: 'Crew', values: ['2', '1'], bars: [2, 1] },
              { label: 'Length', values: ['17.8 m', '11.3 m'], bars: [17.8, 11.3] },
              { label: 'Top speed', values: ['About Mach 2.2 at altitude', 'About 1,150 km/h'], bars: [2370, 1150] },
              { label: 'Engine thrust', values: ['Two engines, about 150 kN', 'One engine, about 33 kN'], bars: [150, 33] },
              { label: 'Service ceiling', values: ['About 17,000 m', 'About 16,600 m'], bars: [17000, 16600] },
              { label: 'Armament', values: ['Up to 8 air-to-air missiles, no internal gun', 'Three cannon: one 37 mm, two 23 mm'] },
            ],
            note: 'F-4C and MiG-17F. Approximate published figures; values vary by source, variant and load.',
          },
        },
      }),
      kf('k4', 33, 'Coming the other way were MiG-17s: older, slower jets that could turn tighter than a Phantom, and that carried cannon.', {
        aerial: { mode: 'flyby', target: 'mig_1' },
      }),
      kf('k5', 40, 'The Phantom relied on speed and missiles. In a slow, level turning fight, the advantage belonged to the MiG.', {
        aerial: { mode: 'side', target: 'f4_lead', distanceM: 120 },
      }),
      kf('k6', 50, 'As the fighters passed, the MiGs broke into hard turns, trying to draw the Phantoms into their kind of fight.', {
        aerial: { mode: 'chase', target: 'mig_1', distanceM: 70 },
      }),
      kf('k7', 57, 'Olds would not follow it into a flat turn. He climbed, rolled and came back down, trading height for position.', {
        aerial: { mode: 'side', target: 'f4_lead', distanceM: 260 },
      }),
      kf('kguns', tl(MIG_GUNS_AT) - 2, 'A second MiG slid in behind one of the Phantoms and opened fire with its cannon.', {
        aerial: { mode: 'chase', target: 'mig_2', distanceM: 40 },
      }),
      kf('kbreak', tl(MIG_GUNS_AT) + 3.5, 'The Phantoms kept their speed up, and the MiG broke away.', {
        aerial: { mode: 'side', target: 'mig_2', distanceM: 90 },
      }),
      kf('k7b', tl(MIG_GUNS_AT) + 8.5, 'He kept his speed up and swung wide, setting himself up behind the MiG as it came out of its turn.', {
        aerial: { mode: 'chase', target: 'f4_lead', distanceM: 85 },
      }),
      kf('k8', tl(MISSILE_AT) - 4, 'The maneuver left the Phantom behind the MiG and slightly above it, in firing position.', {
        aerial: { mode: 'chase', target: 'f4_lead', distanceM: 130 },
      }),
      kf('k9', tl(MISSILE_AT) - 0.5, 'From behind the MiG, he fired a missile.', {
        aerial: { mode: 'chase', target: 'f4_lead', distanceM: 110 },
      }),
      kf('k10', tl(IMPACT_AT), 'The MiG was hit and fell away trailing smoke.', {
        aerial: { mode: 'overview', target: 'mig_1', distanceM: 420, orbitDegPerS: 10 },
      }),
      kf('k11', tl(IMPACT_AT) + 7, 'Olds and Croker were credited with two MiG-17s that day.', {
        aerial: { mode: 'overview', target: 'f4_lead', secondary: 'f4_wing', distanceM: 700, orbitDegPerS: 6 },
      }),
    ],
    aerial: {
      origin: KEP,
      style: 'cinematic',
      // the real hills and rivers around Kep; imagery shows the present-day landscape
      terrain: 'real',
      terrainTexture: 'satellite',
      terrainRadiusKm: 30,
      aircraft,
      weapons: [
        { id: 'w_guns_1', kind: 'guns', from: 'mig_2', target: 'f4_lead', time: MIG_GUNS_AT, duration: 0.9 },
        { id: 'w_guns_2', kind: 'guns', from: 'mig_2', target: 'f4_lead', time: MIG_GUNS_AT + 1.5, duration: 0.9 },
        { id: 'w_missile', kind: 'missile', from: 'f4_lead', target: 'mig_1', time: MISSILE_AT, duration: MISSILE_FLIGHT, label: 'Missile' },
      ],
      // freeze the aircraft just before the merge while the caption explains the matchup
      holds: [
        // the comparison: aircraft wait while the stats are on screen
        { at: 21, seconds: COMPARE_S },
        { at: 30 + COMPARE_S, seconds: HOLD_S },
      ],
    },
    environment: { startHour: 15, endHour: 15.3, date: '1967-05-20', utcOffset: 7, windDirDeg: 200, windKph: 8, haze: 0.15, cloudCover: 0.35 },
    duration: tl(IMPACT_AT) + 15,
  };
}
