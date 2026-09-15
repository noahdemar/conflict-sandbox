import type { AerialAircraft, AerialScene } from '../types';

/** World vector in the local aerial frame: x east, y up, z south (three.js right-handed). */
export type V3 = [number, number, number];

const G = 9.81;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** Track point [t, east, north, alt] to world coordinates. */
const toWorld = (p: [number, number, number, number]): V3 => [p[1], p[3], -p[2]];

/** Flight seconds at a timeline time, after explanatory holds are taken out. */
export function flightTime(scene: AerialScene, t: number): number {
  let out = t;
  for (const h of scene.holds ?? []) out -= Math.min(Math.max(t - h.at, 0), h.seconds);
  return out;
}

/** Whether the aircraft are frozen at this timeline time. */
export const isHeld = (scene: AerialScene, t: number) => (scene.holds ?? []).some((h) => t > h.at && t < h.at + h.seconds);

/** Catmull-Rom position along a timed track (clamped at the ends). */
function trackPos(track: AerialAircraft['track'], t: number): V3 {
  const n = track.length;
  if (n === 0) return [0, 0, 0];
  if (t <= track[0][0]) {
    // extrapolate backwards along the first leg so early camera shots still see motion
    if (n === 1) return toWorld(track[0]);
    const a = toWorld(track[0]);
    const b = toWorld(track[1]);
    const dt = track[1][0] - track[0][0] || 1;
    return add(a, scale(sub(b, a), (t - track[0][0]) / dt));
  }
  if (t >= track[n - 1][0]) {
    if (n === 1) return toWorld(track[0]);
    const a = toWorld(track[n - 2]);
    const b = toWorld(track[n - 1]);
    const dt = track[n - 1][0] - track[n - 2][0] || 1;
    return add(b, scale(sub(b, a), (t - track[n - 1][0]) / dt));
  }
  let i = 0;
  while (i < n - 2 && t > track[i + 1][0]) i++;
  const p0 = toWorld(track[Math.max(0, i - 1)]);
  const p1 = toWorld(track[i]);
  const p2 = toWorld(track[i + 1]);
  const p3 = toWorld(track[Math.min(n - 1, i + 2)]);
  const u = (t - track[i][0]) / (track[i + 1][0] - track[i][0] || 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (k: 0 | 1 | 2) =>
    0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  return [f(0), f(1), f(2)];
}

export interface Pose {
  pos: V3;
  /** unit vectors: nose, lift (top of the aircraft), right wing */
  fwd: V3;
  up: V3;
  right: V3;
  speed: number;
  /** Aircraft is a falling wreck */
  down: boolean;
  /** Seconds since destruction (0 if intact) */
  sinceHit: number;
}

/** Position and attitude at flight time t: nose along velocity, wings banked into the turn. */
export function poseAt(ac: AerialAircraft, t: number): Pose {
  if (ac.destroyedAt !== undefined && t > ac.destroyedAt) return wreckPose(ac, t);
  return flyingPose(ac, t);
}

function flyingPose(ac: AerialAircraft, t: number): Pose {
  const h = 0.25;
  const p = trackPos(ac.track, t);
  const pa = trackPos(ac.track, t - h);
  const pb = trackPos(ac.track, t + h);
  const vel = scale(sub(pb, pa), 1 / (2 * h));
  // acceleration averaged over a wider window so bank changes stay smooth
  const w = 0.7;
  const qa = trackPos(ac.track, t - w);
  const qb = trackPos(ac.track, t + w);
  const acc = scale(add(sub(qb, p), sub(qa, p)), 1 / (w * w));
  const speed = len(vel);
  const fwd = speed > 1 ? norm(vel) : [1, 0, 0] as V3;
  // lift must balance gravity plus the turning acceleration
  const lift = add(acc, [0, G, 0]);
  let up = sub(lift, scale(fwd, dot(lift, fwd)));
  if (len(up) < 1e-3) up = [0, 1, 0];
  up = norm(up);
  const right = norm(cross(fwd, up));
  return { pos: p, fwd, up, right, speed, down: false, sinceHit: 0 };
}

/** After being hit: keep momentum, fall under gravity, roll and nose over. */
function wreckPose(ac: AerialAircraft, t: number): Pose {
  const t0 = ac.destroyedAt!;
  const start = flyingPose(ac, t0);
  const s = t - t0;
  const v0 = scale(start.fwd, start.speed * 0.8);
  const drag = Math.exp(-s * 0.25);
  const horiz = scale([v0[0], 0, v0[2]], (1 - drag) / 0.25);
  const vertical = v0[1] * s - 0.5 * G * s * s * 0.7;
  const pos: V3 = [start.pos[0] + horiz[0], Math.max(0, start.pos[1] + vertical), start.pos[2] + horiz[2]];
  const vel: V3 = [v0[0] * drag, v0[1] - G * 0.7 * s, v0[2] * drag];
  const fwd = norm(vel);
  // spin about the flight path as it falls
  const roll = s * 2.2;
  const flatRight = norm(cross(fwd, [0, 1, 0]));
  const flatUp = norm(cross(flatRight, fwd));
  const up = norm(add(scale(flatUp, Math.cos(roll)), scale(flatRight, Math.sin(roll))));
  const right = norm(cross(fwd, up));
  return { pos, fwd, up, right, speed: len(vel), down: true, sinceHit: s };
}

/** Where a missile is at flight time t, curving from launch toward the target's position at impact. */
export function missilePos(shooter: AerialAircraft, target: AerialAircraft, launch: number, impact: number, t: number): V3 | null {
  if (t < launch || t > impact) return null;
  const a = flyingPose(shooter, launch);
  const b = poseAt(target, impact).pos;
  const f = (t - launch) / (impact - launch || 1);
  // quadratic bezier: leaves along the shooter's nose, then bends onto the target
  const ctrl = add(a.pos, scale(a.fwd, len(sub(b, a.pos)) * 0.55));
  const m1 = lerp3(a.pos, ctrl, f);
  const m2 = lerp3(ctrl, b, f);
  return lerp3(m1, m2, f);
}
