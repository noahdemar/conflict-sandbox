import { create } from 'zustand';
import type {
  Arrow,
  Faction,
  Keyframe,
  MapLabel,
  RosterEntry,
  Scenario,
  Selection,
  Environment,
  StatusEffect,
  StatusKind,
  Strike,
  Territory,
  Tool,
  Unit,
  UnitType,
} from './types';
import type { CameraPose } from './geo';
import { DEMOS, type DemoId } from './demos';

export interface MapApi {
  getCamera: () => CameraPose;
  flyTo: (pose: CameraPose) => void;
  /** Sweep the keyframe camera path to preload all tiles before recording */
  warmup: () => Promise<void>;
  /** Screen position of a map point; pxPerMeter measured over `meters` eastward */
  project: (
    lngLat: [number, number],
    meters?: number,
  ) => { x: number; y: number; pxPerMeter: number; width: number; height: number };
  /** Loudest nearby helicopter right now: level 0..1, stereo pan -1..1, load 0..1 */
  rotorMix: () => { level: number; pan: number; load: number };
}

export interface NarrationPrefs {
  enabled: boolean;
  /** Viewer's answer to the narration prompt; null until they choose */
  consent?: 'voice' | 'text' | null;
  engine: 'webspeech' | 'kokoro';
  voice: string | null;
  rate: number;
}

const PREFS_KEY = 'conflict-sandbox-prefs-v1';

interface Prefs {
  use3d: boolean;
  narration: NarrationPrefs;
  /** Prefs schema version; 2 switched the default narrator to Kokoro "George" */
  v?: number;
}

const DEFAULT_NARRATION: NarrationPrefs = { enabled: true, engine: 'kokoro', voice: 'bm_george', rate: 1, consent: null };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      // older prefs move to the new default narrator, keeping on/off and speed
      const migrate = (p.v ?? 1) < 2;
      return {
        use3d: p.use3d ?? true,
        narration: {
          enabled: p.narration?.enabled ?? true,
          engine: migrate ? DEFAULT_NARRATION.engine : p.narration?.engine === 'webspeech' ? 'webspeech' : 'kokoro',
          voice: migrate ? DEFAULT_NARRATION.voice : (p.narration?.voice ?? DEFAULT_NARRATION.voice),
          rate: p.narration?.rate ?? 1,
          consent: p.narration?.consent ?? null,
        },
        v: 2,
      };
    }
  } catch {
    /* ignore */
  }
  return { use3d: true, narration: { ...DEFAULT_NARRATION }, v: 2 };
}

export type Look = 'explainer' | 'briefing';
const LOOK_KEY = 'conflict-sandbox-look';
const loadLook = (): Look => {
  try {
    return localStorage.getItem(LOOK_KEY) === 'briefing' ? 'briefing' : 'explainer';
  } catch {
    return 'explainer';
  }
};

export type IconStyle = 'illustrated' | 'symbols';
const ICON_KEY = 'conflict-sandbox-icons';
const loadIconStyle = (): IconStyle => {
  try {
    return localStorage.getItem(ICON_KEY) === 'symbols' ? 'symbols' : 'illustrated';
  } catch {
    return 'illustrated';
  }
};

const STORAGE_KEY = 'conflict-sandbox-scenario-v1';
const LIBRARY_KEY = 'conflict-sandbox-units-v1';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_FACTIONS: Faction[] = [
  { id: 'f-blue', name: 'Blue Coalition', color: '#2f6fd0' },
  { id: 'f-red', name: 'Red Alliance', color: '#d03a2f' },
  { id: 'f-green', name: 'Independent', color: '#2f8f5b' },
  { id: 'f-civ', name: 'Civilian', color: '#8a5bd0' },
];

/** Colors assigned to newly added factions, in order. */
const FACTION_PALETTE = [
  '#d08a2f',
  '#2fb3d0',
  '#c94f8a',
  '#7a8a2f',
  '#5b6fd0',
  '#b0522f',
];

