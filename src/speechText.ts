/**
 * Rewrites caption text into a form TTS engines read naturally. Captions
 * stay as written on screen; only the spoken copy goes through this.
 *
 * Fixes the usual TTS failure modes:
 *  - dotted acronyms ("U.S.", "a.m.") read letter-by-letter with pauses
 *  - initialisms read as words ("SDF" → "sdf") or words read as letters
 *  - dashes, "~", "%", "/" and model numbers ("F-15E", "T-72s")
 *  - decimals, ranges, units and "c." / "approx." abbreviations
 */

/** Uppercase proper names that are words rather than acronyms. */
const SAY_AS_WORD: Record<string, string> = {
  GRAD: 'Grad',
};

/** Whole-token replacements applied before generic rules. */
type Rep = string | ((match: string, ...groups: string[]) => string);
const REPLACE: [RegExp, Rep][] = [
  [/\bbin Laden\b/gi, 'bin Lahden'],
  [/\bU\.S\.A\.?/g, 'U S A'],
  [/\bU\.S\.(?=\s|$|[,;:)—–-])/g, 'U S'],
  [/\bU\.K\.(?=\s|$|[,;:)—–-])/g, 'U K'],
  [/\bU\.N\.(?=\s|$|[,;:)—–-])/g, 'U N'],
  [/\b([ap])\.m\./gi, (_m, p) => `${p.toUpperCase()} M`],
  [/\bapprox\./gi, 'approximately'],
  [/\bc\.\s?(?=\d)/g, 'circa '],
  [/\bvs\.?(?=\s)/gi, 'versus'],
  [/\betc\./gi, 'et cetera'],
  [/\be\.g\.,?/gi, 'for example,'],
  [/\bi\.e\.,?/gi, 'that is,'],
  [/\bNo\.\s?(?=\d)/g, 'number '],
  [/\bSt\.\s(?=[A-Z])/g, 'Saint '],
  [/\bMt\.\s(?=[A-Z])/g, 'Mount '],
  [/\bGen\.\s(?=[A-Z])/g, 'General '],
  [/\bCol\.\s(?=[A-Z])/g, 'Colonel '],
  [/\bLt\.\s(?=[A-Z])/g, 'Lieutenant '],
  [/\bSgt\.\s(?=[A-Z])/g, 'Sergeant '],
  [/\bkm\b/g, 'kilometers'],
  [/\bmm\b/g, 'millimeter'],
  [/\bkts?\b/g, 'knots'],
  [/\bft\b/g, 'feet'],
  [/\bmph\b/g, 'miles per hour'],
];

function spellLetters(s: string) {
  return s.split('').join(' ');
}

/** "F-15E" → "F 15 E", "T-72s" → "T 72s", "MQ-9" → "M Q 9", "AC-130" → "A C 130". */
function modelDesignator(prefix: string, num: string, suffix: string) {
  const p = SAY_AS_WORD[prefix] ?? spellLetters(prefix);
  const plural = suffix.endsWith('s');
  const letters = plural ? suffix.slice(0, -1) : suffix;
  const sfx = letters ? ` ${spellLetters(letters.toUpperCase())}${plural ? "'s" : ''}` : plural ? 's' : '';
  return `${p} ${num}${sfx}`;
}

export function toSpokenText(input: string): string {
  let t = input;

  for (const [re, rep] of REPLACE) t = t.replace(re, rep as (m: string, ...g: string[]) => string);

  // remaining dotted initialisms: "D.C." → "D C"
  t = t.replace(/\b((?:[A-Za-z]\.){2,})/g, (m) => spellLetters(m.replace(/\./g, '').toUpperCase()));

  // military/equipment designators before generic acronym handling
  t = t.replace(/\b([A-Z]{1,4})-(\d{1,4})([A-Za-z]{0,2})\b/g, (_m, a, n, s) => modelDesignator(a, n, s));

  // bare caps tokens: pronounceable-list words, otherwise spelled out
  t = t.replace(/\b([A-Z]{2,}s?)\b/g, (m) => {
    if (SAY_AS_WORD[m]) return SAY_AS_WORD[m];
    const plural = /[A-Z]s$/.test(m);
    const core = plural ? m.slice(0, -1) : m;
    if (SAY_AS_WORD[core]) return SAY_AS_WORD[core] + (plural ? 's' : '');
    return spellLetters(core) + (plural ? "'s" : '');
  });

  // numbers and symbols
  t = t.replace(/~\s?(?=\d)/g, 'about ');
  t = t.replace(/(\d)\s?%/g, '$1 percent');
  t = t.replace(/(\d)\s?°\s?([NSEW])\b/g, '$1 degrees $2');
  t = t.replace(/(\d)\s?°/g, '$1 degrees');
  t = t.replace(/\$(\d[\d,.]*)\s?(million|billion|trillion)?/g, (_m, n, u) => `${n}${u ? ' ' + u : ''} dollars`);
  t = t.replace(/(\d),(\d{3})\b/g, '$1$2');
  t = t.replace(/(\d)\.(\d+)/g, (_m, a, b) => `${a} point ${b.split('').join(' ')}`);
  t = t.replace(/(\d+)\s?[-–]\s?(\d+)/g, '$1 to $2');
  t = t.replace(/(\w)\s?\/\s?(\w)/g, '$1 and $2');
  t = t.replace(/\s&\s/g, ' and ');
  t = t.replace(/#(\d)/g, 'number $1');
  // H-hour style times: 0100, 23:30
  t = t.replace(/\b([01]\d|2[0-3]):?([0-5]\d)\s?(?:hrs|hours|Z|local)\b/g, (_m, h, m) =>
    `${h === '00' ? 'zero' : +h} ${m === '00' ? 'hundred' : m}`,
  );

  // punctuation that TTS stumbles over or reads aloud
  t = t.replace(/\s*[—–]\s*/g, ', ');
  t = t.replace(/\s-\s/g, ', ');
  t = t.replace(/[()[\]]/g, ', ');
  t = t.replace(/["“”]/g, '');
  t = t.replace(/[‘’]/g, "'");
  t = t.replace(/…/g, '...');
  t = t.replace(/\s*,\s*(,\s*)+/g, ', ');
  t = t.replace(/\s+([,.;:!?])/g, '$1');
  t = t.replace(/^[,\s]+|[,\s]+$/g, '');
  t = t.replace(/\s{2,}/g, ' ');

  return t;
}
