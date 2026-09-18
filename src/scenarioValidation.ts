import { iconCatalogText } from './iconCatalog';
import Ajv, { type ValidateFunction } from 'ajv';
import { scenarioErrors } from './realism';
import { resolveAuthoring } from './authoring/resolve';
import type { ContentPack } from './authoring/types';
import { bundledPack } from './packs';
import { PERIODS, PERIOD_IDS } from './eras';
import type { Period, RosterEntry, Scenario } from './types';

let validator: Promise<{ any: ValidateFunction; file: ValidateFunction }> | null = null;

/**
 * Compile the published schema once (fetched from the site so it always
 * matches the build). Two validators: `any` accepts anything the app takes,
 * including the authoring layer; `file` is the plain scenario file alone, used
 * to check what resolution produced — its errors name one shape, not four.
 */
function getValidator(): Promise<{ any: ValidateFunction; file: ValidateFunction }> {
  if (!validator) {
    validator = fetch(`${import.meta.env.BASE_URL}schema/scenario.schema.json`)
      .then((r) => r.json())
      .then((schema: { definitions: Record<string, unknown> }) => {
        const ajv = new Ajv({ allErrors: true, strict: false });
        return {
          any: ajv.compile(schema),
          file: ajv.compile({ definitions: schema.definitions, $ref: '#/definitions/ScenarioFile' }),
        };
      });
  }
  return validator;
}

/**
 * Loads a content pack referenced by `include`: one of the packs published
 * with the app, or any fetchable URL.
 */
async function loadPack(ref: string): Promise<ContentPack | null> {
  const bundled = bundledPack(ref);
  if (bundled) return bundled;
  const url = /^https?:/.test(ref) ? ref : `${import.meta.env.BASE_URL}packs/${ref.replace(/\.json$/, '')}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as ContentPack;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** What the resolver filled in or adjusted; never blocking */
  notes: string[];
  /** The resolved, plain scenario file — this is what should be loaded */
  json?: string;
  scenario?: Scenario;
  roster?: RosterEntry[];
  duration?: number;
  /** True when the document used places, relative times, macros or beats */
  usedAuthoring?: boolean;
}

/**
 * Parse, resolve and validate scenario JSON. Authoring documents (named
 * places, relative times, macros, beats, "keyframes": "auto") are resolved to
 * a plain scenario first, so everything downstream — the player, the editor,
 * the exporter — only ever sees literal coordinates and seconds.
 *
 * Problems come back with exact JSON paths, suitable for pasting straight
 * back to an assistant to fix.
 */
export async function validateScenarioJson(text: string): Promise<ValidationResult> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`], notes: [] };
  }
  const validate = await getValidator();
  if (validate.any(data)) {
    const resolved = await resolveAuthoring(data, { loadPack });
    if (!resolved.file) return { ok: false, errors: resolved.errors, notes: resolved.notes };
    const { scenario, duration, roster } = resolved.file;
    const errors = scenarioErrors(scenario, duration).map((e) => `/scenario${e}`);
    // the resolver produces plain objects, so anything it got wrong is caught here
    if (!validate.file(stripUndefined(resolved.file))) {
      errors.push(...schemaLines(validate.file.errors ?? [], true).map((l) => `after resolving: ${l}`));
    }
    return {
      ok: errors.length === 0,
      errors,
      notes: resolved.notes,
      json: JSON.stringify(resolved.file, null, 2),
      scenario,
      roster,
      duration,
      usedAuthoring: resolved.usedAuthoring,
    };
  }
  const isFile = !!data && typeof data === 'object' && 'scenario' in (data as object);
  return { ok: false, errors: schemaLines(validate.any.errors ?? [], isFile), notes: [] };
}