const DEFAULT_LIBRARY: RosterEntry[] = [
  { id: 'r-inf-btn', name: 'Infantry Battalion', type: 'infantry' },
  { id: 'r-mech-bde', name: 'Mechanized Brigade', type: 'infantry' },
  { id: 'r-arm-bde', name: 'Armored Brigade', type: 'armor' },
  { id: 'r-tank-bn', name: 'Tank Battalion', type: 'armor' },
  { id: 'r-art-bty', name: 'Artillery Battery', type: 'artillery' },
  { id: 'r-mlrs', name: 'Rocket Artillery (MLRS)', type: 'missile' },
  { id: 'r-sam', name: 'SAM Site', type: 'missile' },
  { id: 'r-ftr-sqn', name: 'Fighter Squadron', type: 'air' },
  { id: 'r-bmr-sqn', name: 'Bomber Squadron', type: 'air' },
  { id: 'r-carrier', name: 'Carrier Group', type: 'naval' },
  { id: 'r-destroyer', name: 'Destroyer Flotilla', type: 'naval' },
  { id: 'r-sub', name: 'Submarine', type: 'naval' },
  { id: 'r-army-hq', name: 'Army HQ', type: 'hq' },
];

const UNIT_TYPES: UnitType[] = [
  'infantry',
  'armor',
  'artillery',
  'air',
  'naval',
  'missile',
  'hq',
];

function loadLibrary(): RosterEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return DEFAULT_LIBRARY;
    const parsed = JSON.parse(raw) as RosterEntry[];
    if (!Array.isArray(parsed)) return DEFAULT_LIBRARY;
    return parsed.filter(
      (e) => e && typeof e.name === 'string' && UNIT_TYPES.includes(e.type),
    );
  } catch {
    return DEFAULT_LIBRARY;
  }
}

export const DEFAULT_ENVIRONMENT: Environment = {
  startHour: 12,
  endHour: 12,
  windDirDeg: 90,
  windKph: 10,
  haze: 0,
};

function defaultScenario(): Scenario {
  return {
    name: 'Untitled Scenario',
    factions: DEFAULT_FACTIONS,
    units: [],
    arrows: [],
    territories: [],
    labels: [],
    strikes: [],
    keyframes: [],
    effects: [],
  };
}

function loadScenario(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultScenario();
    const parsed = JSON.parse(raw) as Scenario;
    if (!parsed.factions?.length) return defaultScenario();
    return {
      name: parsed.name ?? 'Untitled Scenario',
      factions: parsed.factions,
      units: parsed.units ?? [],
      arrows: parsed.arrows ?? [],
      territories: parsed.territories ?? [],
      labels: parsed.labels ?? [],
      strikes: parsed.strikes ?? [],
      keyframes: parsed.keyframes ?? [],
      effects: parsed.effects ?? [],
      environment: parsed.environment,
      duration: parsed.duration,
      narrationPack: parsed.narrationPack,
    };
  } catch {
    return defaultScenario();
  }
}

interface StoreState {
  scenario: Scenario;
  tool: Tool;
  activeFactionId: string;
  activeUnitType: UnitType;
  /** In-progress polyline/polygon points while drawing */
  draft: [number, number][];
  selection: Selection | null;
  /** Playback clock in seconds */
  time: number;
  playing: boolean;
  /** Waiting for the viewer to choose voice or text-only narration before playing */
  consentPending: boolean;
  resolveConsent: (choice: 'voice' | 'text') => void;
  /** Right-hand transcript pane */
  transcriptOpen: boolean;
  setTranscriptOpen: (open: boolean) => void;
  /** Visual presentation: friendly explainer stickers or sober military briefing */
  look: Look;
  setLook: (look: Look) => void;
  /** Unit icons: illustrated silhouettes or standard military symbols */
  iconStyle: IconStyle;
  setIconStyle: (iconStyle: IconStyle) => void;
  duration: number;
  globeMode: boolean;
  /** When true the camera is driven by keyframes (playback / scrub / keyframe jump) */
  cameraLock: boolean;
  mapApi: MapApi | null;
  /** User-submittable unit roster */
  unitLibrary: RosterEntry[];
  /** Selected roster stamp; when set, unit placement uses it */
  activeRosterId: string | null;
  /** Render units as 3D models (flat mode) */
  use3d: boolean;
  narration: NarrationPrefs;
  /** Playback speed multiplier */
  speed: number;
  /** Video export in progress */
  recording: boolean;

  setTool: (t: Tool) => void;
  setActiveFaction: (id: string) => void;
  setActiveUnitType: (t: UnitType) => void;
  setSelection: (s: Selection | null) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
  setGlobeMode: (g: boolean) => void;
  setCameraLock: (v: boolean) => void;
  setMapApi: (api: MapApi | null) => void;
  setScenarioName: (n: string) => void;

