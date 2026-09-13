import type { Scenario, StatusEffect, StatusKind } from './types';

/** Display metadata for each status effect. Icons are 24x24 stroke SVG bodies. */
export const STATUS_META: Record<
  StatusKind,
  { name: string; badge: string; color: string; icon: string }
> = {
  radio: {
    name: 'Transmitting radio',
    badge: 'TRANSMITTING',
    color: '#2f9e6b',
    icon: '<rect x="7" y="9" width="10" height="12" rx="2"/><path d="M10 9 L8 3"/><circle cx="12" cy="17" r="1.6"/><path d="M10 12.5h4"/>',
  },
  datalink: {
    name: 'Datalink',
    badge: 'DATALINK',
    color: '#1aa6d9',
    icon: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11 L15.8 7 M8.2 13 L15.8 17"/>',
  },
  jamming: {
    name: 'Jamming',
    badge: 'JAMMING',
    color: '#b04ce0',
    icon: '<path d="M2 12 L5 7 L8 17 L11 5 L14 19 L17 8 L20 15 L22 12"/>',
  },
  panic: {
    name: 'Panic',
    badge: 'PANIC',
    color: '#f08c00',
    icon: '<path d="M12 3 L22 20 H2 Z"/><path d="M12 9 V14"/><circle cx="12" cy="17" r="0.9"/>',
  },
  wounded: {
    name: 'Wounded / crippled',
    badge: 'CRIPPLED',
    color: '#e03131',
    icon: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  },
  noammo: {
    name: 'Out of ammo',
    badge: 'OUT OF AMMO',
    color: '#868e96',
    icon: '<rect x="8" y="6" width="8" height="15" rx="1.5"/><path d="M10 3h4v3h-4z"/><path d="M5 21 L19 4"/>',
  },
};

export const statusIconSvg = (kind: StatusKind) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STATUS_META[kind].icon}</svg>`;

/** Effects active at time t, with a 0..1 envelope that eases in and out. */
export function activeEffects(
  s: Scenario,
  t: number,
): { fx: StatusEffect; env: number; age: number }[] {
  const out: { fx: StatusEffect; env: number; age: number }[] = [];
  for (const fx of s.effects ?? []) {
    const age = t - fx.start;
    if (age < 0 || age > fx.duration) continue;
    const fade = Math.min(0.4, fx.duration / 4);
    const env = Math.min(1, age / fade, (fx.duration - age) / fade);
    out.push({ fx, env, age });
  }
  return out;
}
