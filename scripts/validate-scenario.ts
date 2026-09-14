/**
 * Validate scenario JSON against the published schema.
 *
 *   npm run validate                 # both bundled demos (as exported files)
 *   npm run validate -- my.json      # any scenario file (bare or exported)
 */
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { DEMOS } from '../src/demos';

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
        scenario: { ...d.scenario(), duration: d.duration, narrationPack: `narration/${d.id}` },
      },
    ]);

let failed = 0;
for (const [name, data] of targets) {
  if (validate(JSON.parse(JSON.stringify(data)))) {
    console.log(`${name}: valid`);
  } else {
    failed++;
    console.log(`${name}: INVALID`);
    for (const e of validate.errors ?? []) console.log(`  ${e.instancePath || '/'} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