  addKeyframe: () => void;
  updateKeyframe: (id: string, patch: Partial<Keyframe>) => void;
  removeKeyframe: (id: string) => void;
  goToKeyframe: (id: string) => void;

  setActiveRosterId: (id: string | null) => void;
  setUse3d: (v: boolean) => void;
  setNarration: (patch: Partial<NarrationPrefs>) => void;
  setSpeed: (v: number) => void;
  setRecording: (v: boolean) => void;
  addRosterEntry: (e: Omit<RosterEntry, 'id'>) => void;
  updateRosterEntry: (id: string, patch: Partial<RosterEntry>) => void;
  removeRosterEntry: (id: string) => void;
  importLibrary: (json: string) => boolean;
  exportLibrary: () => string;
  resetLibrary: () => void;

  addDraftPoint: (p: [number, number]) => void;
  undoDraftPoint: () => void;
  cancelDraft: () => void;
  finishDraft: () => void;

  addUnit: (lat: number, lng: number) => void;
  moveUnit: (id: string, lat: number, lng: number) => void;
  addLabel: (lat: number, lng: number) => void;
  addStrike: (lat: number, lng: number) => void;

  updateUnit: (id: string, patch: Partial<Unit>) => void;
  updateArrow: (id: string, patch: Partial<Arrow>) => void;
  updateTerritory: (id: string, patch: Partial<Territory>) => void;
  updateLabel: (id: string, patch: Partial<MapLabel>) => void;
  updateStrike: (id: string, patch: Partial<Strike>) => void;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  addFaction: () => void;
  removeFaction: (id: string) => void;

  updateEnvironment: (patch: Partial<Environment>) => void;
  addEffect: (unitId: string, kind: StatusKind) => void;
  updateEffect: (id: string, patch: Partial<StatusEffect>) => void;
  removeEffect: (id: string) => void;
  deleteSelection: () => void;
  eraseAt: (lat: number, lng: number) => void;

  newScenario: () => void;
  /** Load a bundled demo; `persist: false` shows it without replacing the saved scenario */
  loadDemo: (id?: DemoId, opts?: { persist?: boolean }) => void;
  exportScenario: () => string;
  /** Load a scenario file; `persist: false` loads it for viewing without replacing the saved scenario */
  importScenario: (json: string, opts?: { persist?: boolean }) => boolean;
  /** Read-only presentation mode (opened from a view link) */
  viewer: boolean;
  setViewer: (viewer: boolean) => void;
  /** Suspend saving during a drag; resuming saves the current scenario once */
  setPersistPaused: (paused: boolean) => void;
}

/** Identifies exported scenario files. */
export const SCENARIO_FORMAT = 'conflict-sandbox-scenario';
export const SCENARIO_VERSION = 1;

/** Portable, self-contained scenario file. */
export interface ScenarioFile {
  format: typeof SCENARIO_FORMAT;
  version: number;
  exportedAt: string;
  /** Timeline length in seconds */
  duration: number;
  /** Roster entries referenced by units (silhouette names, photos, 3D models) */
  roster: RosterEntry[];
  scenario: Scenario;
}

let persistPaused = false;

function persist(s: Scenario) {
  if (persistPaused) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / unavailable */
  }
}

