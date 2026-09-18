import type { ContentPack } from '../authoring/types';
import type { Period } from '../types';
import { ANCIENT_FORMATIONS, GUNPOWDER_FORMATIONS, INDUSTRIAL_FORMATIONS, MEDIEVAL_FORMATIONS } from './premodern';
import { COLDWAR_MECH_FORCES, MODERN_NATO, MODERN_OPFOR, WW1_WESTERN_FRONT, WW2_COMBINED_ARMS } from './modern';

/**
 * Every content pack, in period order. Packs are published as JSON under
 * public/packs/ (see scripts/export-packs.ts) so an authoring document can
 * pull one in with `include`, and the app can offer them without a fetch.
 */
export const PACKS: ContentPack[] = [
  ANCIENT_FORMATIONS,
  MEDIEVAL_FORMATIONS,
  GUNPOWDER_FORMATIONS,
  INDUSTRIAL_FORMATIONS,
  WW1_WESTERN_FRONT,
  WW2_COMBINED_ARMS,
  COLDWAR_MECH_FORCES,
  MODERN_NATO,
  MODERN_OPFOR,
];

export const packById = (id: string): ContentPack | undefined => PACKS.find((p) => p.id === id);

export const packsForPeriod = (period: Period): ContentPack[] => PACKS.filter((p) => p.period === period);

/**
 * Resolve an `include` reference against the bundled packs. A reference that
 * is not a known pack id (a URL, say) is left to the caller to fetch.
 */
export function bundledPack(ref: string): ContentPack | null {
  return packById(ref.replace(/^\/?packs\//, '').replace(/\.json$/, '')) ?? null;
}
