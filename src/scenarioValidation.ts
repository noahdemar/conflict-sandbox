import { iconCatalogText } from './iconCatalog';
import Ajv, { type ValidateFunction } from 'ajv';
import { scenarioErrors } from './realism';
import type { Scenario } from './types';

let validator: Promise<ValidateFunction> | null = null;

/** Compile the published schema once (fetched from the site so it always matches the build). */
function getValidator(): Promise<ValidateFunction> {
  if (!validator) {
    validator = fetch(`${import.meta.env.BASE_URL}schema/scenario.schema.json`)
      .then((r) => r.json())
      .then((schema) => new Ajv({ allErrors: true, strict: false }).compile(schema));
  }
  return validator;
}

/**
 * Parse and validate scenario JSON. Returns human-readable problems with exact
 * JSON paths, suitable for pasting straight back to an LLM to fix.
 */
export async function validateScenarioJson(text: string): Promise<{ ok: boolean; errors: string[] }> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const validate = await getValidator();
  if (validate(data)) {
    const file = data as { scenario?: Scenario; duration?: number };
    const scenario = file.scenario ?? data as Scenario;
    const errors = scenarioErrors(scenario, file.duration ?? scenario.duration);
    return { ok: errors.length === 0, errors: errors.map((e) => file.scenario ? `/scenario${e}` : e) };
  }
  // oneOf reports both branches; prefer errors from the branch the document was aiming at
  const isFile = !!data && typeof data === 'object' && 'format' in (data as object);
  const errs = (validate.errors ?? []).filter((e) =>
    isFile ? e.schemaPath.includes('ScenarioFile') || e.instancePath.startsWith('/scenario') : !e.schemaPath.includes('ScenarioFile'),
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of errs.length ? errs : validate.errors ?? []) {
    if (e.keyword === 'oneOf') continue;
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
  return { ok: false, errors: lines.slice(0, 40) };
}

/** Starter prompt for asking an LLM to write a scenario in this format. */
/** Public address of the published site; AI assistants can't reach a local development server. */
export const PUBLIC_SITE = 'https://noahdemar.github.io/conflict-sandbox/';

/** Finished example scenarios published under /examples/ (see scripts/export-examples.ts). */
export const EXAMPLE_FILES: { file: string; shows: string }[] = [
  { file: 'river-crossing.json', shows: 'a minimal hypothetical battle' },
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
  'scenario:  name*, factions*, units*, arrows*, territories*, labels*, strikes*, keyframes*, duration?, subtitle?, sources?, era?("modern"|"historical"), environment?, effects?, aerial?, article?',
  'faction:   id*, name*, color*, affiliation?("friend"|"hostile"|"neutral"|"unknown")',
  'unit:      id*, factionId*, type*("infantry"|"armor"|"artillery"|"air"|"naval"|"missile"|"hq"), name*, lat*, lng*, appearAt*, icon?, arrowId?, rosterId?, heading?, rangeKm?, destroyedAt?, sensorKm?, airDefenseKm?, landAtEnd?, leavesAt?, altitudeKm?, orbitRole?("relay"|"imaging"), captureAt?',
  'arrow:     id*, factionId*, points*([[lng,lat],...]), name*, appearAt*, duration*, followRoads?, hideLine?, hideAt?, times?',
  'territory: id*, factionId*, points*([[lng,lat] ring]), name*, appearAt*, duration*, label?, labelAt?, labelRotate?',
  'label:     id*, text*, lat*, lng*, size*, color*, appearAt*, flag?, facility?',
  'strike:    id*, lat*, lng*, name*, size*, appearAt*, impactStyle?("blast"|"fireball"), fromUnitId?, launchAt?, targetStrikeId?, targetUnitId?, salvo?, spreadM?',
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

export function llmPrompt(description?: string): string {
  const site = siteForAssistants();
  return [
    'You are writing a scenario for OpenBrief, a browser tool that turns map animations of real events into illustrated articles.',
    `Read the authoring guide: ${site}llms.txt`,
    `The output must validate against this JSON Schema: ${site}schema/scenario.schema.json`,
    'Study these complete, valid examples before writing (open the ones closest to your scenario):',
    ...EXAMPLE_FILES.map((e) => `- ${site}examples/${e.file} (${e.shows})`),
    '',
    FIELD_REFERENCE,
    '',
    REFERENCE_NOTES,
    '',
    'Output only the JSON document (the {"format": "conflict-sandbox-scenario", ...} wrapper), no prose.',
    'Use [longitude, latitude] order in "points" arrays, unique ids, and times within "duration".',
    'Mark anything approximate or invented in names or captions; never invent sources, electronic jamming, sensor footage or precise target assignments.',
    'Use restrained default blast effects, small rifle bursts, explicit aircraft launch times within routes, and hover waypoints for helicopter landings.',
    'Satellites need altitudeKm over 100 (about 500+ for imaging satellites, 35786 for geostationary) and must move along an arrowId route; only geostationary satellites hold position.',
    'Compose readable shots with selective highlights and optional faction-filtered ORBAT overlays. Leave enough time for the final salvo round and narration plus 0.5 seconds.',
    'Keep continuous action inside one article scene: scenes deliberately hold at their boundaries. Follow the guide quality checklist and resolve validation errors before delivery.',
    'Give every unit an "icon" from this library, using the closest match. If nothing fits, still name what you wanted; OpenBrief shows a generic icon and reports it:',
    iconCatalogText(),
    '',
    'Also write the "article" (prose with embedded map scenes and a few image callouts), a one-line "subtitle", and "sources" you are confident exist.',
    '',
    'Scenario to create:',
    description?.trim() ||
      '<describe the battle, operation or hypothetical here: place, date, sides, units, key events and roughly how long it should run>',
  ].join('\n');
}