export const useStore = create<StoreState>((set, get) => {
  const mutate = (fn: (s: Scenario) => Scenario) => {
    const next = fn(get().scenario);
    // the read-only player never overwrites the viewer's own saved scenario
    if (!get().viewer) persist(next);
    set({ scenario: next });
  };

  return {
    scenario: loadScenario(),
    tool: 'select',
    activeFactionId: loadScenario().factions[0]?.id ?? 'f-blue',
    activeUnitType: 'infantry',
    draft: [],
    selection: null,
    time: 0,
    playing: false,
    duration: loadScenario().duration ?? 60,
    look: loadLook(),
    iconStyle: loadIconStyle(),
    setIconStyle: (iconStyle) => {
      set({ iconStyle });
      try {
        localStorage.setItem(ICON_KEY, iconStyle);
      } catch {
        /* ignore */
      }
    },
    setLook: (look) => {
      set({ look });
      try {
        localStorage.setItem(LOOK_KEY, look);
      } catch {
        /* ignore */
      }
    },
    globeMode: false,
    cameraLock: false,
    mapApi: null,
    unitLibrary: loadLibrary(),
    activeRosterId: null,
    use3d: loadPrefs().use3d,
    narration: loadPrefs().narration,
    speed: 1,
    recording: false,

    setTool: (tool) => set({ tool, draft: [], selection: null }),
    setActiveFaction: (activeFactionId) => set({ activeFactionId }),
    setActiveUnitType: (activeUnitType) => set({ activeUnitType }),
    setSelection: (selection) => set({ selection }),
    setTime: (time) => set({ time }),
    setPlaying: (playing) => {
      const st = get();
      // first playback of a narrated scenario asks how to present narration
      if (playing && !st.playing && !st.narration.consent && st.scenario.keyframes.some((k) => k.caption?.trim())) {
        set({ consentPending: true });
        return;
      }
      set({ playing });
    },
    consentPending: false,
    resolveConsent: (choice) => {
      const narration = { ...get().narration, consent: choice, enabled: choice === 'voice' };
      set({ narration, consentPending: false });
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ use3d: get().use3d, narration, v: 2 }));
      } catch {
        /* ignore */
      }
      get().setCameraLock(true);
      set({ playing: true });
    },
    transcriptOpen: false,
    setTranscriptOpen: (transcriptOpen) => set({ transcriptOpen }),
    setDuration: (duration) => {
      set({ duration });
      mutate((s) => ({ ...s, duration }));
    },
    setGlobeMode: (globeMode) => set({ globeMode }),
    setCameraLock: (cameraLock) => set({ cameraLock }),
    setMapApi: (mapApi) => set({ mapApi }),
    setScenarioName: (name) => mutate((s) => ({ ...s, name })),

    addKeyframe: () => {
      const st = get();
      const cam = st.mapApi?.getCamera() ?? {
        lng: 20,
        lat: 42,
        zoom: 3.2,
        pitch: 0,
        bearing: 0,
      };
      const id = uid();
      mutate((s) => ({
        ...s,
        keyframes: [
          ...s.keyframes,
          {
            id,
            time: Math.round(st.time * 10) / 10,
            lng: cam.lng,
            lat: cam.lat,
            zoom: Math.round(cam.zoom * 100) / 100,
            pitch: Math.round(cam.pitch),
            bearing: Math.round(cam.bearing),
            caption: '',
          },
        ].sort((a, b) => a.time - b.time),
      }));
      set({ selection: { kind: 'keyframe', id } });
    },
    updateKeyframe: (id, patch) =>
      mutate((s) => ({
        ...s,
        keyframes: s.keyframes
          .map((k) => (k.id === id ? { ...k, ...patch } : k))
          .sort((a, b) => a.time - b.time),
      })),
    removeKeyframe: (id) =>
      mutate((s) => ({
        ...s,
        keyframes: s.keyframes.filter((k) => k.id !== id),
      })),
    goToKeyframe: (id) => {
      const st = get();
      const k = st.scenario.keyframes.find((x) => x.id === id);
      if (!k) return;
      set({ time: k.time, selection: { kind: 'keyframe', id } });
      st.mapApi?.flyTo({
        lng: k.lng,
        lat: k.lat,
        zoom: k.zoom,
        pitch: k.pitch,
        bearing: k.bearing,
      });
      // Lock the camera once the flight lands so the pose stays pinned
      setTimeout(() => {
        const cur = get();
        if (cur.selection?.kind === 'keyframe' && cur.selection.id === id) {
          set({ cameraLock: true });
        }
      }, 850);
    },

    setActiveRosterId: (activeRosterId) => set({ activeRosterId }),
    setUse3d: (use3d) => {
      set({ use3d });
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({ use3d, narration: get().narration, v: 2 }),
        );
      } catch {
        /* ignore */
      }
    },
    setNarration: (patch) => {
      const narration = { ...get().narration, ...patch };
      set({ narration });
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({ use3d: get().use3d, narration, v: 2 }),
        );
      } catch {
        /* ignore */
      }
    },
    setSpeed: (speed) => set({ speed }),
    setRecording: (recording) => set({ recording }),
    addRosterEntry: (e) => {
      const lib = [...get().unitLibrary, { ...e, id: uid() }];
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
      } catch {
        /* ignore */
      }
      set({ unitLibrary: lib });
    },
    updateRosterEntry: (id, patch) => {
      const lib = get().unitLibrary.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      );
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
      } catch {
        /* ignore */
      }
      set({ unitLibrary: lib });
    },
    removeRosterEntry: (id) => {
      const lib = get().unitLibrary.filter((e) => e.id !== id);
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
      } catch {
        /* ignore */
      }
      set((st) => ({
        unitLibrary: lib,
        activeRosterId: st.activeRosterId === id ? null : st.activeRosterId,
      }));
    },
    importLibrary: (json) => {
      try {
        const parsed = JSON.parse(json) as RosterEntry[];
        if (!Array.isArray(parsed)) return false;
        const lib = parsed
          .filter(
            (e) => e && typeof e.name === 'string' && UNIT_TYPES.includes(e.type),
          )
          .map((e) => ({
            id: typeof e.id === 'string' ? e.id : uid(),
            name: e.name,
            type: e.type,
            faction: typeof e.faction === 'string' ? e.faction : undefined,
            modelUrl:
              typeof e.modelUrl === 'string' ? e.modelUrl : undefined,
            modelYaw:
              typeof e.modelYaw === 'number' ? e.modelYaw : undefined,
            rangeKm: typeof e.rangeKm === 'number' ? e.rangeKm : undefined,
            imageUrl:
              typeof e.imageUrl === 'string' ? e.imageUrl : undefined,
            wikiTitle:
              typeof e.wikiTitle === 'string' ? e.wikiTitle : undefined,
          }));
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
        set({ unitLibrary: lib, activeRosterId: null });
        return true;
      } catch {
        return false;
      }
    },
    exportLibrary: () => JSON.stringify(get().unitLibrary, null, 2),
    resetLibrary: () => {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(DEFAULT_LIBRARY));
      set({ unitLibrary: DEFAULT_LIBRARY, activeRosterId: null });
    },

    addDraftPoint: (p) => set((st) => ({ draft: [...st.draft, p] })),
    undoDraftPoint: () => set((st) => ({ draft: st.draft.slice(0, -1) })),
    cancelDraft: () => set({ draft: [] }),
    finishDraft: () => {
      const st = get();
      const pts = st.draft;
      if (st.tool === 'arrow' && pts.length >= 2) {
        mutate((s) => ({
          ...s,
          arrows: [
            ...s.arrows,
            {
              id: uid(),
              factionId: st.activeFactionId,
              points: pts,
              name: 'Offensive',
              appearAt: Math.floor(st.time),
              duration: 4,
            },
          ],
        }));
      } else if (st.tool === 'territory' && pts.length >= 3) {
        mutate((s) => ({
          ...s,
          territories: [
            ...s.territories,
            {
              id: uid(),
              factionId: st.activeFactionId,
              points: pts,
              name: 'Controlled zone',
              appearAt: Math.floor(st.time),
              duration: 3,
            },
          ],
        }));
      }
      set({ draft: [] });
    },

    addUnit: (lat, lng) => {
      const st = get();
      const entry = st.activeRosterId
        ? st.unitLibrary.find((e) => e.id === st.activeRosterId)
        : undefined;
      mutate((s) => ({
        ...s,
        units: [
          ...s.units,
          {
            id: uid(),
            factionId: entry?.faction
              ? (s.factions.find(
                  (f) => f.name.toLowerCase() === entry.faction!.toLowerCase(),
                )?.id ?? st.activeFactionId)
              : st.activeFactionId,
            type: entry?.type ?? st.activeUnitType,
            name: entry?.name ?? '',
            rosterId: entry?.id,
            rangeKm: entry?.rangeKm,
            lat,
            lng,
            appearAt: Math.floor(st.time),
          },
        ],
      }));
    },
    addStrike: (lat, lng) => {
      const st = get();
      mutate((s) => ({
        ...s,
        strikes: [
          ...s.strikes,
          {
            id: uid(),
            lat,
            lng,
            name: 'Strike',
            size: 1,
            appearAt: Math.floor(st.time),
          },
        ],
      }));
    },
    moveUnit: (id, lat, lng) =>
      mutate((s) => ({
        ...s,
        units: s.units.map((u) => (u.id === id ? { ...u, lat, lng } : u)),
      })),
    addLabel: (lat, lng) => {
      const st = get();
      mutate((s) => ({
        ...s,
        labels: [
          ...s.labels,
          {
            id: uid(),
            text: 'Label',
            lat,
            lng,
            size: 16,
            color: '#2e2617',
            appearAt: Math.floor(st.time),
          },
        ],
      }));
    },

    updateUnit: (id, patch) =>
      mutate((s) => ({
        ...s,
        units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      })),
    updateArrow: (id, patch) =>
      mutate((s) => ({
        ...s,
        arrows: s.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    updateTerritory: (id, patch) =>
      mutate((s) => ({
        ...s,
        territories: s.territories.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        ),
      })),
    updateLabel: (id, patch) =>
      mutate((s) => ({
        ...s,
        labels: s.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      })),
    updateStrike: (id, patch) =>
      mutate((s) => ({
        ...s,
        strikes: s.strikes.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      })),
    updateFaction: (id, patch) =>
      mutate((s) => ({
        ...s,
        factions: s.factions.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      })),
    addFaction: () => {
      const palette = FACTION_PALETTE;
      mutate((s) => ({
        ...s,
        factions: [
          ...s.factions,
          {
            id: uid(),
            name: `Faction ${s.factions.length + 1}`,
            color: palette[s.factions.length % palette.length],
          },
        ],
      }));
    },
    removeFaction: (id) =>
      mutate((s) => ({
        ...s,
        factions: s.factions.filter((f) => f.id !== id),
        units: s.units.filter((u) => u.factionId !== id),
        arrows: s.arrows.filter((a) => a.factionId !== id),
        territories: s.territories.filter((t) => t.factionId !== id),
      })),

    updateEnvironment: (patch) =>
      mutate((s) => ({
        ...s,
        environment: { ...DEFAULT_ENVIRONMENT, ...s.environment, ...patch },
      })),
    addEffect: (unitId, kind) => {
      const st = get();
      const other = st.scenario.units.find(
        (u) => u.id !== unitId && u.factionId === st.scenario.units.find((v) => v.id === unitId)?.factionId,
      );
      mutate((s) => ({
        ...s,
        effects: [
          ...(s.effects ?? []),
          {
            id: `fx_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            kind,
            unitId,
            start: Math.round(st.time * 10) / 10,
            duration: kind === 'wounded' || kind === 'noammo' ? 15 : 6,
            ...(kind === 'datalink' && other ? { targetUnitId: other.id } : {}),
            ...(kind === 'jamming' ? { radiusM: 2500 } : {}),
          },
        ],
      }));
    },
    updateEffect: (id, patch) =>
      mutate((s) => ({
        ...s,
        effects: (s.effects ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),
    removeEffect: (id) =>
      mutate((s) => ({ ...s, effects: (s.effects ?? []).filter((e) => e.id !== id) })),
    deleteSelection: () => {
      const sel = get().selection;
      if (!sel) return;
      mutate((s) => ({
        ...s,
        units: sel.kind === 'unit' ? s.units.filter((u) => u.id !== sel.id) : s.units,
        arrows:
          sel.kind === 'arrow' ? s.arrows.filter((a) => a.id !== sel.id) : s.arrows,
        territories:
          sel.kind === 'territory'
            ? s.territories.filter((t) => t.id !== sel.id)
            : s.territories,
        labels:
          sel.kind === 'label' ? s.labels.filter((l) => l.id !== sel.id) : s.labels,
        strikes:
          sel.kind === 'strike'
            ? s.strikes.filter((x) => x.id !== sel.id)
            : s.strikes,
        keyframes:
          sel.kind === 'keyframe'
            ? s.keyframes.filter((k) => k.id !== sel.id)
            : s.keyframes,
      }));
      set({ selection: null });
    },

    eraseAt: (lat, lng) => {
      // Remove nearest object within a threshold distance
      const s = get().scenario;
      const dist = (a: [number, number]) =>
        Math.hypot(a[0] - lng, a[1] - lat);
      const candidates: { kind: Selection['kind']; id: string; d: number }[] = [];
      const consider = (
        kind: Selection['kind'],
        id: string,
        p: [number, number],
      ) => candidates.push({ kind, id, d: dist(p) });
      s.units.forEach((u) => consider('unit', u.id, [u.lng, u.lat]));
      s.labels.forEach((l) => consider('label', l.id, [l.lng, l.lat]));
      s.strikes.forEach((x) => consider('strike', x.id, [x.lng, x.lat]));
      s.arrows.forEach((a) => a.points.forEach((p) => consider('arrow', a.id, p)));
      s.territories.forEach((t) =>
        t.points.forEach((p) => consider('territory', t.id, p)),
      );
      const best = candidates.reduce<(typeof candidates)[number] | null>(
        (acc, c) => (acc === null || c.d < acc.d ? c : acc),
        null,
      );
      if (best && best.d < 8) {
        set({ selection: { kind: best.kind, id: best.id } });
        get().deleteSelection();
      }
    },

    newScenario: () => {
      const s = defaultScenario();
      persist(s);
      set({ scenario: s, duration: s.duration ?? 60, selection: null, draft: [], time: 0, playing: false });
    },
    loadDemo: (id = 'khasham', opts) => {
      const demo = DEMOS.find((d) => d.id === id) ?? DEMOS[0];
      const s = { ...demo.scenario(), duration: demo.duration, narrationPack: `narration/${demo.id}` };
      if (opts?.persist !== false) persist(s);
      // merge demo roster entries (by id) into the library
      const lib = [...get().unitLibrary];
      for (const e of demo.roster) {
        const i = lib.findIndex((x) => x.id === e.id);
        if (i >= 0) lib[i] = { ...lib[i], ...e };
        else lib.push({ ...e });
      }
      if (opts?.persist !== false) {
        try {
          localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
        } catch {
          /* ignore */
        }
      }
      set({
        scenario: s,
        unitLibrary: lib,
        duration: demo.duration,
        selection: null,
        draft: [],
        time: 0,
        playing: false,
        cameraLock: false,
        activeFactionId: s.factions[0].id,
      });
    },
    exportScenario: () => {
      const st = get();
      // bundle only the roster entries the scenario uses, so silhouettes,
      // photos and 3D models resolve on the receiving side
      const used = new Set(st.scenario.units.map((u) => u.rosterId).filter(Boolean));
      const file: ScenarioFile = {
        format: SCENARIO_FORMAT,
        version: SCENARIO_VERSION,
        exportedAt: new Date().toISOString(),
        duration: st.duration,
        roster: st.unitLibrary.filter((e) => used.has(e.id)),
        scenario: st.scenario,
      };
      return JSON.stringify(file, null, 2);
    },
    viewer: false,
    setViewer: (viewer) => set({ viewer }),
    setPersistPaused: (paused) => {
      persistPaused = paused;
      if (!paused) persist(get().scenario);
    },
    importScenario: (json, opts) => {
      try {
        const raw = JSON.parse(json) as Partial<ScenarioFile> & Partial<Scenario>;
        // accept both the wrapped file format and older bare scenario JSON
        const parsed = (raw.format === SCENARIO_FORMAT ? raw.scenario : raw) as Scenario | undefined;
        if (!parsed?.factions?.length) return false;
        const s: Scenario = {
          name: parsed.name ?? 'Imported Scenario',
          factions: parsed.factions,
          units: parsed.units ?? [],
          arrows: parsed.arrows ?? [],
          territories: parsed.territories ?? [],
          labels: parsed.labels ?? [],
          strikes: parsed.strikes ?? [],
          keyframes: parsed.keyframes ?? [],
          effects: parsed.effects ?? [],
          environment: parsed.environment,
          duration:
            raw.format === SCENARIO_FORMAT && typeof raw.duration === 'number' && raw.duration > 0
              ? raw.duration
              : parsed.duration,
          narrationPack: parsed.narrationPack,
        };
        // merge bundled roster entries (by id) into the local library
        const lib = [...get().unitLibrary];
        for (const e of raw.format === SCENARIO_FORMAT ? raw.roster ?? [] : []) {
          const i = lib.findIndex((x) => x.id === e.id);
          if (i >= 0) lib[i] = { ...lib[i], ...e };
          else lib.push({ ...e });
        }
        if (opts?.persist !== false) {
          try {
            localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
          } catch {
            /* ignore */
          }
        }
        if (opts?.persist !== false) persist(s);
        set({
          scenario: s,
          unitLibrary: lib,
          duration: s.duration ?? get().duration,
          selection: null,
          draft: [],
          time: 0,
          playing: false,
          activeFactionId: s.factions[0].id,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
});
