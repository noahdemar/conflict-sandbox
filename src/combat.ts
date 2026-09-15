import type { LngLat } from './geo';
import { strikeLaunchAt } from './realism';
import { expandStrikes } from './particles';
import type { Scenario, Strike, Unit } from './types';

/**
 * Derived combat state over time: unit strength, ammunition, and per-side
 * losses. Everything is computed from the timeline so scrubbing stays exact.
 */

const metersBetween = (a: LngLat, b: LngLat) => {
  const cosLat = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320 * cosLat, (a[1] - b[1]) * 111320);
};

/**
 * Strength 0..100 at time t: blast damage from rounds landing near the unit,
 * capped while crippled, zero once destroyed.
 */
export function unitStrength(
  s: Scenario,
  u: Unit,
  t: number,
  /** Individual rounds (salvos already expanded) with resolved impact points */
  rounds: Strike[],
  poseAt: (u: Unit, t: number) => LngLat,
): number {
  if (u.destroyedAt !== undefined && t >= u.destroyedAt) return 0;
  let hp = 100;
  for (const x of rounds) {
    if (x.appearAt > t || x.targetStrikeId || x.fromUnitId === u.id) continue;
    const radius = Math.max(40, 70 * x.size);
    const d = metersBetween(poseAt(u, x.appearAt), [x.lng, x.lat]);
    if (d < radius) hp -= x.size * 35 * (1 - d / radius);
  }
  const crippled = (s.effects ?? []).some(
    (fx) => fx.unitId === u.id && fx.kind === 'wounded' && t >= fx.start,
  );
  if (crippled) hp = Math.min(hp, 40);
  // a unit that will be destroyed visibly degrades in its final seconds
  if (u.destroyedAt !== undefined && t > u.destroyedAt - 1.5) {
    hp = Math.min(hp, 100 * ((u.destroyedAt - t) / 1.5));
  }
  return Math.max(u.destroyedAt !== undefined ? 0 : 8, Math.min(100, hp));
}

const ammoSchedules = new WeakMap<Scenario, Map<string, number[]>>();
/** Ammunition 0..100 at time t, or null for units that never fire. */
export function unitAmmo(s: Scenario, u: Unit, t: number): number | null {
  let schedules = ammoSchedules.get(s);
  if (!schedules) {
    schedules = new Map();
    for (const x of expandStrikes(s.strikes)) {
      if (!x.fromUnitId) continue;
      const times = schedules.get(x.fromUnitId) ?? [];
      times.push(strikeLaunchAt(s, x));
      schedules.set(x.fromUnitId, times);
    }
    ammoSchedules.set(s, schedules);
  }
  const rounds = schedules.get(u.id) ?? [];
  const dry = (s.effects ?? []).find((fx) => fx.unitId === u.id && fx.kind === 'noammo');
  if (!rounds.length && !dry) return null;
  if (dry && t >= dry.start) return 0;
  if (!rounds.length) return 100;
  const fired = rounds.filter((at) => at <= t).length;
  // units that run dry end empty; others finish with a reserve
  const floor = dry ? 0 : 25;
  return 100 - ((100 - floor) * fired) / rounds.length;
}

/** Destroyed units per faction at time t. */
export function lossesByFaction(s: Scenario, t: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of s.factions) out.set(f.id, 0);
  for (const u of s.units) {
    if (u.destroyedAt !== undefined && t >= u.destroyedAt) {
      out.set(u.factionId, (out.get(u.factionId) ?? 0) + 1);
    }
  }
  return out;
}
