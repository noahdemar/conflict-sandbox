/**
 * Publish every content pack under public/packs/<period>/<name>.json, plus an
 * index, so authoring documents can pull them in with `include` and assistants
 * can read what a period contains without the repository.
 *
 *   npx tsx scripts/export-packs.ts
 *
 * Runs as part of `npm run build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PERIODS, PERIOD_IDS } from '../src/eras';
import { PACKS } from '../src/packs';

const dir = join('public', 'packs');
mkdirSync(dir, { recursive: true });

for (const pack of PACKS) {
  const file = join(dir, `${pack.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pack, null, 2) + '\n');
  console.log(`packs/${pack.id}.json`);
}

const index = {
  periods: PERIOD_IDS.map((id) => ({
    id,
    label: PERIODS[id].label,
    years: PERIODS[id].years,
    era: PERIODS[id].era,
    summary: PERIODS[id].summary,
    guidance: PERIODS[id].guidance,
    packs: PACKS.filter((p) => p.period === id).map((p) => ({
      id: p.id,
      name: p.name,
      file: `${p.id}.json`,
      description: p.description,
      units: (p.roster ?? []).length,
    })),
  })),
};

writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log('packs/index.json');
