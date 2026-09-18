import type { ContentPack } from '../authoring/types';

/**
 * Content packs for the periods before the internal combustion engine. Each
 * pack is a roster an author can point `rosterId` at, plus macro presets
 * showing the structures that period is actually made of.
 *
 * Names are formation names, never head counts: one icon on the map stands
 * for a body of men, and the caption says how many if it matters.
 */

export const ANCIENT_FORMATIONS: ContentPack = {
  id: 'ancient/formations',
  name: 'Ancient formations',
  period: 'ancient',
  description: 'Phalanx, legion, skirmishers, horse and chariots.',
  roster: [
    { id: 'anc_phalanx', name: 'Hoplite phalanx', type: 'infantry', icon: 'spearmen', wikiTitle: 'Phalanx' },
    { id: 'anc_legion', name: 'Legionary cohort', type: 'infantry', icon: 'menatarms', wikiTitle: 'Roman legion' },
    { id: 'anc_skirmish', name: 'Skirmishers', type: 'infantry', icon: 'archers', wikiTitle: 'Peltast' },
    { id: 'anc_archers', name: 'Archers', type: 'infantry', icon: 'archers', wikiTitle: 'Ancient warfare' },
    { id: 'anc_cavalry', name: 'Companion cavalry', type: 'infantry', icon: 'cavalry', wikiTitle: 'Companion cavalry' },
    { id: 'anc_chariot', name: 'Chariots', type: 'infantry', icon: 'chariot', wikiTitle: 'Chariot' },
    { id: 'anc_siege', name: 'Siege engines', type: 'artillery', icon: 'siege', wikiTitle: 'Siege engine' },
    { id: 'anc_camp', name: 'Marching camp', type: 'hq', icon: 'camp', wikiTitle: 'Castra' },
    { id: 'anc_trireme', name: 'Trireme squadron', type: 'naval', icon: 'galley', wikiTitle: 'Trireme' },
  ],
  macros: [
    {
      macro: 'formation',
      id: 'preset_phalanx',
      factionId: 'f_greek',
      unit: { name: 'Hoplite phalanx', type: 'infantry', icon: 'spearmen', rosterId: 'anc_phalanx' },
      count: 5,
      center: 'Battle line',
      shape: 'line',
      facingDeg: 90,
      frontageM: 900,
    },
  ],
  notes: [
    'Ranged fire is the "volley" macro: several strikes of many light rounds, not one blast.',
    'Routes cross open ground; there is no road network to follow.',
  ],
};

export const MEDIEVAL_FORMATIONS: ContentPack = {
  id: 'medieval/formations',
  name: 'Medieval formations',
  period: 'medieval',
  description: 'Men-at-arms, longbows, knights, siege and the baggage train.',
  roster: [
    { id: 'med_menatarms', name: 'Dismounted men-at-arms', type: 'infantry', icon: 'menatarms', wikiTitle: 'Man-at-arms' },
    { id: 'med_longbow', name: 'Longbowmen', type: 'infantry', icon: 'archers', wikiTitle: 'English longbow' },
    { id: 'med_crossbow', name: 'Crossbowmen', type: 'infantry', icon: 'archers', wikiTitle: 'Crossbow' },
    { id: 'med_spear', name: 'Spearmen', type: 'infantry', icon: 'spearmen', wikiTitle: 'Spearman' },
    { id: 'med_knights', name: 'Mounted knights', type: 'infantry', icon: 'cavalry', wikiTitle: 'Knight' },
    { id: 'med_trebuchet', name: 'Trebuchet', type: 'artillery', icon: 'siege', wikiTitle: 'Trebuchet' },
    { id: 'med_banner', name: 'Royal standard', type: 'hq', icon: 'banner', wikiTitle: 'War flag' },
    { id: 'med_baggage', name: 'Baggage train', type: 'infantry', icon: 'baggage', wikiTitle: 'Baggage train' },
    { id: 'med_castle', name: 'Castle', type: 'hq', icon: 'fort', wikiTitle: 'Castle' },
    { id: 'med_cog', name: 'Cog', type: 'naval', icon: 'sailingship', wikiTitle: 'Cog (ship)' },
  ],
  macros: [
    {
      macro: 'volley',
      id: 'preset_longbow_volley',
      from: 'u_longbow_left',
      target: 'u_french_van',
      name: 'Longbow volley',
      at: 20,
      count: 4,
      intervalSeconds: 3,
      rounds: 14,
      spreadM: 70,
    },
  ],
  notes: [
    'Longbow range is about 300 m: put archers within that of the target or the plausibility check will say so.',
    'Name the close fight "Melee" and the charge "Cavalry charge"; keep explosives out of the scene.',
  ],
};

