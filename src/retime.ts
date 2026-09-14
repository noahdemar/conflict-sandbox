import type { Scenario } from './types';

/**
 * Insert extra timeline time into a scenario. Each insert `[at, seconds]`
 * pushes every event after `at` later by `seconds`; anything spanning `at`
 * (a movement, an effect) stretches to cover the gap. Used to give narrated
 * shots enough room without desynchronising the action.
 */
export function retimeScenario(s: Scenario, inserts: [number, number][]): Scenario {
  const sorted = [...inserts].sort((a, b) => a[0] - b[0]);
  const warp = (t: number) => {
    let out = t;
    for (const [at, extra] of sorted) if (t > at) out += extra;
    return +out.toFixed(3);
  };
  const span = (start: number, length: number) => warp(start + length) - warp(start);

  return {
    ...s,
    units: s.units.map((u) => ({
      ...u,
      appearAt: warp(u.appearAt),
      ...(u.destroyedAt !== undefined ? { destroyedAt: warp(u.destroyedAt) } : {}),
      ...(u.leavesAt !== undefined ? { leavesAt: warp(u.leavesAt) } : {}),
      ...(u.captureAt !== undefined ? { captureAt: warp(u.captureAt) } : {}),
    })),
    arrows: s.arrows.map((a) => ({
      ...a,
      appearAt: warp(a.appearAt),
      duration: span(a.appearAt, a.duration),
      ...(a.times ? { times: a.times.map(warp) } : {}),
      ...(a.hideAt !== undefined ? { hideAt: warp(a.hideAt) } : {}),
    })),
    territories: s.territories.map((t) => ({ ...t, appearAt: warp(t.appearAt) })),
    labels: s.labels.map((l) => ({ ...l, appearAt: warp(l.appearAt) })),
    strikes: s.strikes.map((x) => ({
      ...x,
      appearAt: warp(x.appearAt),
      ...(x.launchAt !== undefined ? { launchAt: warp(x.launchAt) } : {}),
    })),
    keyframes: s.keyframes.map((k) => ({ ...k, time: warp(k.time) })),
    effects: (s.effects ?? []).map((e) => ({ ...e, start: warp(e.start), duration: span(e.start, e.duration) })),
    ...(s.environment
      ? {
          environment: {
            ...s.environment,
            ...(s.environment.hourKeys
              ? { hourKeys: s.environment.hourKeys.map(([t, h]) => [warp(t), h] as [number, number]) }
              : {}),
          },
        }
      : {}),
    ...(s.duration !== undefined ? { duration: warp(s.duration) } : {}),
  };
}

export const totalInserted = (inserts: [number, number][]) => inserts.reduce((sum, [, e]) => sum + e, 0);
