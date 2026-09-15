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

export function llmPrompt(description?: string): string {
  const site = siteForAssistants();
  return [
    'You are writing a scenario for OpenBrief, a browser tool that turns map animations of real events into illustrated articles.',
    `Read the authoring guide: ${site}llms.txt`,
    `The output must validate against this JSON Schema: ${site}schema/scenario.schema.json`,
    'Study these complete, valid examples before writing (open the ones closest to your scenario):',
    ...EXAMPLE_FILES.map((e) => `- ${site}examples/${e.file} (${e.shows})`),
    '',
    'Output only the JSON document (the {"format": "conflict-sandbox-scenario", ...} wrapper), no prose.',
    'Use [longitude, latitude] order in "points" arrays, unique ids, and times within "duration".',
    'Mark anything approximate or invented in names or captions; never invent sources, electronic jamming, sensor footage or precise target assignments.',
    'Use restrained default blast effects, small rifle bursts, explicit aircraft launch times within routes, and hover waypoints for helicopter landings.',
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