/** JSON.stringify drops undefined values; ajv's additionalProperties does not. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Readable lines from ajv errors, preferring the branch the document aimed at. */
function schemaLines(all: NonNullable<ValidateFunction['errors']>, isFile: boolean): string[] {
  const branch = isFile ? 'AuthoringDocument' : 'AuthoredScenario';
  const errs = all.filter((e) => e.schemaPath.includes(branch) || e.instancePath.startsWith('/scenario'));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of errs.length ? errs : all) {
    if (e.keyword === 'oneOf' || e.keyword === 'anyOf') continue;
    const extra =
      e.keyword === 'additionalProperties'
        ? ` (unexpected "${(e.params as { additionalProperty: string }).additionalProperty}")`
        : e.keyword === 'enum'
          ? ` (allowed: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')})`
          : '';
    const line = `${e.instancePath || '/'} ${e.message}${extra}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.slice(0, 40);
}

/** Starter prompt for asking an LLM to write a scenario in this format. */
/** Public address of the published site; AI assistants can't reach a local development server. */
export const PUBLIC_SITE = 'https://noahdemar.github.io/conflict-sandbox/';

/** Finished example scenarios published under /examples/ (see scripts/export-examples.ts). */
export const EXAMPLE_FILES: { file: string; shows: string }[] = [
  { file: 'river-crossing.json', shows: 'a minimal hypothetical battle, written out longhand' },
  { file: 'authored-river-crossing.json', shows: 'the same battle written with the shortcuts: named places, relative times, a column macro, story beats and an automatic camera' },
  { file: 'khasham.json', shows: 'a modern battle with air strikes, an article, callouts and an order-of-battle overlay' },
  { file: 'binladen-raid.json', shows: 'a raid with individual people, helicopters, night vision and a satellite pass' },
  { file: 'dogfight.json', shows: 'a 3D aerial scene over real terrain with an aircraft comparison' },
];

/** Base URL for links given to assistants: the public site unless this is already hosted. */
export function siteForAssistants(): string {
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);
  return local ? PUBLIC_SITE : `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/**
 * Exact field names for every object, embedded in the prompt so the output is
 * still valid when the assistant cannot fetch the schema or examples.
 * Keep in sync with types.ts.
 */
const FIELD_REFERENCE = [
  'Field reference — use these names exactly (do not invent others; * = required):',
  'file:      { format*: "conflict-sandbox-scenario", scenario*: {...}, duration?, roster? }',
  'scenario:  name*, factions*, units*, arrows*, territories*, labels*, strikes*, keyframes* (array or "auto"), duration?, subtitle?, sources?, period?("ancient"|"medieval"|"gunpowder"|"industrial"|"ww1"|"ww2"|"coldwar"|"modern"), era?("modern"|"historical"), environment?, effects?, aerial?, article?, beats?, macros?, places?',
  'beat:      caption*, at?(time expression), focus?([ids]), shot?("establish"|"approach"|"action"|"detail"|"aftermath"), follow?, hold?, sensor?, overlay?, narrate?, media?',
  'places:    { "<name>": [lng, lat] } — anchors for "at", "near" and "via"',
  'faction:   id*, name*, color*, affiliation?("friend"|"hostile"|"neutral"|"unknown")',
  'unit:      id*, factionId*, type*("infantry"|"armor"|"artillery"|"air"|"naval"|"missile"|"hq"), name*, lat*, lng*, appearAt*, icon?, arrowId?, rosterId?, heading?, rangeKm?, destroyedAt?, sensorKm?, airDefenseKm?, landAtEnd?, leavesAt?, altitudeKm?, orbitRole?("relay"|"imaging"), captureAt?',
  'arrow:     id*, factionId*, points*([[lng,lat],...]), name*, appearAt*, duration*, followRoads?, hideLine?, hideAt?, times?',
  'territory: id*, factionId*, points*([[lng,lat] ring]), name*, appearAt*, duration*, label?, labelAt?, labelRotate?',
  'label:     id*, text*, lat*, lng*, size*, color*, appearAt*, flag?, facility?',
  'strike:    id*, lat*, lng*, name*, size*, appearAt*, impactStyle?("blast"|"fireball"), fromUnitId?, launchAt?, targetStrikeId?, targetUnitId?, salvo?, spreadM?, pattern?("disc"|"line")',
  'keyframe:  id*, time*, lng*, lat*, zoom*, pitch*, bearing*, caption*, highlightUnitIds?, followUnitId?, followMode?("track"|"chase"), orbitSpeed?, narrate?, sensor?("normal"|"nvg"|"thermal"), aerial?, overlay?("orbat"), overlayFactionIds?, media?',
  'effect:    id*, kind*("radio"|"datalink"|"jamming"|"panic"|"wounded"|"noammo"), unitId*, start*, duration*, targetUnitId?, radiusM?, label?',
  'roster:    id*, name*, type*, faction?, icon?, modelUrl?, modelYaw?, rangeKm?, imageUrl?, wikiTitle?',
  'aerial:    origin*([lng,lat]), style?("cinematic"|"briefing"), aircraft*, weapons?, holds?, terrain?, terrainTexture?, terrainRadiusKm?, terrainExaggeration?',
  'aircraft:  id*, name*, factionId*, airframe*("f4"|"mig17"|"jet"), track*([[flightSeconds,mEast,mNorth,mAltitude],...]), destroyedAt?',
  'weapon:    id*, kind*("guns"|"missile"), from*, target*, time*, duration?, hit?, label?',
  'shot:      mode*("chase"|"side"|"flyby"|"overview"|"compare"), target*, secondary?, distanceM?, orbitDegPerS?, compare?',
  'Common mistakes to avoid: keep the wrapper and scenario separate — "format" sits at the top level while "name", "subtitle", "sources" and "article" go INSIDE "scenario", never at the top level; arrows and territories use "name" (never "label"); every event uses "appearAt" in timeline seconds (never "time"); a strike\'s shooter is "fromUnitId" (never "attackerUnitId"); labels require "size" and "color"; strikes have no "type" or "description" — put detail in "name" and the keyframe "caption".',
].join('\n');

/**
 * What each published example demonstrates, distilled so the prompt carries
 * the design patterns even when the assistant never fetches the JSON.
 */
const REFERENCE_NOTES = [
  'What the reference examples demonstrate (reuse these patterns):',
  '- binladen-raid.json: a roster of named assets with icons and Wikipedia images; helicopters with hover waypoints and landAtEnd; per-shot "nvg"/"thermal" sensors; highlightUnitIds naming exactly the units each caption mentions; overlay "orbat" on assault shots; an imaging satellite at 500 km moving on a route with orbitRole "imaging" and captureAt; article scenes that stop cleanly at keyframe boundaries.',
  '- khasham.json: an attack column as units queued on a single route; every strike has fromUnitId and a launchAt inside the shooter\'s route; a faction-filtered ORBAT; a night environment; datalink effects showing the counter-battery handoff.',
  '- dogfight.json: a 3D aerial scene over real terrain; flight tracks sampled about every second so bank and pitch look smooth; chase/overview/compare camera shots; holds that freeze the aircraft for explanation; weapons fired only inside realistic envelopes.',
  '- river-crossing.json: the minimal valid skeleton — two factions, a handful of units, one arrow, a few captioned keyframes. Start small like this, then add detail.',
].join('\n');

/**
 * Self-verification loop for assistants that can drive a browser: the
 * published site validates and plays any fetchable scenario, so an agent can
 * watch its own work with no repo or install.
 */
function agentWorkflow(site: string): string {
  return [
    'If you can drive a web browser (Claude Code, Codex CLI, Gemini CLI, Cursor, Windsurf/Devin, VS Code Copilot agent mode), verify your work in the real player instead of guessing:',
    `1. Open ${site}?scenario=<url> where <url> is anywhere your JSON file can be fetched:`,
    '   - quickest: publish it as a public gist (`gh gist create scenario.json --public`) and use the raw file URL, or any static host that allows cross-origin fetches;',
    '   - no hosting needed: append encodeURIComponent("data:application/json;base64," + base64(your file)) after ?scenario= .',
    '2. The page validates before it plays: schema and semantic errors are listed on screen and in the browser console, and realism warnings appear too. Fix the JSON and reload until it plays cleanly.',
    '3. Watch the whole timeline: label overlaps, unit spacing, camera composition, effect timing and caption readability — then iterate on the JSON until it looks right.',
    '4. Deliver the finished JSON plus the preview URL.',
    'If you are a chat-only assistant with no tools, tell the user this prompt produces much better results inside one of those agentic tools — then still output valid JSON now so they can use it immediately.',
  ].join('\n');
}

/**
 * The shortcuts that remove most of the arithmetic from authoring. Written
 * out in the prompt because they are what makes a complex scenario writable
 * in one pass: anchor the geography once, hang everything else off it, and
 * let the app compose the camera.
 */
function authoringShortcuts(period?: Period): string {
  const p = period ?? 'modern';
  return [
    'Authoring shortcuts — prefer these over hand-computed numbers:',
    '- PLACES: define anchors once in "places": { "Bridge": [35.045, 48.446] } ([lng, lat]), then put things at them:',
    '    { "id": "u_def", "at": "Bridge", ... }',
    '    { "id": "u_north", "near": { "of": "Bridge", "bearingDeg": 20, "km": 1.4 }, ... }',
    '  Routes and territory rings take "via": ["Assembly area", { "of": "Bridge", "bearingDeg": 200, "km": 2 }, "Bridge"].',
    '  Anything already placed can be an anchor: unit ids, label ids, "a_route.end".',
    '- TIMES may be expressions instead of seconds: "s_hit-4" (four seconds before that strike lands), "a_column.end",',
    '  "k2+1.5", "start", "end-5". Re-timing one event then moves everything hanging off it.',
    '- MACROS build the repetitive structures:',
    '    { "macro": "column", "id": "m_adv", "factionId": "f_red", "count": 6, "via": ["Staging", "Objective"],',
    '      "unit": { "name": "T-72", "type": "armor", "icon": "tank" } }',
    '    { "macro": "formation", "id": "m_line", "factionId": "f_blue", "count": 5, "center": "Ridge",',
    '      "shape": "line", "facingDeg": 180, "frontageM": 900, "unit": { ... } }',
    '    { "macro": "strike-package", "id": "m_fires", "from": "u_f15e", "targets": ["u_t72_1", "u_t72_2"],',
    '      "weapon": "GBU-38 JDAM", "at": 42, "intervalSeconds": 2.5 }',
    '    { "macro": "volley", "id": "m_arrows", "from": "u_archers", "target": "u_vanguard", "at": 20, "count": 4 }',
    '- CAMERA: write story beats and set "keyframes": "auto". The app frames each shot on the units you name and',
    '  gives it enough time for the caption to be read aloud:',
    '    "beats": [ { "at": 0, "caption": "...", "shot": "establish", "focus": ["u_a", "u_b"] },',
    '               { "at": "s_hit-2", "caption": "...", "shot": "action", "focus": ["u_heli", "u_tank"] } ]',
    '  Omit "at" to let a beat follow the previous one at reading pace. Write keyframes by hand only for shots you',
    '  want to control exactly; a keyframe with a caption and highlightUnitIds but no coordinates is framed for you.',
    `- CONTENT PACKS carry period rosters: "include": ["${PERIODS[p].packs[0] ?? 'modern/nato'}"], then point units at them with "rosterId".`,
  ].join('\n');
}

/** The period rules an author has to respect, spelled out. */
function periodBrief(period: Period): string {
  const def = PERIODS[period];
  return [
    `PERIOD: ${def.label} (${def.years}). Set "period": "${period}" on the scenario. ${def.summary}`,
    ...def.guidance.map((g) => `- ${g}`),
    `- Content packs for this period: ${def.packs.join(', ')} (published at ${siteForAssistants()}packs/<id>.json).`,
  ].join('\n');
}

export function llmPrompt(description?: string, period?: Period): string {
  const site = siteForAssistants();
  return [
    'You are writing a scenario for OpenBrief, a browser tool that turns map animations of real events into illustrated articles.',
    `Read the authoring guide: ${site}llms.txt`,
    `The output must validate against this JSON Schema: ${site}schema/scenario.schema.json`,
    'Study these complete, valid examples before writing (open the ones closest to your scenario):',
    ...EXAMPLE_FILES.map((e) => `- ${site}examples/${e.file} (${e.shows})`),
    '',
    period ? periodBrief(period) : `Pick a period and set "period" on the scenario: ${PERIOD_IDS.join(', ')}.`,
    '',
    authoringShortcuts(period),
    '',
    FIELD_REFERENCE,
    '',
    REFERENCE_NOTES,
    '',
    agentWorkflow(site),
    '',
    'Output only the JSON document (the {"format": "conflict-sandbox-scenario", ...} wrapper), no prose.',
    'Use [longitude, latitude] order in "points" arrays, unique ids, and times within "duration".',
    'Mark anything approximate or invented in names or captions; never invent sources, electronic jamming, sensor footage or precise target assignments.',
    'Use restrained default blast effects, small rifle bursts, explicit aircraft launch times within routes, and hover waypoints for helicopter landings.',
    'Satellites need altitudeKm over 100 (about 500+ for imaging satellites, 35786 for geostationary) and must move along an arrowId route; only geostationary satellites hold position.',
    'Compose readable shots with selective highlights and optional faction-filtered ORBAT overlays. Leave enough time for the final salvo round and narration plus 0.5 seconds.',
    'Keep continuous action inside one article scene: scenes deliberately hold at their boundaries. Follow the guide quality checklist and resolve validation errors before delivery.',
    period
      ? `Give every unit an "icon" from this library, using the closest match. These are the icons that belong in the ${PERIODS[period].label} period; do not use icons from other periods:`
      : 'Give every unit an "icon" from this library, using the closest match. If nothing fits, still name what you wanted; OpenBrief shows a generic icon and reports it:',
    iconCatalogText(period),
    '',
    'Also write the "article" (prose with embedded map scenes and a few image callouts), a one-line "subtitle", and "sources" you are confident exist.',
    '',
    'Scenario to create:',
    description?.trim() ||
      '<describe the battle, operation or hypothetical here: place, date, sides, units, key events and roughly how long it should run>',
  ].join('\n');
}
