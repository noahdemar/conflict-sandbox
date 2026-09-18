/**
 * Check a scenario without a browser: resolve the authoring layer, validate
 * against the published schema, and report everything that would stop it
 * playing or make it read badly — plus a storyboard contact sheet.
 *
 *   npm run check -- scenario.json
 *   npm run check -- scenario.json --json            machine-readable report
 *   npm run check -- scenario.json --storyboard sb.svg
 *   npm run check -- scenario.json --resolved out.json   write the plain scenario
 *
 * Exit code 1 when anything blocking was found, so it works in CI.
 */
import Ajv from 'ajv';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { resolveAuthoring } from '../src/authoring/resolve';
import { storyboardSvg } from '../src/authoring/storyboard';
import type { ContentPack } from '../src/authoring/types';
import { bundledPack } from '../src/packs';
import { reportLines, reviewScenario } from '../src/review';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null;
};

if (!file) {
  console.error('usage: npm run check -- <scenario.json> [--json] [--storyboard out.svg] [--resolved out.json]');
  process.exit(2);
}

const asJson = args.includes('--json');
const storyboardOut = flag('storyboard');
const resolvedOut = flag('resolved');

const schema = JSON.parse(readFileSync('public/schema/scenario.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
// the plain scenario file alone: used to check what resolution produced
const validateFile = ajv.compile({ definitions: schema.definitions, $ref: '#/definitions/ScenarioFile' });

/** Packs come from the bundle, a local path beside the document, or a URL. */
async function loadPack(ref: string): Promise<ContentPack | null> {
  const bundled = bundledPack(ref);
  if (bundled) return bundled;
  if (/^https?:/.test(ref)) {
    const res = await fetch(ref);
    return res.ok ? ((await res.json()) as ContentPack) : null;
  }
  const local = resolvePath(dirname(file!), ref);
  try {
    return JSON.parse(readFileSync(local, 'utf8')) as ContentPack;
  } catch {
    return null;
  }
}

const raw = JSON.parse(readFileSync(file, 'utf8'));
const schemaErrors = validate(raw)
  ? []
  : (validate.errors ?? [])
      .filter((e) => e.keyword !== 'anyOf' && e.keyword !== 'oneOf')
      .map((e) => `${e.instancePath || '/'} ${e.message}`);

const resolved = await resolveAuthoring(raw, { loadPack });
// resolution writes plain objects; validate them too, so a resolver bug cannot
// hide behind a document that was valid on the way in
const resolvedErrors = [...resolved.errors];
if (resolved.file && !validateFile(JSON.parse(JSON.stringify(resolved.file)))) {
  resolvedErrors.push(
    ...(validateFile.errors ?? []).map((e) => `after resolving: ${e.instancePath || '/'} ${e.message}`),
  );
}
const report = resolved.file
  ? reviewScenario(resolved.file.scenario, resolved.file.roster, resolved.file.duration)
  : { ok: false, issues: [], counts: { error: 0, warn: 0, info: 0 } };

const blocking = schemaErrors.length + resolvedErrors.length + report.counts.error;

if (resolvedOut && resolved.file) {
  writeFileSync(resolvedOut, JSON.stringify(resolved.file, null, 2) + '\n');
}
if (storyboardOut && resolved.file) {
  writeFileSync(storyboardOut, storyboardSvg(resolved.file.scenario, resolved.file.duration));
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: blocking === 0,
        file,
        usedAuthoring: resolved.usedAuthoring,
        duration: resolved.file?.duration,
        shots: resolved.file?.scenario.keyframes.length ?? 0,
        schemaErrors,
        resolveErrors: resolvedErrors,
        notes: resolved.notes,
        issues: report.issues,
        counts: report.counts,
        storyboard: storyboardOut || undefined,
        resolvedFile: resolvedOut || undefined,
      },
      null,
      2,
    ),
  );
  process.exit(blocking ? 1 : 0);
}

console.log(`${file}: ${blocking ? 'PROBLEMS' : 'ok'}${resolved.usedAuthoring ? ' (authoring document, resolved)' : ''}`);
for (const e of schemaErrors) console.log(`  SCHEMA ${e}`);
for (const e of resolvedErrors) console.log(`  RESOLVE ${e}`);
for (const n of resolved.notes) console.log(`  note: ${n}`);
for (const line of reportLines(report)) console.log(`  ${line}`);
if (resolved.file) {
  console.log(
    `  ${resolved.file.scenario.keyframes.length} shots over ${resolved.file.duration}s, ` +
      `${resolved.file.scenario.units.length} units, ${resolved.file.scenario.strikes.length} strikes`,
  );
}
if (storyboardOut) console.log(`  storyboard: ${storyboardOut}`);
if (resolvedOut) console.log(`  resolved scenario: ${resolvedOut}`);

process.exit(blocking ? 1 : 0);
