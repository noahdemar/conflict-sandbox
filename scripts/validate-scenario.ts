/**
 * Validate scenario JSON against the published schema.
 *
 *   npm run validate                 # both bundled demos (as exported files)
 *   npm run validate -- my.json      # any scenario file (bare or exported)
 */
import Ajv from 'ajv';
import { existsSync, readFileSync } from 'node:fs';
import { DEMOS } from '../src/demos';
import { realismWarnings, scenarioErrors } from '../src/realism';
import type { Scenario } from '../src/types';

const schema = JSON.parse(readFileSync('public/schema/scenario.schema.json', 'utf8'));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const targets: [string, unknown][] = process.argv[2]
  ? [[process.argv[2], JSON.parse(readFileSync(process.argv[2], 'utf8'))]]
  : DEMOS.map((d) => [
      d.id,
      {
        format: 'conflict-sandbox-scenario',
        version: 1,
        duration: d.duration,
        roster: d.roster,
        scenario: { ...d.scenario(), duration: d.duration,
          ...(existsSync(`public/narration/${d.id}/manifest.json`) ? { narrationPack: `narration/${d.id}` } : {}) },
      },
    ]);

let failed = 0;
for (const [name, data] of targets) {
  if (validate(JSON.parse(JSON.stringify(data)))) {
    const file = data as { scenario?: Scenario; duration?: number };
    const scenario = file.scenario ?? data as Scenario;
    const duration = file.duration ?? scenario.duration;
    const errors = scenarioErrors(scenario, duration);
    if (errors.length) failed++;
    console.log(`${name}: ${errors.length ? 'INVALID' : 'valid'}`);
    errors.forEach((e) => console.log(`  ${e}`));
    realismWarnings({ ...scenario, duration }).forEach((w) => console.log(`  Warning: ${w}`));
  } else {
    failed++;
    console.log(`${name}: INVALID`);
    for (const e of validate.errors ?? []) console.log(`  ${e.instancePath || '/'} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
