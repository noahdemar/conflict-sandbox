import type { Affiliation, Faction, UnitType } from './types';

/**
 * NATO APP-6 inspired unit glyphs drawn as SVG inside a framed box.
 * viewBox is 40x30 — the classic symbol frame aspect ratio.
 */
const GLYPHS: Record<UnitType, string> = {
  // Infantry: crossed diagonals
  infantry:
    '<line x1="6" y1="4" x2="34" y2="26"/><line x1="34" y1="4" x2="6" y2="26"/>',
  // Armor: oval
  armor: '<ellipse cx="20" cy="15" rx="11" ry="7"/>',
  // Artillery: filled dot
  artillery: '<circle cx="20" cy="15" r="5" fill="currentColor" stroke="none"/>',
  // Air force: swept wing
  air: '<path d="M6 22 L20 7 L34 22" fill="none"/>',
  // Naval: anchor
  naval:
    '<circle cx="20" cy="9" r="2.5" fill="none"/><line x1="20" y1="11.5" x2="20" y2="24"/><line x1="14" y1="15" x2="26" y2="15"/><path d="M11 19 Q11 25 20 25 Q29 25 29 19" fill="none"/>',
  // Missile / rocket artillery
  missile:
    '<path d="M20 5 L24 13 L24 22 L16 22 L16 13 Z" fill="currentColor" stroke="none"/><path d="M16 22 L13 26 M24 22 L27 26" fill="none"/>',
  // HQ / command post: flag
  hq: '<line x1="12" y1="5" x2="12" y2="26"/><path d="M12 6 L28 6 L25 11 L28 16 L12 16 Z" fill="currentColor" stroke="none"/>',
};

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  infantry: 'Infantry',
  armor: 'Armor',
  artillery: 'Artillery',
  air: 'Air Wing',
  naval: 'Naval',
  missile: 'Missiles',
  hq: 'HQ',
};

export function unitGlyphSvg(type: UnitType): string {
  return `<svg viewBox="0 0 40 30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[type]}</svg>`;
}

/**
 * Frame shape per affiliation (viewBox 48x40): friend = rectangle,
 * hostile = diamond, neutral = square, unknown = rounded quatrefoil-ish circle.
 * `inner` is the box the 40x30 glyph is fitted into.
 */
const FRAMES: Record<Affiliation, { shape: string; inner: [number, number, number, number] }> = {
  friend: { shape: '<rect x="3" y="7" width="42" height="26"/>', inner: [7, 10, 34, 20] },
  hostile: { shape: '<path d="M24 1 L46 20 L24 39 L2 20 Z"/>', inner: [10, 11, 28, 18] },
  neutral: { shape: '<rect x="5" y="1" width="38" height="38"/>', inner: [10, 9, 28, 22] },
  unknown: { shape: '<circle cx="24" cy="20" r="18"/>', inner: [11, 11, 26, 18] },
};

/** Standard light fills for affiliation frames. */
export const APP6_FILL: Record<Affiliation, string> = {
  friend: '#80e0ff',
  hostile: '#ff8080',
  neutral: '#aaffaa',
  unknown: '#ffff80',
};

export function factionAffiliation(f: Faction | undefined, factions: Faction[]): Affiliation {
  if (!f) return 'unknown';
  if (f.affiliation) return f.affiliation;
  if (/civil|neutral|refugee|un\b/i.test(f.name)) return 'neutral';
  return factions[0]?.id === f.id ? 'friend' : 'hostile';
}

/** Full unit symbol: affiliation frame filled with faction color + type glyph. */
export function unitSymbolSvg(type: UnitType, aff: Affiliation, color: string): string {
  const { shape, inner } = FRAMES[aff];
  const [x, y, w, h] = inner;
  return `<svg viewBox="0 0 48 40" class="sym sym-${aff}">` +
    `<g fill="${color}" stroke="#0d0b08" stroke-width="2.2" stroke-linejoin="miter">${shape}</g>` +
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 40 30" fill="none" stroke="#0d0b08" color="#0d0b08" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[type]}</svg>` +
    `</svg>`;
}
