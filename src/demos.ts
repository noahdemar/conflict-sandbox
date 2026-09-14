import type { RosterEntry, Scenario } from './types';
import { DEMO_ROSTER, demoScenario } from './demoScenario';
import { RAID_ROSTER, raidScenario } from './demoRaid';
import { retimeScenario, totalInserted } from './retime';

/**
 * Extra seconds inserted at the end of shots whose recorded narration runs
 * longer than the shot (line length + 0.6s pause), so voice and action stay in
 * step. Derived from public/narration/<demo> clip lengths; recompute if captions change.
 */
const KHASHAM_INSERTS: [number, number][] = [[4.99, 2.1], [10.99, 1.4], [16.99, 4.1], [29.99, 3.2]];
const RAID_INSERTS: [number, number][] = [
  [6.99, 0.3], [26.49, 2.9], [30.99, 1.8], [33.99, 1.7], [48.99, 0.6], [53.99, 1.6],
  [58.99, 1.5], [71.99, 0.1], [107.99, 4.4], [110.99, 0.4], [119.99, 2.5],
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
