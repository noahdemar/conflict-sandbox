import { useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import Toolbar from './components/Toolbar';
import RosterPanel from './components/RosterPanel';
import FactionPanel from './components/FactionPanel';
import PropertiesPanel from './components/PropertiesPanel';
import Timeline from './components/Timeline';
import TopBar from './components/TopBar';
import { useStore } from './store';
import { kokoroState, loadNarrationPack, narrate, narrateRecorded, preloadKokoro, preloadNarrationPack, stopNarration } from './narration';
import { boom, setRotor } from './audio';
import { expandStrikes } from './particles';
import { startRouting } from './routing';
import { clearShareHash, readShareLink } from './share';
import { demoFromUrl } from './demos';
import { validateScenarioJson } from './scenarioValidation';
import { lossesByFaction } from './combat';
import { hourAt } from './environment';
import EnvironmentPanel from './components/EnvironmentPanel';
import TranscriptPane from './components/TranscriptPane';
import ConsentModal from './components/ConsentModal';
import VoiceModelDialog from './components/VoiceModelDialog';

/** Slide-style caption of the most recent keyframe at the current time. */
function CaptionOverlay() {
  const time = useStore((s) => s.time);
  const keyframes = useStore((s) => s.scenario.keyframes);
  const playing = useStore((s) => s.playing);
  const cameraLock = useStore((s) => s.cameraLock);
  if (!playing && !cameraLock) return null;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const active = sorted.filter((k) => k.time <= time).pop();
  if (!active?.caption) return null;
  const phase = sorted.indexOf(active) + 1;
  return (
    <div className="caption-overlay" key={active.id}>
      <div className="caption-kicker">
        <span className="caption-dot" />
        PHASE {phase} / {sorted.length}
      </div>
      <div className="caption-text">{active.caption}</div>
    </div>
  );
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const dms = (v: number, pos: string, neg: string) => {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const sec = Math.floor(((a - d) * 60 - m) * 60);
  return `${d}°${pad(m)}'${pad(sec)}"${v >= 0 ? pos : neg}`;
};

/** Ops-style HUD: mission clock, scenario tag and view-center coordinates. */
function TacticalHud() {
  const time = useStore((s) => s.time);
  const name = useStore((s) => s.scenario.name);
  const playing = useStore((s) => s.playing);
  const cameraLock = useStore((s) => s.cameraLock);
  const mapApi = useStore((s) => s.mapApi);
  const scenario = useStore((s) => s.scenario);
  const duration = useStore((s) => s.duration);
  if (!playing && !cameraLock) return null;
  const cam = mapApi?.getCamera();
  const losses = lossesByFaction(scenario, time);
  const env = scenario.environment;
  const hour = env ? hourAt(env, time, duration) : null;
  return (
    <>
      <div className="hud hud-tl">
        <div className="hud-row">
          <span className="hud-name">{name}</span>
        </div>
        <div className="hud-clock">
          T+{pad(time / 60)}:{pad(time % 60)}
          <span className="hud-ms">.{Math.floor((time % 1) * 10)}</span>
        </div>
        {hour !== null && (
          <div className="hud-env">
            {pad(hour)}:{pad((hour % 1) * 60)} LOCAL · WIND {env!.windKph.toFixed(0)} KM/H
          </div>
        )}
        <div className="hud-losses" title="Units destroyed">
          {scenario.factions.map((f) => (
            <span key={f.id} className="hud-loss" style={{ '--fc': f.color } as React.CSSProperties}>
              <i />
              {f.name} <b>−{losses.get(f.id) ?? 0}</b>
            </span>
          ))}
        </div>
      </div>
      {cam && (
        <div className="hud hud-br">
          <div>{dms(cam.lat, 'N', 'S')}  {dms(cam.lng, 'E', 'W')}</div>
          <div className="hud-dim">
            HDG {pad(((cam.bearing % 360) + 360) % 360).padStart(3, '0')} · TILT {pad(cam.pitch)} · Z{cam.zoom.toFixed(1)}
          </div>
        </div>
      )}
    </>
  );
}

/** Minimal chrome for read-only view links. */
function ViewerBar() {
  const name = useStore((s) => s.scenario.name);
  const openInEditor = () => {
    const st = useStore.getState();
    // keep a copy in this browser, then drop the read-only mode
    st.importScenario(st.exportScenario());
    st.setViewer(false);
    clearShareHash();
  };
  return (
    <div className="panel viewer-bar">
      <span className="viewer-title">{name}</span>
      <button className="top-btn" onClick={openInEditor} title="Save a copy and open it in the editor">
        Open in editor
      </button>
    </div>
  );
}

/** Image pulled up beside a map site from the active keyframe (e.g. later satellite imagery). */
function MediaOverlay() {
  const media = useStore((s) => {
    if (!s.playing && !s.cameraLock) return undefined;
    const active = [...s.scenario.keyframes].sort((a, b) => a.time - b.time).filter((k) => k.time <= s.time).pop();
    return active?.media;
  });
  const [failed, setFailed] = useState<string | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; side: 'right' | 'left' } | null>(null);

  // keep the image docked beside its site as the camera settles or moves
  useEffect(() => {
    if (!media?.anchor) {
      setPlace(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const api = useStore.getState().mapApi;
      if (api) {
        const r = media.anchorRadiusM ?? 60;
        const p = api.project(media.anchor!, r);
        const gap = r * p.pxPerMeter + 24;
        const roomRight = p.width - (p.x + gap);
        const side = roomRight >= Math.min(460, p.width * 0.4) + 16 ? 'right' : 'left';
        setPlace((prev) => {
          const next = { left: side === 'right' ? p.x + gap : p.x - gap, top: p.y, side } as const;
          return prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && prev.side === side
            ? prev
            : next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media]);

  if (!media) return null;
  // relative paths resolve against the app's base (works on GitHub Pages)
  const src = /^(https?:|data:|blob:)/.test(media.src) ? media.src : `${import.meta.env.BASE_URL}${media.src.replace(/^\//, '')}`;
  const style: React.CSSProperties | undefined = place
    ? { left: place.left, top: place.top, translate: place.side === 'right' ? '0 -50%' : '-100% -50%' }
    : undefined;
  return (
    <div className={`media-overlay ${place ? 'anchored' : ''}`} style={style} key={media.src}>
      <figure className="media-card">
        {failed === src ? (
          <div className="media-missing">
            Image not found
            <span>Add the file at public/{media.src.replace(/^\//, '')}</span>
          </div>
        ) : (
          <img src={src} alt={media.caption ?? ''} onError={() => setFailed(src)} />
        )}
        {(media.caption || media.credit) && (
          <figcaption>
            {media.caption && <span>{media.caption}</span>}
            {media.credit && <small>{media.credit}</small>}
          </figcaption>
        )}
      </figure>
    </div>
  );
}

/** Sensor view of the active camera keyframe (night vision / thermal), during playback or preview. */
function useSensorView(): 'normal' | 'nvg' | 'thermal' {
  return useStore((s) => {
    if (!s.playing && !s.cameraLock) return 'normal';
    const active = [...s.scenario.keyframes].sort((a, b) => a.time - b.time).filter((k) => k.time <= s.time).pop();
    return active?.sensor ?? 'normal';
  });
}

function SensorOverlay({ view }: { view: 'nvg' | 'thermal' }) {
  const time = useStore((s) => s.time);
  return (
    <div className={`sensor-overlay sensor-${view}`} aria-hidden>
      <div className="sensor-grain" />
      <div className="sensor-scan" />
      <div className="sensor-readout">
        {view === 'nvg' ? 'NVG · I²' : 'IR · WHT'}
        <span>{time.toFixed(1)}s</span>
      </div>
      {view === 'thermal' && <div className="sensor-cross" />}
    </div>
  );
}

/** Asked once per session whether to fetch the local voice model for authored voice lines. */
let voicePromptAsked = false;

export default function App() {
  const playing = useStore((s) => s.playing);
  const look = useStore((s) => s.look);
  const viewer = useStore((s) => s.viewer);
  const sensor = useSensorView();
  const tool = useStore((s) => s.tool);
  const narrationPack = useStore((s) => s.scenario.narrationPack);
  // captions that will actually be read aloud
  const hasVoiceLines = useStore((s) =>
    s.scenario.keyframes.some((k) => !!k.caption?.trim() && k.narrate !== false),
  );
  const spokenRef = useRef<string | null>(null);
  const spokenCaptionRef = useRef<string | null>(null);
  const prevTimeRef = useRef(0);

  // Narration: speak the caption of the keyframe that becomes active
  useEffect(() => {
    if (!playing) {
      spokenRef.current = null;
      spokenCaptionRef.current = null;
      stopNarration();
      return;
    }
    prevTimeRef.current = useStore.getState().time;
    const check = () => {
      const st = useStore.getState();
      // Strike SFX: boom when playback crosses a detonation time
      const prev = prevTimeRef.current;
      prevTimeRef.current = st.time;
      for (const x of expandStrikes(st.scenario.strikes)) {
        if (x.appearAt > prev && x.appearAt <= st.time) boom(x.size);
      }
      if (!st.narration.enabled) return;
      const active = [...st.scenario.keyframes]
        .sort((a, b) => a.time - b.time)
        .filter((k) => k.time <= st.time)
        .pop();
      if (active && active.caption && active.id !== spokenRef.current) {
        spokenRef.current = active.id;
        // a shot that repeats the previous caption doesn't say it again
        if (active.caption === spokenCaptionRef.current) return;
        // lines marked text-only are shown but not spoken
        if (active.narrate === false) {
          spokenCaptionRef.current = active.caption;
          return;
        }
        spokenCaptionRef.current = active.caption;
        const caption = active.caption;
        const kfId = active.id;
        const { engine, voice, rate } = st.narration;
        const pack = st.scenario.narrationPack;
        if (!pack) {
          narrate(caption, engine, voice, rate);
        } else {
          // prefer the pre-recorded line when its text still matches the caption
          loadNarrationPack(pack).then((m) => {
            const item = m?.items[kfId];
            if (useStore.getState().time < active.time - 0.5) return; // scrubbed away meanwhile
            if (item && item.text === caption) {
              narrateRecorded(`${import.meta.env.BASE_URL}${pack}/${item.file}`, caption, engine, voice, rate);
            } else {
              narrate(caption, engine, voice, rate);
            }
          });
        }
      }
    };
    check();
    const unsub = useStore.subscribe(check);
    return unsub;
  }, [playing]);

  // snap ground movement to real roads
  useEffect(() => startRouting(), []);

  // fetch the narrator's voice model only once a scenario that speaks is
  // opened (viewer) or played (editor) — never on a plain first visit
  useEffect(() => {
    const st = useStore.getState();
    const n = st.narration;
    if (
      (viewer || playing) &&
      hasVoiceLines &&
      n.enabled &&
      n.engine === 'kokoro' &&
      n.consent !== 'text' &&
      !st.scenario.narrationPack
    ) {
      preloadKokoro();
    }
  }, [viewer, playing, hasVoiceLines, narrationPack]);

  // first spoken caption authored in the editor: ask before pulling the ~90MB model
  useEffect(() => {
    if (voicePromptAsked || viewer || !hasVoiceLines) return;
    const st = useStore.getState();
    if (st.narration.enabled && st.narration.engine === 'kokoro' && kokoroState() === 'idle') {
      voicePromptAsked = true;
      useStore.setState({ voicePromptPending: true });
    }
  }, [hasVoiceLines, viewer]);

  // recorded narration: fetch the whole pack as soon as the scenario opens
  useEffect(() => {
    if (narrationPack) preloadNarrationPack(narrationPack);
  }, [narrationPack]);

  // rotor sound follows the nearest helicopter while the scenario plays
  useEffect(() => {
    if (!playing) {
      setRotor(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const mix = useStore.getState().mapApi?.rotorMix();
      if (mix) setRotor(mix.level, mix.pan, mix.load);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setRotor(0);
    };
  }, [playing]);

  // open scenarios carried in a share link, or a demo named in the URL (?demo=binladen-raid)
  useEffect(() => {
    readShareLink().then((shared) => {
      if (!shared) {
        // ?scenario=<url>: load a hosted scenario JSON (validated) into the read-only player
        const remote = new URLSearchParams(window.location.search).get('scenario');
        if (remote) {
          fetch(remote)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(async (json) => {
              const { ok, errors } = await validateScenarioJson(json);
              if (!ok) throw new Error(`invalid scenario:\n${errors.slice(0, 8).join('\n')}`);
              const st = useStore.getState();
              if (st.importScenario(json, { persist: false })) {
                st.setViewer(true);
                st.setCameraLock(true);
              }
            })
            .catch((e) => alert(`Could not load scenario from URL.\n${(e as Error).message}`));
          return;
        }
        const demo = demoFromUrl();
        if (demo) {
          const st = useStore.getState();
          st.loadDemo(demo, { persist: false });
          st.setViewer(true);
          st.setCameraLock(true);
        }
        return;
      }
      const st = useStore.getState();
      if (shared.mode === 'view') {
        if (st.importScenario(shared.json, { persist: false })) {
          st.setViewer(true);
          st.setCameraLock(true);
        }
      } else if (st.importScenario(shared.json)) {
        clearShareHash();
      } else {
        alert('This share link is damaged or incomplete.');
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (e.key === 'Escape') {
        if (st.draft.length) st.cancelDraft();
        else if (st.selection) st.setSelection(null);
        else if (st.cameraLock) st.setCameraLock(false);
      } else if (e.key === 'Enter' && st.draft.length) {
        st.finishDraft();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection) {
        e.preventDefault();
        st.deleteSelection();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!st.playing) st.setCameraLock(true);
        st.setPlaying(!st.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`app ${playing ? 'presenting' : ''} look-${look} ${viewer ? 'viewer' : ''} view-${sensor}`}
      data-tool={tool}
    >
      <div className="letterbox top" />
      <div className="letterbox bottom" />
      <div className="vignette" />
      <MapView />
      <TopBar />
      <Toolbar />
      <RosterPanel />
      <div className="right-stack">
        <FactionPanel />
        <EnvironmentPanel />
        <PropertiesPanel />
      </div>
      <Timeline />
      {sensor !== 'normal' && <SensorOverlay view={sensor} />}
      <MediaOverlay />
      <CaptionOverlay />
      <TranscriptPane />
      <ConsentModal />
      <VoiceModelDialog />
      {viewer && <ViewerBar />}
      <TacticalHud />
    </div>
  );
}
