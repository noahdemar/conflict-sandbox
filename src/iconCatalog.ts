import { ICON_PERIODS } from './eras';
import { isIconKey, resolveIconName, silhouetteFor, type SilhouetteKey } from './silhouettes';
import type { Period, RosterEntry, Scenario } from './types';

export type IconCategory = 'People' | 'Ground vehicles' | 'Aircraft' | 'Ships' | 'Structures' | 'Pre-modern';

/**
 * The shared icon library, described for people and AI assistants. Typed over
 * every library key, so adding an icon without describing it fails to compile.
 */
export const ICON_CATALOG: Record<SilhouetteKey, { label: string; category: IconCategory }> = {
  soldier: { label: 'Single soldier or person', category: 'People' },
  troops: { label: 'Infantry group', category: 'People' },
  officer: { label: 'Officer or commander', category: 'People' },
  medic: { label: 'Medic', category: 'People' },
  sniper: { label: 'Sniper or marksman', category: 'People' },
  civilians: { label: 'Civilians or crowd', category: 'People' },
  dog: { label: 'Military working dog', category: 'People' },

  tank: { label: 'Main battle tank', category: 'Ground vehicles' },
  abrams: { label: 'M1 Abrams or Western main battle tank', category: 'Ground vehicles' },
  bradley: { label: 'Bradley-style infantry fighting vehicle', category: 'Ground vehicles' },
  halftrack: { label: 'Half-track (WW2 era)', category: 'Ground vehicles' },
  ifv: { label: 'Tracked infantry fighting vehicle', category: 'Ground vehicles' },
  apc: { label: 'Wheeled armored personnel carrier', category: 'Ground vehicles' },
  jeep: { label: 'Light vehicle (jeep, Humvee)', category: 'Ground vehicles' },
  truck: { label: 'Truck, pickup or technical', category: 'Ground vehicles' },
  motorcycle: { label: 'Motorcycle', category: 'Ground vehicles' },
  ambulance: { label: 'Ambulance', category: 'Ground vehicles' },
  tanker: { label: 'Fuel truck', category: 'Ground vehicles' },
  engineer: { label: 'Engineer vehicle or bulldozer', category: 'Ground vehicles' },
  howitzer: { label: 'Towed howitzer', category: 'Ground vehicles' },
  spg: { label: 'Self-propelled gun', category: 'Ground vehicles' },
  mortar: { label: 'Mortar', category: 'Ground vehicles' },
  launcher: { label: 'Rocket launcher (MLRS)', category: 'Ground vehicles' },
  sam: { label: 'Surface-to-air missile launcher', category: 'Ground vehicles' },
  aagun: { label: 'Anti-aircraft gun', category: 'Ground vehicles' },
  radar: { label: 'Radar vehicle', category: 'Ground vehicles' },

  jet: { label: 'Fighter or attack jet', category: 'Aircraft' },
  f15: { label: 'F-15', category: 'Aircraft' },
  f22: { label: 'F-22', category: 'Aircraft' },
  bomber: { label: 'Heavy bomber', category: 'Aircraft' },
  propfighter: { label: 'Propeller fighter (WW2 era)', category: 'Aircraft' },
  propbomber: { label: 'Propeller bomber (WW2 era)', category: 'Aircraft' },
  proptransport: { label: 'Propeller transport (WW2 era)', category: 'Aircraft' },
  flyingwing: { label: 'Flying-wing stealth drone or bomber', category: 'Aircraft' },
  transport: { label: 'Transport or cargo aircraft', category: 'Aircraft' },
  gunship: { label: 'Gunship (AC-130 style)', category: 'Aircraft' },
  airliner: { label: 'Airliner', category: 'Aircraft' },
  heli: { label: 'Utility or transport helicopter', category: 'Aircraft' },
  mi8: { label: 'Mi-8/Mi-17 transport helicopter', category: 'Aircraft' },
  attackheli: { label: 'Attack helicopter', category: 'Aircraft' },
  drone: { label: 'Drone', category: 'Aircraft' },
  cruisemissile: { label: 'Cruise missile', category: 'Aircraft' },
  satellite: { label: 'Satellite', category: 'Aircraft' },

  ship: { label: 'Warship', category: 'Ships' },
  carrier: { label: 'Aircraft carrier', category: 'Ships' },
  submarine: { label: 'Submarine (modern)', category: 'Ships' },
  uboat: { label: 'WW2 submarine (U-boat)', category: 'Ships' },
  patrolboat: { label: 'Patrol boat', category: 'Ships' },
  landingcraft: { label: 'Landing craft', category: 'Ships' },
  higgins: { label: 'WW2 landing craft (LCVP, Higgins boat)', category: 'Ships' },
  lcac: { label: 'Hovercraft landing craft (LCAC)', category: 'Ships' },
  cargoship: { label: 'Cargo ship', category: 'Ships' },

  hq: { label: 'Headquarters or command post', category: 'Structures' },
  bunker: { label: 'Bunker', category: 'Structures' },
  checkpoint: { label: 'Checkpoint or roadblock', category: 'Structures' },
  camp: { label: 'Camp or tents', category: 'Structures' },
  fort: { label: 'Fort or castle', category: 'Structures' },

  menatarms: { label: 'Armored foot soldiers (men-at-arms, swordsmen)', category: 'Pre-modern' },
  spearmen: { label: 'Spearmen or shield wall (hoplites, legionaries)', category: 'Pre-modern' },
  pikemen: { label: 'Pike block', category: 'Pre-modern' },
  archers: { label: 'Archers or crossbowmen', category: 'Pre-modern' },
  musketeers: { label: 'Musket line infantry', category: 'Pre-modern' },
  cavalry: { label: 'Cavalry or mounted knights', category: 'Pre-modern' },
  chariot: { label: 'Chariot', category: 'Pre-modern' },
  cannon: { label: 'Field cannon', category: 'Pre-modern' },
  siege: { label: 'Siege engine (trebuchet, catapult)', category: 'Pre-modern' },
  banner: { label: 'Commander and banner', category: 'Pre-modern' },
  baggage: { label: 'Baggage train or wagons', category: 'Pre-modern' },
  sailingship: { label: 'Sailing warship', category: 'Pre-modern' },
  galley: { label: 'Oared galley', category: 'Pre-modern' },
};

