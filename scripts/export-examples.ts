/**
 * Publish every demo as a complete scenario file under public/examples/, so
 * AI assistants (and people) can study finished, validated examples.
 *
 *   npx tsx scripts/export-examples.ts
 *
 * Runs as part of `npm run build`. Also writes public/examples/index.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEMOS } from '../src/demos';

const FORMAT = 'conflict-sandbox-scenario';
const dir = join('public', 'examples');
mkdirSync(dir, { recursive: true });

const index: { id: string; name: string; file: string; features: string[] }[] = [
  { id: 'river-crossing', name: 'River crossing (hypothetical, minimal)', file: 'river-crossing.json', features: ['units', 'arrows', 'strikes', 'keyframes'] },
];

/** Demos still being finished; not offered to assistants until they validate cleanly. */
const DRAFTS = new Set(['agincourt']);

for (const demo of DEMOS) {
  if (DRAFTS.has(demo.id)) continue;
  const scenario = { ...demo.scenario(), duration: demo.duration };
  const used = new Set(scenario.units.map((u) => u.rosterId).filter(Boolean));
  const file = {
    format: FORMAT,
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    duration: demo.duration,
    roster: demo.roster.filter((r) => used.has(r.id) || scenario.aerial),
    scenario,
  };
  const name = `${demo.id}.json`;
  writeFileSync(join(dir, name), JSON.stringify(file, null, 2) + '\n');
  const features = [
    scenario.units.length && 'units',
    scenario.strikes.length && 'strikes',
    scenario.article && 'article',
    scenario.era === 'historical' && 'historical era',
    scenario.aerial && '3D aerial scene',
    scenario.aerial?.terrain === 'real' && 'real terrain',
    scenario.keyframes.some((k) => k.aerial?.mode === 'compare') && 'aircraft comparison',
    scenario.keyframes.some((k) => k.overlay) && 'order of battle overlay',
  ].filter(Boolean) as string[];
  index.push({ id: demo.id, name: demo.name, file: name, features });
  console.log(`examples/${name}`);
}

writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
