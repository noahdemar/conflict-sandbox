import type { Unit, UnitType } from './types';

/**
 * Top-down "sticker" silhouettes, nose pointing up (north) in a 100x100 box.
 * `body` is the filled outline (gets the thick white sticker border),
 * `detail` is drawn on top in a darker tone (canopies, hatches, engines).
 */
export type SilhouetteKey =
  | 'jet'
  | 'gunship'
  | 'heli'
  | 'drone'
  | 'bomber'
  | 'tank'
  | 'ifv'
  | 'truck'
  | 'launcher'
  | 'howitzer'
  | 'troops'
  | 'ship'
  | 'hq';

const SHAPES: Record<SilhouetteKey, { body: string; detail: string; scale: number }> = {
  jet: {
    scale: 1.15,
    body: 'M50 3 L54 22 L56 40 L93 60 L93 68 L57 62 L56 78 L69 88 L69 94 L50 90 L31 94 L31 88 L44 78 L43 62 L7 68 L7 60 L44 40 L46 22 Z',
    detail:
      '<path d="M50 12 Q53 18 52.5 30 L47.5 30 Q47 18 50 12 Z" fill="#2c3a44"/><path d="M47 44 L53 44 L53 74 L47 74 Z" opacity=".25"/><path d="M20 62 L44 52 L44 55 L20 65 Z M80 62 L56 52 L56 55 L80 65 Z" opacity=".2"/>',
  },
  gunship: {
    scale: 1.3,
    body: 'M47 7 Q50 1 53 7 L54.5 34 L97 36 L97 44 L54.5 46 L53.5 80 L73 83 L73 90 L50 89 L27 90 L27 83 L46.5 80 L45.5 46 L3 44 L3 36 L45.5 34 Z',
    detail:
      '<rect x="17" y="28" width="5" height="14" rx="2"/><rect x="31" y="29" width="5" height="13" rx="2"/><rect x="64" y="29" width="5" height="13" rx="2"/><rect x="78" y="28" width="5" height="14" rx="2"/><path d="M48 9 Q50 6 52 9 L52 14 L48 14 Z" fill="#2c3a44"/>',
  },
  heli: {
    scale: 1.05,
    body: 'M44 22 Q50 8 56 22 L57 56 Q50 66 43 56 Z M48 60 L52 60 L51.5 90 L48.5 90 Z M38 86 L62 86 L62 91 L38 91 Z M30 40 L43 38 L43 46 L30 48 Z M70 40 L57 38 L57 46 L70 48 Z',
    detail:
      '<path d="M46.5 16 Q50 11 53.5 16 L53.5 26 L46.5 26 Z" fill="#2c3a44"/><circle cx="50" cy="40" r="38" fill="none" stroke="#1d2226" stroke-width="1.2" stroke-dasharray="3 5" opacity=".45"/><path d="M14 36 L86 44 M86 36 L14 44" stroke="#1d2226" stroke-width="2" opacity=".55"/>',
  },
  drone: {
    scale: 1.15,
    body: 'M47.5 12 Q50 5 52.5 12 L53.5 42 L97 45 L97 50 L53.5 52 L52.5 76 L66 90 L63 93 L50 84 L37 93 L34 90 L47.5 76 L46.5 52 L3 50 L3 45 L46.5 42 Z',
    detail: '<circle cx="50" cy="15" r="2.6" fill="#2c3a44"/><rect x="48" y="78" width="4" height="6"/>',
  },
  // B-52 class: long fuselage, shoulder-mounted swept wing, four twin-engine pods
  bomber: {
    scale: 1.55,
    body: 'M50 2 Q53.5 5 53.5 13 L54 34 L97 64 L97 69.5 L54 50 L53.5 81 L67 90 L67 94.5 L51.8 91.5 L50 98 L48.2 91.5 L33 94.5 L33 90 L46.5 81 L46 50 L3 69.5 L3 64 L46 34 L46.5 13 Q46.5 5 50 2 Z',
    detail:
      '<path d="M47.8 7 Q50 4.5 52.2 7 L52.3 11 L47.7 11 Z" fill="#2c3a44"/>' +
      // twin-engine pods, slung ahead of the leading edge
      '<g><rect x="34.2" y="38" width="2.6" height="10" rx="1.2"/><rect x="37.4" y="38" width="2.6" height="10" rx="1.2"/>' +
      '<rect x="60" y="38" width="2.6" height="10" rx="1.2"/><rect x="63.2" y="38" width="2.6" height="10" rx="1.2"/>' +
      '<rect x="20.2" y="47.5" width="2.6" height="10" rx="1.2"/><rect x="23.4" y="47.5" width="2.6" height="10" rx="1.2"/>' +
      '<rect x="74" y="47.5" width="2.6" height="10" rx="1.2"/><rect x="77.2" y="47.5" width="2.6" height="10" rx="1.2"/></g>' +
      // pylons
      '<path d="M37 47 L39 50 M63 47 L61 50 M23 57 L25 59.5 M77 57 L75 59.5" stroke="rgba(20,24,28,.55)" stroke-width="1.2"/>' +
      // wingtip tanks
      '<ellipse cx="11" cy="64.5" rx="1.6" ry="5"/><ellipse cx="89" cy="64.5" rx="1.6" ry="5"/>' +
      // spine / wing root shading
      '<path d="M48.6 16 L51.4 16 L51.4 86 L48.6 86 Z" opacity=".22"/>',
  },
  tank: {
    scale: 1,
    body: 'M33 26 Q33 22 37 22 L63 22 Q67 22 67 26 L67 84 Q67 88 63 88 L37 88 Q33 88 33 84 Z M48.2 2 L51.8 2 L51.8 48 L48.2 48 Z',
    detail:
      '<path d="M33 24 L38 24 L38 86 L33 86 Z M62 24 L67 24 L67 86 L62 86 Z" opacity=".35"/><circle cx="50" cy="56" r="12.5"/><circle cx="54" cy="60" r="3.5" fill="#fff" opacity=".25"/><rect x="48.2" y="10" width="3.6" height="36" fill="currentColor"/>',
  },
  ifv: {
    scale: 0.95,
    body: 'M34 18 Q34 13 40 13 L60 13 Q66 13 66 18 L66 86 L34 86 Z M44 18 L47 18 L47 40 L44 40 Z',
    detail:
      '<path d="M34 16 L39 16 L39 86 L34 86 Z M61 16 L66 16 L66 86 L61 86 Z" opacity=".35"/><rect x="40" y="40" width="13" height="16" rx="3"/><rect x="43" y="64" width="14" height="16" rx="1" opacity=".3"/>',
  },
  truck: {
    scale: 0.9,
    body: 'M36 12 Q36 8 40 8 L60 8 Q64 8 64 12 L64 34 L66 34 L66 90 L34 90 L34 34 L36 34 Z',
    detail: '<rect x="39" y="12" width="22" height="8" fill="#2c3a44"/><rect x="38" y="38" width="24" height="48" opacity=".22"/><rect x="47" y="46" width="6" height="18"/>',
  },
  launcher: {
    scale: 1,
    body: 'M36 8 Q36 4 40 4 L60 4 Q64 4 64 8 L64 26 L67 26 L67 94 L33 94 L33 26 L36 26 Z',
    detail:
      '<rect x="39" y="8" width="22" height="7" fill="#2c3a44"/><rect x="37" y="34" width="26" height="52" rx="1"/><g fill="#fff" opacity=".35"><circle cx="44" cy="42" r="2.4"/><circle cx="50" cy="42" r="2.4"/><circle cx="56" cy="42" r="2.4"/><circle cx="44" cy="50" r="2.4"/><circle cx="50" cy="50" r="2.4"/><circle cx="56" cy="50" r="2.4"/></g>',
  },
  howitzer: {
    scale: 0.95,
    body: 'M48 2 L52 2 L52.5 48 L60 50 L80 94 L74 96 L54 60 L46 60 L26 96 L20 94 L40 50 L47.5 48 Z',
    detail: '<rect x="36" y="44" width="28" height="9" rx="2"/><circle cx="38" cy="58" r="5"/><circle cx="62" cy="58" r="5"/>',
  },
  troops: {
    scale: 1,
    body: 'M50 10 a11 11 0 1 1 -0.1 0 Z M26 44 a11 11 0 1 1 -0.1 0 Z M74 44 a11 11 0 1 1 -0.1 0 Z M36 70 a11 11 0 1 1 -0.1 0 Z M64 70 a11 11 0 1 1 -0.1 0 Z',
    detail:
      '<g opacity=".4"><circle cx="50" cy="21" r="5"/><circle cx="26" cy="55" r="5"/><circle cx="74" cy="55" r="5"/><circle cx="36" cy="81" r="5"/><circle cx="64" cy="81" r="5"/></g>',
  },
  ship: {
    scale: 1.3,
    body: 'M50 2 Q64 22 64 46 L63 92 Q50 98 37 92 L36 46 Q36 22 50 2 Z',
    detail: '<rect x="43" y="40" width="14" height="22" rx="2"/><circle cx="50" cy="26" r="4"/><rect x="45" y="70" width="10" height="14" opacity=".3"/>',
  },
  hq: {
    scale: 1,
    body: 'M20 30 L80 30 L80 80 L20 80 Z',
    detail: '<path d="M20 30 L50 12 L80 30 Z" opacity=".35"/><rect x="42" y="56" width="16" height="24" opacity=".35"/>',
  },
};

