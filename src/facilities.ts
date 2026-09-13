/** Facility kinds a map label can be shown as. Icons are 24x24 stroke SVG bodies. */
export type FacilityKind =
  | 'oil'
  | 'gas'
  | 'refinery'
  | 'airbase'
  | 'port'
  | 'power'
  | 'base'
  | 'hq'
  | 'bridge'
  | 'hospital'
  | 'town';

export const FACILITY_META: Record<FacilityKind, { name: string; color: string; icon: string }> = {
  oil: {
    name: 'Oil field / pumpjack',
    color: '#3b3b3b',
    icon: '<path d="M3 21h18"/><path d="M6 21 L10 9 L14 21"/><path d="M4 9 L18 5"/><path d="M18 5 Q21 5 20.5 8 L18 9"/><path d="M10 9 V7"/><path d="M17 9 V21"/>',
  },
  gas: {
    name: 'Gas plant',
    color: '#d9480f',
    icon: '<path d="M3 21h18"/><rect x="4" y="12" width="7" height="9" rx="3.5"/><rect x="12" y="10" width="5" height="11" rx="2.5"/><path d="M20 21 V7"/><path d="M20 7 Q18 5 20 2 Q22 5 20 7 Z"/>',
  },
  refinery: {
    name: 'Refinery',
    color: '#5c3d2e',
    icon: '<path d="M3 21h18"/><path d="M5 21 V9 h3 V21"/><path d="M10 21 V5 h3 V21"/><path d="M15 21 V12 h5 V21"/><path d="M11.5 5 Q10 3 12 1.5"/>',
  },
  airbase: {
    name: 'Airbase',
    color: '#1c7ed6',
    icon: '<path d="M12 2 L13.5 9 L21 13 V15 L13.5 12.5 L13 18 L15.5 20 V21.5 L12 20.5 L8.5 21.5 V20 L11 18 L10.5 12.5 L3 15 V13 L10.5 9 Z"/>',
  },
  port: {
    name: 'Port',
    color: '#1864ab',
    icon: '<circle cx="12" cy="5" r="2"/><path d="M12 7 V21"/><path d="M8 11 H16"/><path d="M4 14 Q4 21 12 21 Q20 21 20 14"/>',
  },
  power: {
    name: 'Power plant',
    color: '#f59f00',
    icon: '<path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z"/>',
  },
  base: {
    name: 'Military base',
    color: '#495057',
    icon: '<path d="M4 21 V10 L12 4 L20 10 V21"/><path d="M9 21 V15 H15 V21"/><path d="M12 4 V1 M12 1 H16 V3 H12"/>',
  },
  hq: {
    name: 'Headquarters',
    color: '#2b8a3e',
    icon: '<path d="M6 21 V3"/><path d="M6 4 H19 L16 8 L19 12 H6"/>',
  },
  bridge: {
    name: 'Bridge',
    color: '#5f3dc4',
    icon: '<path d="M2 16 H22"/><path d="M2 16 Q12 4 22 16"/><path d="M7 16 V11 M12 16 V9 M17 16 V11"/><path d="M3 20 Q6 18 9 20 T15 20 T21 20"/>',
  },
  hospital: {
    name: 'Hospital',
    color: '#e03131',
    icon: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7 V17 M7 12 H17"/>',
  },
  town: {
    name: 'Town / village',
    color: '#343a40',
    icon: '<path d="M3 21 V11 L8 7 L13 11 V21"/><path d="M13 21 V14 L17.5 10.5 L22 14 V21"/><path d="M2 21 H22"/><path d="M7 21 V16 H9 V21"/>',
  },
};

export const facilityIconSvg = (kind: FacilityKind) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${FACILITY_META[kind].icon}</svg>`;