export const ICON_CATEGORIES: IconCategory[] = ['People', 'Ground vehicles', 'Aircraft', 'Ships', 'Structures', 'Pre-modern'];

/**
 * Icon keys grouped by category, one line each, for prompts and docs. Given a
 * period, only the icons that belong in it — an author writing a medieval
 * battle is never shown an Apache.
 */
export function iconCatalogText(period?: Period): string {
  const keys = (Object.keys(ICON_CATALOG) as SilhouetteKey[]).filter((k) => !period || ICON_PERIODS[k].includes(period));
  return ICON_CATEGORIES.map((c) => {
    const inCategory = keys.filter((k) => ICON_CATALOG[k].category === c);
    return inCategory.length ? `${c}: ${inCategory.join(', ')}` : '';
  })
    .filter(Boolean)
    .join('\n');
}

/**
 * Units and roster entries that ask for an icon the library doesn't have. Each
 * falls back to a name match or the generic icon for its type; the message
 * says which, so the author (or assistant) can pick a real key.
 */
export function iconFallbacks(s: Scenario, roster: RosterEntry[] = []): string[] {
  const out: string[] = [];
  for (const e of roster) {
    if (e.icon && !resolveIconName(e.icon)) {
      out.push(`Roster entry "${e.name}" asks for icon "${e.icon}", which the icon library doesn't have.`);
    }
  }
  for (const u of s.units) {
    if (!u.icon || resolveIconName(u.icon)) continue;
    const entry = roster.find((e) => e.id === u.rosterId);
    const shown = silhouetteFor({ ...u, icon: undefined }, entry && { ...entry, icon: entry.icon && isIconKey(entry.icon) ? entry.icon : undefined });
    out.push(
      `Unit "${u.name}" asks for icon "${u.icon}", which the icon library doesn't have; showing "${shown}" (${ICON_CATALOG[shown].label}) instead.`,
    );
  }
  return out;
}
