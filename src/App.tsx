import { useEffect, useRef } from 'react';
import MapView from './components/MapView';
import Toolbar from './components/Toolbar';
import RosterPanel from './components/RosterPanel';
import FactionPanel from './components/FactionPanel';
import PropertiesPanel from './components/PropertiesPanel';
import Timeline from './components/Timeline';
import TopBar from './components/TopBar';
import { useStore } from './store';
import { narrate, stopNarration } from './narration';
import { boom } from './audio';
import { expandStrikes } from './particles';
import { startRouting } from './routing';
import { clearShareHash, readShareLink } from './share';
import { lossesByFaction } from './combat';
import { hourAt } from './environment';
import EnvironmentPanel from './components/EnvironmentPanel';

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

export default function App() {
  const playing = useStore((s) => s.playing);
  const look = useStore((s) => s.look);
  const viewer = useStore((s) => s.viewer);
  const sensor = useSensorView();
  const spokenRef = useRef<string | null>(null);
  const prevTimeRef = useRef(0);

  // Narration: speak the caption of the keyframe that becomes active
  useEffect(() => {
    if (!playing) {
      spokenRef.current = null;
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
        narrate(
          active.caption,
          st.narration.engine,
          st.narration.voice,
          st.narration.rate,
        );
      }
    };
    check();
    const unsub = useStore.subscribe(check);
    return unsub;
  }, [playing]);

  // snap ground movement to real roads
  useEffect(() => startRouting(), []);

  // open scenarios carried in a share link
  useEffect(() => {
    readShareLink().then((shared) => {
      if (!shared) return;
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
    <div className={`app ${playing ? 'presenting' : ''} look-${look} ${viewer ? 'viewer' : ''} view-${sensor}`}>
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
      <CaptionOverlay />
      {viewer && <ViewerBar />}
      <TacticalHud />
    </div>
  );
}
