import type { RosterEntry, Scenario } from './types';
import { DEMO_ROSTER, demoScenario } from './demoScenario';
import { RAID_ROSTER, raidScenario } from './demoRaid';

export type DemoId = 'khasham' | 'binladen-raid';

export const DEMOS: {
  id: DemoId;
  name: string;
  duration: number;
  roster: RosterEntry[];
  scenario: () => Scenario;
}[] = [
  { id: 'khasham', name: 'Battle of Khasham (2018)', duration: 60, roster: DEMO_ROSTER, scenario: demoScenario },
  { id: 'binladen-raid', name: 'Bin Laden raid (2011)', duration: 128, roster: RAID_ROSTER, scenario: raidScenario },
];

/** Demo selected by the page URL, e.g. ?demo=binladen-raid */
export function demoFromUrl(): DemoId | null {
  const id = new URLSearchParams(window.location.search).get('demo');
  return DEMOS.some((d) => d.id === id) ? (id as DemoId) : null;
}
