import Ajv, { type ValidateFunction } from 'ajv';

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
 * JSON paths — suitable for pasting straight back to an LLM to fix.
 */
export async function validateScenarioJson(text: string): Promise<{ ok: boolean; errors: string[] }> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const validate = await getValidator();
  if (validate(data)) return { ok: true, errors: [] };
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
export function llmPrompt(): string {
  const site = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return [
    'You are writing a scenario for Conflict Sandbox, a browser battle-map animation tool.',
    `Read the authoring guide: ${site}llms.txt`,
    `The output must validate against this JSON Schema: ${site}schema/scenario.schema.json`,
    `A complete example: ${site}examples/river-crossing.json`,
    '',
    'Output only the JSON document (the {"format": "conflict-sandbox-scenario", ...} wrapper), no prose.',
    'Use [longitude, latitude] order in "points" arrays, unique ids, and times within "duration".',
    'Mark anything approximate or invented in names or captions.',
    '',
    'Scenario to create:',
    '<describe the battle, operation or hypothetical here: place, date, sides, units, key events and roughly how long it should run>',
  ].join('\n');
}
