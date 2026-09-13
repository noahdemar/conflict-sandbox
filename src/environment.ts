import type { Environment } from './types';

/** Local hour (0..24) at timeline time t. Handles scenarios that cross midnight. */
export function hourAt(env: Environment, t: number, duration: number): number {
  let end = env.endHour;
  if (end < env.startHour) end += 24;
  const h = env.startHour + (end - env.startHour) * Math.min(1, Math.max(0, t / Math.max(1, duration)));
  return h % 24;
}

const smooth = (e0: number, e1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/**
 * Lighting at a given hour: `dark` 0 (day) .. 1 (deep night) and `warm` 0..1
 * for golden-hour tint around dawn and dusk.
 */
export function lighting(hour: number): { dark: number; warm: number } {
  const dawn = smooth(4.5, 7, hour);
  const dusk = 1 - smooth(17.5, 20, hour);
  const day = Math.min(dawn, dusk);
  const warm = Math.max(0, 1 - Math.abs(hour - 6.3) / 1.3) + Math.max(0, 1 - Math.abs(hour - 18.7) / 1.3);
  return { dark: 1 - day, warm: Math.min(1, warm) * 0.8 };
}

/** Map-space wind vector (mercator x east, y south) scaled so ~15 km/h ≈ 1. */
export function windVector(env: Environment | undefined): { x: number; y: number } {
  if (!env) return { x: 1, y: -0.35 };
  const b = (env.windDirDeg * Math.PI) / 180;
  const k = Math.min(3, Math.max(0.15, env.windKph / 15));
  return { x: Math.sin(b) * k, y: -Math.cos(b) * k };
}
