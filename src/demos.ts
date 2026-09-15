import type { RosterEntry, Scenario } from './types';
import { DEMO_ROSTER, demoScenario } from './demoScenario';
import { RAID_ROSTER, raidScenario } from './demoRaid';
import { retimeScenario, totalInserted } from './retime';

/**
 * Extra seconds inserted at the end of shots whose recorded narration runs
 * longer than the shot (line length + 0.6s pause), so voice and action stay in
 * step. Derived from public/narration/<demo> clip lengths; recompute if captions change.
 */
const KHASHAM_INSERTS: [number, number][] = [
  [4.99, 3.1], [10.99, 2.9], [16.99, 5.2], [23.99, 0.9], [29.99, 6.2], [45.99, 1.1], [52.99, 0.6],
];
const RAID_INSERTS: [number, number][] = [
  [6.99, 2.3], [26.49, 3.5], [30.99, 4.2], [33.99, 4.9], [48.99, 2.8], [53.99, 2],
  [58.99, 3.5], [64.99, 1], [71.99, 2.6], [79.99, 0.5], [107.99, 4.5], [110.99, 2.7],
  [115.99, 2.8], [119.99, 5.5],
];

export type DemoId = 'khasham' | 'binladen-raid';

export const DEMOS: {
  id: DemoId;
  name: string;
  duration: number;
  roster: RosterEntry[];
  scenario: () => Scenario;
}[] = [
  {
    id: 'khasham', name: 'Battle of Khasham (2018)', duration: 60 + totalInserted(KHASHAM_INSERTS), roster: DEMO_ROSTER,
    scenario: () => retimeScenario(demoScenario(), KHASHAM_INSERTS),
  },
  {
    id: 'binladen-raid', name: 'Bin Laden raid (2011)', duration: 128 + totalInserted(RAID_INSERTS), roster: RAID_ROSTER,
    scenario: () => retimeScenario(raidScenario(), RAID_INSERTS),
  },
];

/** Demo selected by the page URL, e.g. ?demo=binladen-raid */
export function demoFromUrl(): DemoId | null {
  const id = new URLSearchParams(window.location.search).get('demo');
  return DEMOS.some((d) => d.id === id) ? (id as DemoId) : null;
}