const BY_TYPE: Record<UnitType, SilhouetteKey> = {
  infantry: 'troops',
  armor: 'tank',
  artillery: 'howitzer',
  air: 'jet',
  naval: 'ship',
  missile: 'launcher',
  hq: 'hq',
};

/** Pick a silhouette from the unit's name/roster name, falling back to its type. */
export function silhouetteFor(u: Unit, rosterName?: string): SilhouetteKey {
  const n = `${u.name} ${rosterName ?? ''}`.toLowerCase();
  if (u.type === 'air') {
    if (/ac-?130|c-?130|gunship|transport|awacs/.test(n)) return 'gunship';
    if (/ah-?64|apache|heli|mi-?\d|ka-?52|black ?hawk|uh-?60/.test(n)) return 'heli';
    if (/mq-?\d|reaper|predator|drone|uav|shahed|bayraktar/.test(n)) return 'drone';
    if (/b-?52|b-?2\b|b-?21|bomber|tu-?\d/.test(n)) return 'bomber';
    return 'jet';
  }
  if (/bmp|btr|ifv|apc|bradley|m113|stryker/.test(n)) return 'ifv';
  if (/technical|truck|convoy|pickup|civilian/.test(n)) return 'truck';
  if (/himars|mlrs|grad|bm-?\d|launcher|s-?300|s-?400|patriot/.test(n)) return 'launcher';
  if (/howitzer|d-?30|m777|battery|mortar|bty/.test(n)) return 'howitzer';
  if (/tank|t-?\d\d|abrams|leopard/.test(n)) return 'tank';
  return BY_TYPE[u.type];
}

