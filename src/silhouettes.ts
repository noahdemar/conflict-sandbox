import type { Unit, UnitType } from './types';

/**
 * Top-down "sticker" silhouettes, nose pointing up (north) in a 100x100 box.
 * `body` is the filled outline (gets the thick white sticker border),
 * `detail` is drawn on top in a darker tone (canopies, hatches, engines).
 */
interface Shape {
  body: string;
  detail: string;
  scale: number;
}

/** Every icon in the shared library, by key. */
export type SilhouetteKey = keyof typeof SHAPES;

const SHAPES = {
  jet: {
    scale: 1.15,
    body: 'M50 3 L54 22 L56 40 L93 60 L93 68 L57 62 L56 78 L69 88 L69 94 L50 90 L31 94 L31 88 L44 78 L43 62 L7 68 L7 60 L44 40 L46 22 Z',
    detail:
      '<path d="M50 12 Q53 18 52.5 30 L47.5 30 Q47 18 50 12 Z" fill="#2c3a44"/><path d="M47 44 L53 44 L53 74 L47 74 Z" opacity=".25"/><path d="M20 62 L44 52 L44 55 L20 65 Z M80 62 L56 52 L56 55 L80 65 Z" opacity=".2"/>',
  },
  // F-15: long radome, bubble canopy, boxy intakes beside the cockpit, cropped-delta
  // wing with clipped tips, twin fins, big swept stabilators wider than the fuselage,
  // round twin nozzles
  f15: {
    scale: 1.18,
    body:
      'M50 2 Q52.5 9 53.5 20 L55 26 L61 29 L62 41 L90 61 L91 70 L62 72 L62 80 L79 89 L79 96 L60 94 L58 99 L52 99 L50 96 ' +
      'L48 99 L42 99 L40 94 L21 96 L21 89 L38 80 L38 72 L9 70 L10 61 L38 41 L39 29 L45 26 L46.5 20 Q47.5 9 50 2 Z',
    detail:
      // canopy bubble
      '<path d="M50 11 Q53 15 53 24 Q50 28 47 24 Q47 15 50 11 Z" fill="#2c3a44"/>' +
      // rectangular intake mouths
      '<path d="M55.5 27 L61 29.5 L61 33 L55.5 31 Z M44.5 27 L39 29.5 L39 33 L44.5 31 Z" fill="#2c3a44" opacity=".75"/>' +
      // flat upper fuselage between the engines
      '<path d="M45 33 L55 33 L57 90 L43 90 Z" opacity=".18"/>' +
      // twin vertical fins, slightly canted out
      '<path d="M57 72 L59 71 L62 93 L60 94 Z M43 72 L41 71 L38 93 L40 94 Z" fill="#2c3a44" opacity=".6"/>' +
      // engine nozzles
      '<ellipse cx="45" cy="95.5" rx="3" ry="3.5" fill="#2c3a44" opacity=".7"/><ellipse cx="55" cy="95.5" rx="3" ry="3.5" fill="#2c3a44" opacity=".7"/>' +
      // wing and stabilator panel lines
      '<path d="M64 46 L88 63 M36 46 L12 63 M64 83 L77 91 M36 83 L23 91" stroke="#2c3a44" stroke-width="1" opacity=".25" fill="none"/>',
  },
  // F-22: chined faceted nose, caret intakes, diamond wing (swept leading edge,
  // forward-swept trailing edge), large outward-canted fins, diamond stabilators
  // tucked right behind the wing, flat rectangular nozzles
  f22: {
    scale: 1.2,
    body:
      'M50 2 L53.5 12 L56 25 L61 29 L63 40 L94 66 L93 71 L66 78 L82 88 L82 93 L69 95 L64 93 L58 97 L55 99 L45 99 L42 97 ' +
      'L36 93 L31 95 L18 93 L18 88 L34 78 L7 71 L6 66 L37 40 L39 29 L44 25 L46.5 12 Z',
    detail:
      // long frameless canopy
      '<path d="M50 9 L52.5 15 L53 28 L50 31 L47 28 L47.5 15 Z" fill="#2c3a44"/>' +
      // caret intakes
      '<path d="M56 26 L61 29 L62 37 L57 33 Z M44 26 L39 29 L38 37 L43 33 Z" fill="#2c3a44" opacity=".75"/>' +
      // chine edges running from the nose into the wing
      '<path d="M53.5 12 L57 26 L63 40 M46.5 12 L43 26 L37 40" stroke="#2c3a44" stroke-width="1" opacity=".3" fill="none"/>' +
      // twin fins, canted outward, seen from above
      '<path d="M56 60 L60 58 L69 84 L65 86 Z M44 60 L40 58 L31 84 L35 86 Z" fill="#2c3a44" opacity=".55"/>' +
      // body blending into the wing
      '<path d="M44 34 L56 34 L60 78 L40 78 Z" opacity=".16"/>' +
      // flat two-dimensional nozzles
      '<path d="M44 92 L49 92 L49 98 L45 98 Z M51 92 L56 92 L55 98 L51 98 Z" fill="#2c3a44" opacity=".7"/>',
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
  // single dismounted person, top-down: helmet, shoulders, weapon forward
  soldier: {
    scale: 0.42,
    body: 'M50 28 a15 15 0 1 1 -0.1 0 Z M26 50 Q26 40 38 40 L62 40 Q74 40 74 50 L74 62 Q74 72 62 72 L38 72 Q26 72 26 62 Z M60 6 L66 6 L66 44 L60 44 Z',
    detail: '<circle cx="50" cy="43" r="10" opacity=".35"/><rect x="59" y="6" width="8" height="10" rx="1"/>',
  },
  dog: {
    scale: 0.4,
    body: 'M44 14 Q50 4 56 14 L58 30 Q64 34 64 44 L63 78 Q62 88 50 90 Q38 88 37 78 L36 44 Q36 34 42 30 Z M48 88 L52 88 L51 98 L49 98 Z',
    detail: '<circle cx="46" cy="16" r="2"/><circle cx="54" cy="16" r="2"/><rect x="38" y="44" width="24" height="8" rx="3" opacity=".4"/>',
  },
  satellite: {
    scale: 1.1,
    body: 'M40 36 L60 36 L60 64 L40 64 Z M2 42 L34 42 L34 58 L2 58 Z M66 42 L98 42 L98 58 L66 58 Z M34 48 L40 48 L40 52 L34 52 Z M60 48 L66 48 L66 52 L60 52 Z',
    detail:
      '<path d="M10 42 V58 M18 42 V58 M26 42 V58 M74 42 V58 M82 42 V58 M90 42 V58" stroke="rgba(20,24,28,.5)" stroke-width="1.2"/><circle cx="50" cy="50" r="6" opacity=".45"/><path d="M50 36 V26" stroke="rgba(20,24,28,.6)" stroke-width="2"/>',
  },
  // tailless stealth UAV
  flyingwing: {
    scale: 1.1,
    body: 'M50 26 Q56 30 60 38 L96 60 L92 66 L66 60 L58 68 L50 64 L42 68 L34 60 L8 66 L4 60 L40 38 Q44 30 50 26 Z',
    detail: '<path d="M46 36 Q50 32 54 36 L53 46 L47 46 Z" opacity=".35"/>',
  },
  // ---- medieval ----
  // dismounted men-at-arms in a close block, polearms and lances held forward
  menatarms: {
    scale: 1.25,
    body:
      'M8 36 Q8 30 14 30 L86 30 Q92 30 92 36 L92 80 Q92 86 86 86 L14 86 Q8 86 8 80 Z ' +
      'M17 8 L21 8 L21 30 L17 30 Z M33 12 L37 12 L37 30 L33 30 Z M48 6 L52 6 L52 30 L48 30 Z M63 12 L67 12 L67 30 L63 30 Z M79 8 L83 8 L83 30 L79 30 Z',
    detail:
      // helmets in ranks
      '<g opacity=".5"><circle cx="19" cy="42" r="5.5"/><circle cx="35" cy="42" r="5.5"/><circle cx="50" cy="42" r="5.5"/><circle cx="65" cy="42" r="5.5"/><circle cx="81" cy="42" r="5.5"/>' +
      '<circle cx="27" cy="58" r="5.5"/><circle cx="43" cy="58" r="5.5"/><circle cx="58" cy="58" r="5.5"/><circle cx="73" cy="58" r="5.5"/>' +
      '<circle cx="19" cy="74" r="5.5"/><circle cx="35" cy="74" r="5.5"/><circle cx="50" cy="74" r="5.5"/><circle cx="65" cy="74" r="5.5"/><circle cx="81" cy="74" r="5.5"/></g>' +
      // steel points
      '<path d="M19 3 L22 9 L16 9 Z M35 7 L38 13 L32 13 Z M50 1 L53 7 L47 7 Z M65 7 L68 13 L62 13 Z M81 3 L84 9 L78 9 Z" fill="#d9dde0"/>',
  },
  // a loose line of longbowmen, bows drawn toward the front, stakes planted ahead
  archers: {
    scale: 1.2,
    body:
      'M10 52 a9 9 0 1 1 -0.1 0 Z M30 44 a9 9 0 1 1 -0.1 0 Z M50 52 a9 9 0 1 1 -0.1 0 Z M70 44 a9 9 0 1 1 -0.1 0 Z M90 52 a9 9 0 1 1 -0.1 0 Z ' +
      'M20 72 a9 9 0 1 1 -0.1 0 Z M40 76 a9 9 0 1 1 -0.1 0 Z M60 72 a9 9 0 1 1 -0.1 0 Z M80 76 a9 9 0 1 1 -0.1 0 Z',
    detail:
      // bows: shallow arcs in front of each archer in the front rank
      '<path d="M1 50 Q10 36 19 50 M21 42 Q30 28 39 42 M41 50 Q50 36 59 50 M61 42 Q70 28 79 42 M81 50 Q90 36 99 50" stroke="#3a2a18" stroke-width="2.4" fill="none"/>' +
      // arrows nocked
      '<path d="M10 58 L10 38 M30 50 L30 30 M50 58 L50 38 M70 50 L70 30 M90 58 L90 38" stroke="#3a2a18" stroke-width="1.2" opacity=".8"/>' +
      // sharpened stakes angled at the enemy
      '<path d="M4 20 L14 8 M24 16 L32 4 M46 20 L54 8 M66 16 L74 4 M86 20 L96 8" stroke="#5a4028" stroke-width="2.6" stroke-linecap="round"/>',
  },
  // mounted knight seen from above: horse with caparison, rider, couched lance
  cavalry: {
    scale: 1.05,
    body:
      'M45 8 Q50 2 55 8 L56 24 Q66 28 67 40 L66 72 Q64 84 56 88 L53 98 L47 98 L44 88 Q36 84 34 72 L33 40 Q34 28 44 24 Z ' +
      'M63 0 L67 0 L67 44 L63 44 Z',
    detail:
      // caparison and rider
      '<path d="M36 42 Q50 36 64 42 L63 72 Q50 80 37 72 Z" opacity=".25"/>' +
      '<circle cx="50" cy="50" r="9" fill="#d9dde0" opacity=".9"/><circle cx="50" cy="50" r="5" opacity=".55"/>' +
      // shield
      '<path d="M36 46 L44 44 L44 56 Q40 60 36 56 Z" opacity=".65"/>' +
      // lance tip
      '<path d="M65 -3 L68 4 L62 4 Z" fill="#d9dde0"/>',
  },
  // commander's position: household knights around a swallow-tailed standard
  banner: {
    scale: 1.1,
    body:
      'M16 66 a34 22 0 1 0 68 0 a34 22 0 1 0 -68 0 Z M47 6 L51 6 L51 62 L47 62 Z M51 8 L86 14 L78 22 L86 30 L51 34 Z',
    detail:
      '<g opacity=".45"><circle cx="30" cy="66" r="5"/><circle cx="44" cy="74" r="5"/><circle cx="58" cy="74" r="5"/><circle cx="70" cy="64" r="5"/></g>' +
      '<path d="M55 14 L72 17 L55 26 Z" fill="#fff" opacity=".5"/>',
  },
  // wagons and packhorses of the baggage train
  baggage: {
    scale: 1.1,
    body:
      'M10 22 Q10 18 14 18 L40 18 Q44 18 44 22 L44 46 Q44 50 40 50 L14 50 Q10 50 10 46 Z ' +
      'M56 22 Q56 18 60 18 L86 18 Q90 18 90 22 L90 46 Q90 50 86 50 L60 50 Q56 50 56 46 Z ' +
      'M33 60 Q33 56 37 56 L63 56 Q67 56 67 60 L67 84 Q67 88 63 88 L37 88 Q33 88 33 84 Z',
    detail:
      '<g opacity=".35"><path d="M14 26 H40 M14 34 H40 M14 42 H40 M60 26 H86 M60 34 H86 M60 42 H86 M37 64 H63 M37 72 H63 M37 80 H63" stroke="rgba(20,24,28,.6)" stroke-width="2"/></g>' +
      '<g fill="#3a2a18"><circle cx="10" cy="26" r="3"/><circle cx="10" cy="42" r="3"/><circle cx="44" cy="26" r="3"/><circle cx="44" cy="42" r="3"/>' +
      '<circle cx="56" cy="26" r="3"/><circle cx="56" cy="42" r="3"/><circle cx="90" cy="26" r="3"/><circle cx="90" cy="42" r="3"/></g>',
  },
  // ---- people ----
  officer: {
    scale: 0.42,
    body: 'M50 28 a15 15 0 1 1 -0.1 0 Z M26 50 Q26 40 38 40 L62 40 Q74 40 74 50 L74 62 Q74 72 62 72 L38 72 Q26 72 26 62 Z',
    detail: '<circle cx="50" cy="43" r="10" opacity=".35"/><path d="M50 50 L52.5 56 L59 56 L54 60 L56 66 L50 62 L44 66 L46 60 L41 56 L47.5 56 Z" fill="#f2e6b8"/>',
  },
  medic: {
    scale: 0.42,
    body: 'M50 28 a15 15 0 1 1 -0.1 0 Z M26 50 Q26 40 38 40 L62 40 Q74 40 74 50 L74 62 Q74 72 62 72 L38 72 Q26 72 26 62 Z',
    detail: '<rect x="40" y="48" width="20" height="20" rx="3" fill="#fff"/><path d="M47.5 50 h5 v6.5 h5.5 v5 h-5.5 v5 h-5 v-5 h-5.5 v-5 h5.5 Z" fill="#c62828"/>',
  },
  sniper: {
    scale: 0.45,
    body: 'M50 22 a8 8 0 1 1 -0.1 0 Z M40 42 Q40 38 44 38 L56 38 Q60 38 60 42 L60 86 Q60 92 54 92 L46 92 Q40 92 40 86 Z M48.5 2 L51.5 2 L51.5 30 L48.5 30 Z',
    detail: '<rect x="45" y="12" width="10" height="4" rx="1"/><path d="M40 60 L28 84 M60 60 L72 84" stroke="rgba(20,24,28,.5)" stroke-width="5" stroke-linecap="round"/>',
  },
  civilians: {
    scale: 0.9,
    body:
      'M30 14 a9 9 0 1 1 -0.1 0 Z M62 20 a9 9 0 1 1 -0.1 0 Z M44 40 a9 9 0 1 1 -0.1 0 Z M76 46 a9 9 0 1 1 -0.1 0 Z ' +
      'M22 50 a9 9 0 1 1 -0.1 0 Z M56 66 a9 9 0 1 1 -0.1 0 Z M32 76 a9 9 0 1 1 -0.1 0 Z',
    detail: '<g opacity=".3"><circle cx="30" cy="23" r="4"/><circle cx="62" cy="29" r="4"/><circle cx="44" cy="49" r="4"/><circle cx="76" cy="55" r="4"/><circle cx="22" cy="59" r="4"/><circle cx="56" cy="75" r="4"/><circle cx="32" cy="85" r="4"/></g>',
  },

  // ---- ground vehicles ----
  apc: {
    scale: 0.95,
    body: 'M38 8 Q50 2 62 8 L66 20 L66 92 L34 92 L34 20 Z',
    detail:
      '<g fill="#2c3a44"><rect x="28" y="22" width="7" height="12" rx="2"/><rect x="28" y="40" width="7" height="12" rx="2"/><rect x="28" y="58" width="7" height="12" rx="2"/><rect x="28" y="76" width="7" height="12" rx="2"/>' +
      '<rect x="65" y="22" width="7" height="12" rx="2"/><rect x="65" y="40" width="7" height="12" rx="2"/><rect x="65" y="58" width="7" height="12" rx="2"/><rect x="65" y="76" width="7" height="12" rx="2"/></g>' +
      '<rect x="43" y="30" width="14" height="14" rx="3"/><rect x="40" y="62" width="20" height="22" opacity=".25"/>',
  },
  jeep: {
    scale: 0.7,
    body: 'M38 20 Q38 14 44 14 L56 14 Q62 14 62 20 L62 84 Q62 88 58 88 L42 88 Q38 88 38 84 Z',
    detail: '<rect x="40" y="30" width="20" height="6" fill="#2c3a44"/><circle cx="45" cy="48" r="4"/><circle cx="55" cy="48" r="4"/><rect x="41" y="62" width="18" height="20" opacity=".25"/>',
  },
  spg: {
    scale: 1,
    body: 'M30 22 L70 22 L70 94 L30 94 Z M48 0 L52 0 L52 52 L48 52 Z',
    detail: '<path d="M30 22 L36 22 L36 94 L30 94 Z M64 22 L70 22 L70 94 L64 94 Z" opacity=".35"/><rect x="37" y="48" width="26" height="38" rx="3"/>',
  },
  mortar: {
    scale: 0.6,
    body: 'M50 38 a22 22 0 1 1 -0.1 0 Z M46 6 L54 6 L54 60 L46 60 Z',
    detail: '<circle cx="50" cy="60" r="12" opacity=".35"/><path d="M50 30 L30 50 M50 30 L70 50" stroke="rgba(20,24,28,.6)" stroke-width="3"/>',
  },
  aagun: {
    scale: 0.75,
    body: 'M50 40 a24 24 0 1 1 -0.1 0 Z M40 4 L44 4 L44 60 L40 60 Z M56 4 L60 4 L60 60 L56 60 Z',
    detail: '<rect x="40" y="56" width="20" height="16" rx="3"/><circle cx="50" cy="64" r="20" fill="none" stroke="rgba(20,24,28,.4)" stroke-width="2"/>',
  },
  sam: {
    scale: 1,
    body: 'M34 10 L66 10 L66 94 L34 94 Z',
    detail: '<rect x="36" y="12" width="28" height="12" fill="#2c3a44"/><g fill="#e8e3d6" opacity=".9"><rect x="38" y="34" width="10" height="54" rx="4"/><rect x="52" y="34" width="10" height="54" rx="4"/></g>',
  },
  radar: {
    scale: 1,
    body: 'M36 32 L64 32 L64 94 L36 94 Z M14 8 Q50 -4 86 8 L82 22 Q50 12 18 22 Z',
    detail: '<rect x="46" y="18" width="8" height="18"/><rect x="38" y="80" width="24" height="12" fill="#2c3a44"/>',
  },
  engineer: {
    scale: 1,
    body: 'M32 26 L68 26 L68 94 L32 94 Z M20 8 L80 8 L80 18 L20 18 Z M46 18 L54 18 L54 26 L46 26 Z',
    detail: '<path d="M32 26 L38 26 L38 94 L32 94 Z M62 26 L68 26 L68 94 L62 94 Z" opacity=".35"/><rect x="40" y="52" width="20" height="28" rx="2"/>',
  },
  ambulance: {
    scale: 0.9,
    body: 'M36 12 Q36 8 40 8 L60 8 Q64 8 64 12 L64 90 L36 90 Z',
    detail: '<rect x="39" y="12" width="22" height="8" fill="#2c3a44"/><rect x="39" y="30" width="22" height="56" fill="#fff" opacity=".85"/><path d="M47 46 h6 v8 h8 v6 h-8 v8 h-6 v-8 h-8 v-6 h8 Z" fill="#c62828"/>',
  },
  tanker: {
    scale: 0.95,
    body: 'M38 4 L62 4 L62 26 L38 26 Z M34 32 Q34 28 40 28 L60 28 Q66 28 66 32 L66 90 Q66 96 60 96 L40 96 Q34 96 34 90 Z',
    detail: '<rect x="40" y="7" width="20" height="7" fill="#2c3a44"/><path d="M34 46 H66 M34 64 H66 M34 82 H66" stroke="rgba(20,24,28,.35)" stroke-width="2"/>',
  },
  motorcycle: {
    scale: 0.4,
    body: 'M46 10 L54 10 L56 40 L56 70 L54 92 L46 92 L44 70 L44 40 Z M30 28 L70 28 L70 34 L30 34 Z',
    detail: '<ellipse cx="50" cy="16" rx="4" ry="6" fill="#2c3a44"/><ellipse cx="50" cy="86" rx="4" ry="6" fill="#2c3a44"/><circle cx="50" cy="52" r="7" opacity=".45"/>',
  },

  // ---- aircraft and missiles ----
  transport: {
    scale: 1.3,
    body: 'M46 6 Q50 0 54 6 L55 36 L96 40 L96 48 L55 50 L54 80 L74 84 L74 91 L50 90 L26 91 L26 84 L46 80 L45 50 L4 48 L4 40 L45 36 Z',
    detail: '<g fill="#2c3a44"><rect x="18" y="36" width="5" height="10" rx="2"/><rect x="32" y="36" width="5" height="11" rx="2"/><rect x="63" y="36" width="5" height="11" rx="2"/><rect x="77" y="36" width="5" height="10" rx="2"/></g><path d="M48 8 L52 8 L52 16 L48 16 Z" fill="#2c3a44"/>',
  },
  airliner: {
    scale: 1.3,
    body: 'M47 6 Q50 0 53 6 L54 34 L94 58 L94 64 L54 54 L53 82 L66 90 L66 95 L50 92 L34 95 L34 90 L47 82 L46 54 L6 64 L6 58 L46 34 Z',
    detail: '<ellipse cx="30" cy="52" rx="3" ry="6" fill="#2c3a44"/><ellipse cx="70" cy="52" rx="3" ry="6" fill="#2c3a44"/><path d="M50 12 V78" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 3" opacity=".7"/>',
  },
  attackheli: {
    scale: 1,
    body: 'M47 8 Q50 2 53 8 L55 40 L70 44 L70 50 L55 52 L53 88 L60 92 L60 96 L40 96 L40 92 L47 88 L45 52 L30 50 L30 44 L45 40 Z',
    detail: '<path d="M47 12 L53 12 L53 30 L47 30 Z" fill="#2c3a44"/><circle cx="50" cy="44" r="42" fill="none" stroke="rgba(20,24,28,.25)" stroke-width="2"/><g fill="#2c3a44"><rect x="31" y="50" width="4" height="8"/><rect x="65" y="50" width="4" height="8"/></g>',
  },
  cruisemissile: {
    scale: 0.7,
    body: 'M48 4 Q50 0 52 4 L53 60 L66 70 L66 74 L53 72 L53 88 L60 94 L60 97 L40 97 L40 94 L47 88 L47 72 L34 74 L34 70 L47 60 Z',
    detail: '<path d="M48 6 L52 6 L52 14 L48 14 Z" fill="#2c3a44"/>',
  },

  // ---- ships ----
  carrier: {
    scale: 1.5,
    body: 'M40 4 L64 4 L68 30 L70 96 L32 96 L30 40 L22 20 Z',
    detail: '<rect x="62" y="48" width="6" height="18" fill="#2c3a44"/><path d="M26 22 L60 90" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 4" opacity=".7"/><path d="M48 8 V92" stroke="#fff" stroke-width="1" stroke-dasharray="3 5" opacity=".45"/>',
  },
  submarine: {
    scale: 1.1,
    body: 'M50 2 Q60 10 60 30 L60 80 Q60 96 50 98 Q40 96 40 80 L40 30 Q40 10 50 2 Z',
    detail: '<ellipse cx="50" cy="36" rx="5" ry="9" fill="#2c3a44"/><path d="M42 88 L58 88" stroke="rgba(20,24,28,.6)" stroke-width="3"/>',
  },
  patrolboat: {
    scale: 0.75,
    body: 'M50 8 Q62 24 62 44 L61 90 L39 90 L38 44 Q38 24 50 8 Z',
    detail: '<rect x="43" y="46" width="14" height="20" rx="2" fill="#2c3a44"/><circle cx="50" cy="30" r="4"/>',
  },
  landingcraft: {
    scale: 0.95,
    body: 'M30 10 L70 10 L70 92 L30 92 Z',
    detail: '<path d="M32 14 H68 M32 20 H68" stroke="rgba(20,24,28,.45)" stroke-width="2"/><rect x="36" y="26" width="28" height="44" opacity=".2"/><rect x="38" y="76" width="24" height="12" fill="#2c3a44"/>',
  },
  cargoship: {
    scale: 1.35,
    body: 'M50 2 Q66 14 66 34 L66 94 L34 94 L34 34 Q34 14 50 2 Z',
    detail: '<g opacity=".45"><rect x="38" y="28" width="11" height="12"/><rect x="51" y="28" width="11" height="12"/><rect x="38" y="44" width="11" height="12"/><rect x="51" y="44" width="11" height="12"/><rect x="38" y="60" width="11" height="12"/><rect x="51" y="60" width="11" height="12"/></g><rect x="38" y="78" width="24" height="12" fill="#2c3a44"/>',
  },

  // ---- structures ----
  bunker: {
    scale: 0.9,
    body: 'M20 30 Q20 20 30 20 L70 20 Q80 20 80 30 L80 80 L20 80 Z',
    detail: '<rect x="32" y="26" width="36" height="6" fill="#2c3a44"/><path d="M26 44 H74 M26 60 H74" stroke="rgba(20,24,28,.3)" stroke-width="2"/>',
  },
  checkpoint: {
    scale: 0.9,
    body: 'M8 38 L30 38 L30 72 L8 72 Z M70 38 L92 38 L92 72 L70 72 Z M30 52 L70 52 L70 58 L30 58 Z',
    detail: '<path d="M36 52 L42 58 M48 52 L54 58 M60 52 L66 58" stroke="#c62828" stroke-width="3"/><rect x="12" y="42" width="14" height="8" fill="#2c3a44"/><rect x="74" y="42" width="14" height="8" fill="#2c3a44"/>',
  },
  camp: {
    scale: 1,
    body: 'M30 10 L48 28 L30 46 L12 28 Z M70 10 L88 28 L70 46 L52 28 Z M50 52 L70 72 L50 92 L30 72 Z',
    detail: '<path d="M30 10 V46 M70 10 V46 M50 52 V92" stroke="rgba(20,24,28,.45)" stroke-width="2"/>',
  },
  fort: {
    scale: 1.2,
    body: 'M50 4 L62 28 L90 26 L74 50 L90 74 L62 72 L50 96 L38 72 L10 74 L26 50 L10 26 L38 28 Z',
    detail: '<rect x="36" y="36" width="28" height="28" opacity=".3"/><rect x="44" y="44" width="12" height="12" fill="#2c3a44"/>',
  },

  // ---- pre-modern armies ----
  pikemen: {
    scale: 1.25,
    body:
      'M14 40 L86 40 L86 92 L14 92 Z M19 0 L21 0 L21 40 L19 40 Z M34 4 L36 4 L36 40 L34 40 Z M49 0 L51 0 L51 40 L49 40 Z M64 4 L66 4 L66 40 L64 40 Z M79 0 L81 0 L81 40 L79 40 Z',
    detail: '<g opacity=".45"><circle cx="24" cy="52" r="5"/><circle cx="42" cy="52" r="5"/><circle cx="58" cy="52" r="5"/><circle cx="76" cy="52" r="5"/><circle cx="24" cy="68" r="5"/><circle cx="42" cy="68" r="5"/><circle cx="58" cy="68" r="5"/><circle cx="76" cy="68" r="5"/><circle cx="24" cy="84" r="5"/><circle cx="42" cy="84" r="5"/><circle cx="58" cy="84" r="5"/><circle cx="76" cy="84" r="5"/></g>',
  },
  musketeers: {
    scale: 1.2,
    body:
      'M8 40 Q8 34 14 34 L86 34 Q92 34 92 40 L92 64 Q92 70 86 70 L14 70 Q8 70 8 64 Z ' +
      'M17 18 L20 18 L20 34 L17 34 Z M33 18 L36 18 L36 34 L33 34 Z M49 18 L52 18 L52 34 L49 34 Z M65 18 L68 18 L68 34 L65 34 Z M81 18 L84 18 L84 34 L81 34 Z',
    detail: '<g opacity=".45"><circle cx="18" cy="44" r="5"/><circle cx="34" cy="44" r="5"/><circle cx="50" cy="44" r="5"/><circle cx="66" cy="44" r="5"/><circle cx="82" cy="44" r="5"/><circle cx="26" cy="60" r="5"/><circle cx="42" cy="60" r="5"/><circle cx="58" cy="60" r="5"/><circle cx="74" cy="60" r="5"/></g>',
  },
  spearmen: {
    scale: 1.2,
    body:
      'M16 52 a11 11 0 1 1 -0.1 0 Z M38 52 a11 11 0 1 1 -0.1 0 Z M60 52 a11 11 0 1 1 -0.1 0 Z M82 52 a11 11 0 1 1 -0.1 0 Z ' +
      'M16 10 L18 10 L18 52 L16 52 Z M38 6 L40 6 L40 52 L38 52 Z M60 10 L62 10 L62 52 L60 52 Z M82 6 L84 6 L84 52 L82 52 Z',
    detail: '<g opacity=".4"><circle cx="16" cy="63" r="5"/><circle cx="38" cy="63" r="5"/><circle cx="60" cy="63" r="5"/><circle cx="82" cy="63" r="5"/></g><g opacity=".3"><circle cx="27" cy="84" r="6"/><circle cx="49" cy="84" r="6"/><circle cx="71" cy="84" r="6"/></g>',
  },
  cannon: {
    scale: 0.8,
    body: 'M46 2 L54 2 L55 50 L45 50 Z M30 44 L70 44 L70 56 L30 56 Z M47 56 L53 56 L56 96 L44 96 Z',
    detail: '<g fill="#3a2a18"><rect x="24" y="36" width="8" height="28" rx="3"/><rect x="68" y="36" width="8" height="28" rx="3"/></g><circle cx="50" cy="6" r="3" fill="#2c3a44"/>',
  },
  siege: {
    scale: 1,
    body: 'M24 46 L76 46 L76 94 L24 94 Z M47 0 L53 0 L53 60 L47 60 Z',
    detail: '<path d="M24 46 L76 94 M76 46 L24 94" stroke="rgba(20,24,28,.35)" stroke-width="3"/><rect x="40" y="62" width="20" height="16" fill="#3a2a18"/><circle cx="50" cy="6" r="5" opacity=".6"/>',
  },
  chariot: {
    scale: 0.9,
    body: 'M34 4 L44 4 L45 40 L33 40 Z M56 4 L66 4 L67 40 L55 40 Z M48 40 L52 40 L52 60 L48 60 Z M30 60 L70 60 Q70 90 50 94 Q30 90 30 60 Z',
    detail: '<g fill="#3a2a18"><rect x="22" y="66" width="7" height="20" rx="3"/><rect x="71" y="66" width="7" height="20" rx="3"/></g><circle cx="50" cy="74" r="7" opacity=".45"/>',
  },
  sailingship: {
    scale: 1.3,
    body: 'M50 2 Q64 20 64 50 Q64 84 54 96 L46 96 Q36 84 36 50 Q36 20 50 2 Z',
    detail: '<path d="M24 30 Q50 22 76 30 L76 35 Q50 27 24 35 Z M20 52 Q50 44 80 52 L80 57 Q50 49 20 57 Z M26 74 Q50 66 74 74 L74 79 Q50 71 26 79 Z" fill="#f3ead6" opacity=".95"/>',
  },
  galley: {
    scale: 1.25,
    body: 'M50 2 Q60 16 60 40 L60 88 Q58 96 50 98 Q42 96 40 88 L40 40 Q40 16 50 2 Z',
    detail: '<path d="M40 30 L24 36 M40 42 L24 48 M40 54 L24 60 M40 66 L24 72 M40 78 L24 84 M60 30 L76 36 M60 42 L76 48 M60 54 L76 60 M60 66 L76 72 M60 78 L76 84" stroke="#3a2a18" stroke-width="2.4" stroke-linecap="round"/>',
  },
  hq: {
    scale: 1,
    body: 'M20 30 L80 30 L80 80 L20 80 Z',
    detail: '<path d="M20 30 L50 12 L80 30 Z" opacity=".35"/><rect x="42" y="56" width="16" height="24" opacity=".35"/>',
  },
} satisfies Record<string, Shape>;

const BY_TYPE: Record<UnitType, SilhouetteKey> = {
  infantry: 'troops',
  armor: 'tank',
  artillery: 'howitzer',
  air: 'jet',
  naval: 'ship',
  missile: 'launcher',
  hq: 'hq',
};

export const isIconKey = (k: string): k is SilhouetteKey => Object.prototype.hasOwnProperty.call(SHAPES, k);

/**
 * Common names an author (or an AI assistant) might use for an icon, mapped to
 * the library key that draws it.
 */
export const ICON_ALIASES: Record<string, SilhouetteKey> = {
  fighter: 'jet', aircraft: 'jet', plane: 'jet', helicopter: 'heli', uav: 'drone', ucav: 'drone',
  cargoplane: 'transport', c130: 'gunship', awacs: 'transport', missile: 'cruisemissile',
  infantry: 'troops', squad: 'troops', platoon: 'troops', person: 'soldier', rifleman: 'soldier',
  commander: 'officer', leader: 'officer', doctor: 'medic', refugees: 'civilians', crowd: 'civilians',
  mbt: 'tank', armor: 'tank', armour: 'tank', bmp: 'ifv', btr: 'apc', humvee: 'jeep', car: 'jeep', pickup: 'truck',
  technical: 'truck', lorry: 'truck', artillery: 'howitzer', selfpropelledgun: 'spg', mlrs: 'launcher',
  rocketlauncher: 'launcher', airdefense: 'sam', airdefence: 'sam', antiaircraft: 'aagun', bulldozer: 'engineer',
  fueltruck: 'tanker', warship: 'ship', destroyer: 'ship', frigate: 'ship', cruiser: 'ship', corvette: 'ship',
  aircraftcarrier: 'carrier', sub: 'submarine', boat: 'patrolboat', freighter: 'cargoship',
  headquarters: 'hq', commandpost: 'hq', base: 'camp', tents: 'camp', castle: 'fort', fortress: 'fort',
  knights: 'menatarms', swordsmen: 'menatarms', longbowmen: 'archers', bowmen: 'archers', crossbowmen: 'archers',
  horsemen: 'cavalry', knight: 'cavalry', hoplites: 'spearmen', legionaries: 'spearmen', shieldwall: 'spearmen',
  catapult: 'siege', trebuchet: 'siege', wagon: 'baggage', supply: 'baggage', standard: 'banner', galleon: 'sailingship',
  manofwar: 'sailingship', trireme: 'galley',
};

const normalize = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Library key for a requested icon name (key or alias), or null if the library has nothing for it. */
export function resolveIconName(requested: string): SilhouetteKey | null {
  if (isIconKey(requested)) return requested;
  const n = normalize(requested);
  if (isIconKey(n)) return n;
  return ICON_ALIASES[n] ?? null;
}

/** Icon chosen from the unit's name and roster name alone, falling back to its type. */
function iconFromName(u: Unit, n: string): SilhouetteKey {
  if (u.type === 'air') {
    if (/satellite|sat\b|satcom/.test(n)) return 'satellite';
    if (/f-?15|strike eagle/.test(n)) return 'f15';
    if (/f-?22|raptor/.test(n)) return 'f22';
    if (/rq-?170|sentinel|flying ?wing|stealth uav/.test(n)) return 'flyingwing';
    if (/cruise missile|tomahawk|kalibr|storm shadow/.test(n)) return 'cruisemissile';
    if (/mh-?47|ch-?47|chinook/.test(n)) return 'heli';
    if (/ah-?64|apache|ka-?52|mi-?28|cobra|tiger/.test(n)) return 'attackheli';
    if (/ac-?130|gunship/.test(n)) return 'gunship';
    if (/c-?130|c-?17|a400|il-?76|transport|awacs|cargo/.test(n)) return 'transport';
    if (/airliner|boeing 7|airbus|passenger/.test(n)) return 'airliner';
    if (/heli|mi-?\d|black ?hawk|[um]h-?60/.test(n)) return 'heli';
    if (/mq-?\d|reaper|predator|drone|uav|shahed|bayraktar/.test(n)) return 'drone';
    if (/b-?52|b-?2\b|b-?21|bomber|tu-?\d/.test(n)) return 'bomber';
    return 'jet';
  }
  if (u.type === 'naval') {
    if (/carrier/.test(n)) return 'carrier';
    if (/submarine|\bsub\b|u-?boat/.test(n)) return 'submarine';
    if (/patrol|fast attack|speedboat|rib\b/.test(n)) return 'patrolboat';
    if (/landing craft|lcac|lcu|amphibious/.test(n)) return 'landingcraft';
    if (/cargo|freighter|tanker ship|merchant/.test(n)) return 'cargoship';
    if (/galleon|ship of the line|man-of-war|frigate \(sail|sailing/.test(n)) return 'sailingship';
    if (/galley|trireme|longship/.test(n)) return 'galley';
    return 'ship';
  }
  // pre-modern arms first, before the modern name patterns below
  if (/longbow|archer|bowmen|crossbow/.test(n)) return 'archers';
  if (/\bmounted\b|cavalry|horsemen|lancers|hussars|dragoons/.test(n)) return 'cavalry';
  if (/pikemen|\bpikes?\b/.test(n)) return 'pikemen';
  if (/musket|arquebus|redcoats|line infantry/.test(n)) return 'musketeers';
  if (/hoplite|phalanx|legion|spearmen|shield ?wall/.test(n)) return 'spearmen';
  if (/men-at-arms|man-at-arms|knights|billmen|footmen|swordsmen/.test(n)) return 'menatarms';
  if (/trebuchet|catapult|ballista|siege engine/.test(n)) return 'siege';
  if (/chariot/.test(n)) return 'chariot';
  if (/cannon|culverin|field gun|napoleon/.test(n)) return 'cannon';
  if (/baggage|wagon/.test(n)) return 'baggage';
  if (/banner|standard|\bking\b|constable|marshal/.test(n)) return 'banner';
  if (/\bk-?9\b|dog/.test(n)) return 'dog';
  if (/medic|corpsman|doctor/.test(n)) return 'medic';
  if (/sniper|marksman/.test(n)) return 'sniper';
  if (/officer|commander|general|colonel|captain/.test(n)) return 'officer';
  if (/civilian|refugee|crowd|protest|villager/.test(n)) return 'civilians';
  if (/operator|seal\b|interpreter|courier|occupant|combatant|guard|hvt|rifleman|person/.test(n)) return 'soldier';
  if (/ambulance/.test(n)) return 'ambulance';
  if (/fuel|tanker truck/.test(n)) return 'tanker';
  if (/bulldozer|engineer vehicle|sapper|breacher/.test(n)) return 'engineer';
  if (/radar/.test(n)) return 'radar';
  if (/s-?300|s-?400|patriot|sam\b|air defen[cs]e|pantsir|tor\b|buk/.test(n)) return 'sam';
  if (/zu-?23|shilka|gepard|anti-?aircraft|aa gun/.test(n)) return 'aagun';
  if (/mortar/.test(n)) return 'mortar';
  if (/btr|stryker|boxer|lav\b|8x8|wheeled apc/.test(n)) return 'apc';
  if (/bmp|ifv|apc|bradley|m113|warrior/.test(n)) return 'ifv';
  if (/humvee|jeep|light vehicle|gaz|uaz|jltv/.test(n)) return 'jeep';
  if (/motorcycle|motorbike|dirt bike/.test(n)) return 'motorcycle';
  if (/technical|truck|convoy|pickup/.test(n)) return 'truck';
  if (/himars|mlrs|grad|bm-?\d|launcher/.test(n)) return 'launcher';
  if (/paladin|m109|2s19|pzh|self-propelled|caesar|krab/.test(n)) return 'spg';
  if (/howitzer|d-?30|m777|battery|bty/.test(n)) return 'howitzer';
  if (/tank|t-?\d\d|abrams|leopard|challenger|merkava/.test(n)) return 'tank';
  if (/bunker|pillbox/.test(n)) return 'bunker';
  if (/checkpoint|roadblock/.test(n)) return 'checkpoint';
  if (/camp|bivouac|encampment/.test(n)) return 'camp';
  if (/fort|castle|citadel/.test(n)) return 'fort';
  return BY_TYPE[u.type];
}

/**
 * Pick a unit's icon: its own `icon`, else its roster entry's `icon`, else a
 * match on its name, else the generic icon for its type. Unknown icon names
 * fall through to the name match and type fallback (see iconFallbacks).
 */
export function silhouetteFor(u: Unit, roster?: string | { name?: string; icon?: string }): SilhouetteKey {
  const entry = typeof roster === 'string' ? { name: roster } : roster;
  for (const requested of [u.icon, entry?.icon]) {
    const key = requested ? resolveIconName(requested) : null;
    if (key) return key;
  }
  return iconFromName(u, `${u.name} ${entry?.name ?? ''}`.toLowerCase());
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