export const GUNPOWDER_FORMATIONS: ContentPack = {
  id: 'gunpowder/formations',
  name: 'Pike and shot',
  period: 'gunpowder',
  description: 'Musket lines, pike blocks, field guns and ships of the line.',
  roster: [
    { id: 'gun_line', name: 'Line infantry', type: 'infantry', icon: 'musketeers', wikiTitle: 'Line infantry' },
    { id: 'gun_grenadiers', name: 'Grenadiers', type: 'infantry', icon: 'musketeers', wikiTitle: 'Grenadier' },
    { id: 'gun_pike', name: 'Pike block', type: 'infantry', icon: 'pikemen', wikiTitle: 'Pike and shot' },
    { id: 'gun_horse', name: 'Horse', type: 'infantry', icon: 'cavalry', wikiTitle: 'Cavalry' },
    { id: 'gun_cannon', name: 'Field battery', type: 'artillery', icon: 'cannon', wikiTitle: 'Field artillery' },
    { id: 'gun_colours', name: 'Regimental colours', type: 'hq', icon: 'banner', wikiTitle: 'Colours, standards and guidons' },
    { id: 'gun_baggage', name: 'Baggage train', type: 'infantry', icon: 'baggage', wikiTitle: 'Baggage train' },
    { id: 'gun_shipofline', name: 'Ship of the line', type: 'naval', icon: 'sailingship', wikiTitle: 'Ship of the line' },
  ],
  macros: [
    {
      macro: 'formation',
      id: 'preset_line',
      factionId: 'f_blue',
      unit: { name: 'Line infantry', type: 'infantry', icon: 'musketeers', rosterId: 'gun_line' },
      count: 6,
      center: 'Ridge',
      shape: 'line',
      facingDeg: 180,
      frontageM: 1200,
    },
  ],
  notes: [
    'Musket range is a few hundred metres; cannon reach about 1 km with round shot.',
    'Name strikes "Musket volley", "Cannonade" and "Broadside".',
  ],
};

export const INDUSTRIAL_FORMATIONS: ContentPack = {
  id: 'industrial/formations',
  name: 'Industrial-age formations',
  period: 'industrial',
  description: 'Rifle regiments, massed batteries, cavalry screens and ironclads.',
  roster: [
    { id: 'ind_rifles', name: 'Rifle regiment', type: 'infantry', icon: 'musketeers', wikiTitle: 'Rifleman' },
    { id: 'ind_skirmish', name: 'Skirmish line', type: 'infantry', icon: 'troops', wikiTitle: 'Skirmisher' },
    { id: 'ind_battery', name: 'Field battery', type: 'artillery', icon: 'cannon', wikiTitle: 'Field artillery in the American Civil War' },
    { id: 'ind_cavalry', name: 'Cavalry squadron', type: 'infantry', icon: 'cavalry', wikiTitle: 'Cavalry' },
    { id: 'ind_hq', name: 'Corps headquarters', type: 'hq', icon: 'hq', wikiTitle: 'Headquarters' },
    { id: 'ind_supply', name: 'Supply train', type: 'infantry', icon: 'baggage', wikiTitle: 'Military logistics' },
    { id: 'ind_ironclad', name: 'Ironclad', type: 'naval', icon: 'ship', wikiTitle: 'Ironclad warship' },
  ],
  macros: [
    {
      macro: 'strike-package',
      id: 'preset_barrage',
      from: 'u_battery',
      targets: ['u_defenders'],
      weapon: 'Artillery barrage',
      at: 30,
      salvo: 10,
      size: 0.8,
    },
  ],
  notes: [
    'Rifled muskets reach about 500 m and field guns 2 to 3 km: long enough to matter, short enough to see.',
    'Railways and the telegraph shape the approach; keep routes off present-day motorways.',
  ],
};
