import type { RosterEntry, Scenario } from './types';
import { DEMO_ROSTER, demoScenario } from './demoScenario';
import { RAID_ROSTER, raidScenario } from './demoRaid';

export type DemoId = 'khasham' | 'neptune-spear';

export const DEMOS: {
  id: DemoId;
  name: string;
  duration: number;
  roster: RosterEntry[];
  scenario: () => Scenario;
}[] = [
  { id: 'khasham', name: 'Battle of Khasham (2018)', duration: 60, roster: DEMO_ROSTER, scenario: demoScenario },
  { id: 'neptune-spear', name: 'Abbottabad raid (2011)', duration: 110, roster: RAID_ROSTER, scenario: raidScenario },
];