/** Mix a hex color toward neutral steel grey. */
function tint(hex: string, amt: number): string {
  const base = [0x86, 0x8c, 0x90];
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v, i) => Math.round(base[i] + (v - base[i]) * amt)).join(',')})`;
}

/**
 * Full sticker SVG. The heading rotation is applied by the caller on the
 * `.stk-rot` wrapper so the name tag underneath stays upright.
 */
export function silhouetteSvg(key: SilhouetteKey, factionColor: string, destroyed = false): string {
  const { body, detail } = SHAPES[key];
  const fill = destroyed ? '#3b3632' : tint(factionColor, 0.28);
  return (
    `<svg viewBox="-8 -8 116 116" class="stk-svg">` +
    `<path d="${body}" fill="#fff" stroke="#fff" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="${body}" fill="${fill}" stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<g fill="rgba(20,24,28,.55)" color="${fill}">${detail}</g>` +
    `</svg>`
  );
}

/** Flat dark silhouette used as the aircraft's ground shadow. */
export function shadowSvg(key: SilhouetteKey): string {
  return `<svg viewBox="-8 -8 116 116"><path d="${SHAPES[key].body}" fill="#000"/></svg>`;
}

export const silhouetteScale = (key: SilhouetteKey) => SHAPES[key].scale;
