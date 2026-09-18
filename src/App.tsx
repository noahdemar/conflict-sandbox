import { useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import Toolbar from './components/Toolbar';
import RosterPanel from './components/RosterPanel';
import FactionPanel from './components/FactionPanel';
import PropertiesPanel from './components/PropertiesPanel';
import Timeline from './components/Timeline';
import TopBar from './components/TopBar';
import { useStore } from './store';
import { loadNarrationPack, narrate, narrateRecorded, preloadKokoro, preloadNarrationPack, setVoiceGeneration, stopNarration } from './narration';
import { arrowVolley, boom, gallop, gunshot, meleeClash, setRotor } from './audio';
import { expandStrikes, weaponKind } from './particles';
import { strikeLaunchAt } from './realism';
import { startRouting } from './routing';
import { preloadAssets } from './assets';
import { clearShareHash, readShareLink } from './share';
import { DEMOS, demoFromUrl, type DemoId } from './demos';
import { validateScenarioJson } from './scenarioValidation';
import { reportLines, reviewScenario, type ReviewIssue } from './review';
import ReviewBar from './components/ReviewBar';
import { lossesByFaction } from './combat';
import { hourAt } from './environment';
import OrbatOverlay from './components/OrbatOverlay';
import type { ShotOverlay, Unit, UnitType } from './types';
import EnvironmentPanel from './components/EnvironmentPanel';
import TranscriptPane from './components/TranscriptPane';
import ConsentModal from './components/ConsentModal';
import NarrationPanel from './components/NarrationPanel';
import ArticleView from './components/ArticleView';
import AerialView from './components/AerialView';

const TYPE_TERMS: Record<UnitType, string[]> = {
  infantry: ['Syrian Democratic Forces', 'women and children', 'special operators', 'operators', 'assault team', 'troops', 'fighters', 'infantry', 'teams', 'team', 'Cairo'],
  armor: ['fighting vehicles', 'armored vehicles', 'vehicles', 'tanks', 'tank', 'column'],
  artillery: ['remaining batteries', 'batteries', 'howitzers', 'artillery', 'guns'],
  air: ['Apache helicopters', 'Strike Eagles', 'A C 130', 'Raptors', 'modified Black Hawk helicopters', 'Black Hawk helicopters', 'helicopters', 'helicopter', 'Chinooks', 'Sentinel surveillance drone', 'Reaper drone', 'Black Hawk', 'aircraft', 'gunship', 'bomber', 'satellites', 'satellite', 'drone'],
  naval: ['warships', 'ships', 'fleet'],
  missile: ['rocket artillery', 'Grad rockets', 'rockets', 'missiles'],
  hq: ['command team', 'headquarters', 'command post'],
};

function highlightedCaption(text: string, units: Unit[], factions: { id: string; name: string; color: string }[]) {
  const terms = new Map<string, string>();
  const colorFor = (u: Unit) => factions.find((f) => f.id === u.factionId)?.color ?? '#888';
  for (const u of units) if (u.name.trim().length > 2) terms.set(u.name.toLowerCase(), colorFor(u));
  for (const type of Object.keys(TYPE_TERMS) as UnitType[]) {
    const typed = units.filter((u) => u.type === type);
    const colors = new Set(typed.map(colorFor));
    if (colors.size === 1) for (const term of TYPE_TERMS[type]) terms.set(term.toLowerCase(), [...colors][0]);
  }
  for (const faction of factions.filter((f) => units.some((u) => u.factionId === f.id))) {
    const name = faction.name.toLowerCase();
    terms.set(name, faction.color);
    if (name === 'united states') {
      terms.set('american special operators', faction.color);
      terms.set('special operators', faction.color);
      terms.set('assault team', faction.color);
      terms.set('american', faction.color);
    }
    if (name === 'sdf') terms.set('syrian democratic forces', faction.color);
    if (name === 'pro-government force') {
      terms.set('pro-government', faction.color);
      terms.set('wagner', faction.color);
    }
    if (name === 'non-combatants') terms.set('women and children', faction.color);
  }
  const matches = [...terms.keys()].filter((term) => text.toLowerCase().includes(term)).sort((a, b) => b.length - a.length);
  if (!matches.length) return text;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${matches.map(escape).join('|')})`, 'gi'));
  return parts.map((part, i) => {
    const color = terms.get(part.toLowerCase());
    return color ? (
      <span
        className="unit-mention"
        style={{ '--hc': color } as React.CSSProperties}
        key={`${part}-${i}`}
      >
        {part}
      </span>
    ) : part;
  });
}

/** Slide-style caption of the most recent keyframe at the current time. */
function CaptionOverlay() {
  const time = useStore((s) => s.time);
  const keyframes = useStore((s) => s.scenario.keyframes);
  const units = useStore((s) => s.scenario.units);
  const factions = useStore((s) => s.scenario.factions);
  const playing = useStore((s) => s.playing);
  const cameraLock = useStore((s) => s.cameraLock);
  if (!playing && !cameraLock) return null;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const active = sorted.filter((k) => k.time <= time).pop();
  if (!active?.caption) return null;
  const phase = sorted.indexOf(active) + 1;
  const ids = new Set(active.highlightUnitIds ?? []);
  const caption = highlightedCaption(active.caption, units.filter((u) => ids.has(u.id)), factions);
  return (
    <div className="caption-overlay" key={active.id}>
      <div className="caption-kicker">
        <span className="caption-dot" />
        PHASE {phase} / {sorted.length}
      </div>
      <div className="caption-text">{caption}</div>
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

/** Shown after a viewer pans or zooms during playback: hands the camera back to the script. */
function FollowCameraButton() {
  const show = useStore((s) => s.cameraOverride && (s.playing || s.cameraLock));
  if (!show) return null;
  return (
    <button className="top-btn active follow-camera" onClick={() => useStore.setState({ cameraOverride: false })}>
      Follow camera
    </button>
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

/** On-screen graphic the active camera keyframe flashes up, during playback or preview. */
function useActiveOverlay(): ShotOverlay | null {
  return useStore((s) => {
    if (!s.playing && !s.cameraLock) return null;
    const active = [...s.scenario.keyframes].sort((a, b) => a.time - b.time).filter((k) => k.time <= s.time).pop();
    return active?.overlay ?? null;
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

/**
 * Parks the validation report where a browser-driving assistant can read it:
 * `window.__openbriefReport`. Same content as the on-screen panel and the
 * console output, so an agent can iterate without watching the film.
 */
function publishReport(report: { ok: boolean; errors: string[]; notes: string[]; issues: ReviewIssue[] }) {
  (window as unknown as { __openbriefReport?: unknown }).__openbriefReport = report;
  window.dispatchEvent(new CustomEvent('openbrief:report', { detail: report }));
}

export default function App() {
  const playing = useStore((s) => s.playing);
  const look = useStore((s) => s.look);
  const viewer = useStore((s) => s.viewer);
  // view links and the editor's preview open the article presentation
  const article = useStore((s) => s.viewer || s.articlePreview);
  const embed = useStore((s) => s.embed);
  const exploring = useStore((s) => s.exploring);
  const historical = useStore((s) => s.scenario.era === 'historical');
  const sensor = useSensorView();
  const tool = useStore((s) => s.tool);
  const narrationPack = useStore((s) => s.scenario.narrationPack);
  // an editor explicitly allowed generating voice for unrecorded lines
  const allowGeneration = useStore((s) => !s.viewer && s.narration.allowGeneration);
  const overlay = useActiveOverlay();
  const [remoteError, setRemoteError] = useState<string[] | null>(null);
  const [remoteWarnings, setRemoteWarnings] = useState<string[]>([]);
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
    let disposed = false;
    let eventScenario: ReturnType<typeof useStore.getState>['scenario'] | undefined;
    let events: { strike: ReturnType<typeof expandStrikes>[number]; kind: ReturnType<typeof weaponKind>; at: number }[] = [];
    const check = () => {
      const st = useStore.getState();
      if (!st.playing) return;
      const discontinuity = st.time < prevTimeRef.current || st.time - prevTimeRef.current > Math.max(0.5, st.speed * 0.5);
      if (discontinuity || (eventScenario && eventScenario !== st.scenario)) {
        stopNarration();
        spokenRef.current = null;
        spokenCaptionRef.current = null;
      }
      if (eventScenario !== st.scenario) {
        eventScenario = st.scenario;
        events = expandStrikes(st.scenario.strikes, st.scenario.units).flatMap((strike) => {
          const kind = weaponKind(strike.name);
          const at = kind === 'gun' || kind === 'arrow' ? strikeLaunchAt(st.scenario, strike) : strike.appearAt;
          if (kind !== 'gun' && kind !== 'arrow' && st.scenario.strikes.some((x) =>
            x.targetStrikeId === strike.id.split('#')[0] && x.appearAt < at && x.appearAt > strikeLaunchAt(st.scenario, strike))) return [];
          return [{ strike, kind, at }];
        });
      }
      // Strike SFX: boom when playback crosses a detonation time
      const prev = prevTimeRef.current;
      prevTimeRef.current = st.time;
      for (const { strike: x, kind, at } of events) {
        // a salvo of arrows is one volley sound, not one per arrow
        if (kind === 'arrow' && x.id.includes('#')) continue;
        if (kind === 'melee' && x.id.includes('#')) continue;
        // gunshots crack and bows loose at launch; blasts and melee land on impact
        const t0 = at;
        if (!discontinuity && t0 > prev && t0 <= st.time) {
          if (kind === 'gun') gunshot(/suppress|silenc|subsonic/i.test(x.name), 0.5 + x.size * 5);
          else if (kind === 'arrow') arrowVolley(0.6 + x.size * 2);
          else if (kind === 'melee') {
            meleeClash(0.6 + x.size * 2);
            if (/cavalry|horse|mounted|charge/i.test(x.name)) gallop(0.8, 2);
          } else boom(x.size);
        }
      }
      // article scenes stay silent unless the reader turned narration on
      if (!st.narration.enabled || ((st.viewer || st.articlePreview) && !st.articleNarration)) {
        if (spokenRef.current !== null) stopNarration();
        spokenRef.current = null;
        spokenCaptionRef.current = null;
        return;
      }
      const sorted = [...st.scenario.keyframes].sort((a, b) => a.time - b.time);
      const active = sorted.filter((k) => k.time <= st.time).pop();
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
        let first = sorted.indexOf(active);
        while (first > 0 && sorted[first - 1].caption === caption && sorted[first - 1].narrate !== false) first--;
        const captionStart = sorted[first].time;
        const kfId = active.id;
        const { voice } = st.narration;
        const rate = st.narration.rate * st.speed;
        const engine = 'kokoro';
        const generate = !st.viewer && st.narration.allowGeneration;
        const pack = st.scenario.narrationPack;
        if (!pack) {
          // no recordings: speak only if an editor allowed generation, else text only
          if (generate) narrate(caption, engine, voice, rate);
        } else {
          // prefer the pre-recorded line when its text still matches the caption
          loadNarrationPack(pack).then((m) => {
            const item = m?.items[kfId];
            const current = useStore.getState();
            if (disposed || !current.playing || current.scenario !== st.scenario || spokenRef.current !== kfId ||
              !current.narration.enabled || ((current.viewer || current.articlePreview) && !current.articleNarration)) return;
            if (current.time < active.time - 0.5) return; // scrubbed away meanwhile
            if (item && item.text === caption) {
              narrateRecorded(`${import.meta.env.BASE_URL}${pack}/${item.file}`, caption, engine, voice, rate,
                Math.max(0, current.time - captionStart) * st.narration.rate);
            } else if (generate) {
              narrate(caption, engine, voice, rate);
            }
          });
        }
      }
    };
    check();
    const unsub = useStore.subscribe(check);
    return () => {
      disposed = true;
      unsub();
      stopNarration();
    };
  }, [playing]);

  // uploaded icons and models live in this browser; load them once
  useEffect(() => {
    void preloadAssets();
  }, []);

  // snap ground movement to real roads
  useEffect(() => startRouting(), []);

  // the speech library loads only after an editor opts in; viewers never fetch it
  useEffect(() => {
    setVoiceGeneration(allowGeneration);
    if (allowGeneration) preloadKokoro();
  }, [allowGeneration]);

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
        const params = new URLSearchParams(window.location.search);
        // ?remix=<demo id>: open a finished example in the editor, ready to change
        const remix = params.get('remix');
        if (remix && DEMOS.some((d) => d.id === remix)) {
          const st = useStore.getState();
          st.loadDemo(remix as DemoId);
          // land on the opening shot rather than wherever the map happened to be
          const first = st.scenario.keyframes[0] ?? useStore.getState().scenario.keyframes[0];
          if (first) setTimeout(() => useStore.getState().goToKeyframe(first.id), 300);
          return;
        }
        // ?scenario=<url>: load a hosted scenario JSON (resolved and validated) into
        // the read-only player. The whole report is also parked on
        // window.__openbriefReport, so an assistant driving a browser can read it
        // instead of squinting at screenshots.
        const remote = params.get('scenario');
        if (remote) {
          fetch(remote)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(async (json) => {
              const result = await validateScenarioJson(json);
              if (!result.ok || !result.json || !result.scenario) {
                // in-page + console so browser-driving assistants can read them too
                console.error(`scenario failed validation:\n${result.errors.join('\n')}`);
                setRemoteError(result.errors.slice(0, 12));
                publishReport({ ok: false, errors: result.errors, notes: result.notes, issues: [] });
                return;
              }
              const st = useStore.getState();
              if (st.importScenario(result.json, { persist: false })) {
                st.setViewer(true);
                st.setCameraLock(true);
                const report = reviewScenario(result.scenario, result.roster, result.duration);
                st.setReview(report.issues);
                const lines = reportLines(report);
                if (result.notes.length) console.info(`resolved:\n${result.notes.join('\n')}`);
                if (lines.length) {
                  console.warn(`scenario report:\n${lines.join('\n')}`);
                  setRemoteWarnings(lines.slice(0, 20));
                }
                publishReport({ ok: report.ok, errors: [], notes: result.notes, issues: report.issues });
              }
            })
            .catch((e) => {
              console.error('scenario load failed:', e);
              setRemoteError([`Could not load scenario from URL: ${(e as Error).message}`]);
              publishReport({ ok: false, errors: [(e as Error).message], notes: [], issues: [] });
            });
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
      if (shared.mode === 'view' || st.embed) {
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
      className={`app ${playing && !article ? 'presenting' : ''} look-${look} ${viewer ? 'viewer' : ''} ${article ? 'article-mode' : ''} ${embed ? 'embed' : ''} ${exploring ? 'exploring-map' : ''} ${historical ? 'era-historical' : ''} view-${sensor}`}
      data-tool={tool}
    >
      <div className="letterbox top" />
      <div className="letterbox bottom" />
      <div className="vignette" />
      {article && <ArticleView />}
      <div className="map-stage">
        <MapView />
        <AerialView />
        {article && (
          <a
            className="create-own"
            href={`${window.location.origin}${import.meta.env.BASE_URL}`}
            target="_blank"
            rel="noreferrer"
            title="Make an illustrated map article of your own with OpenBrief"
          >
            Create your own
          </a>
        )}
        {sensor !== 'normal' && <SensorOverlay view={sensor} />}
        {overlay === 'orbat' && <OrbatOverlay />}
      </div>
      {!article && (
        <>
          <TopBar />
          <Toolbar />
          <RosterPanel />
          <div className="right-stack">
            <FactionPanel />
            <EnvironmentPanel />
            <NarrationPanel />
            <PropertiesPanel />
          </div>
        </>
      )}
      {/* the timeline also drives the playback clock, so it stays mounted (hidden) in the article */}
      <Timeline />
      {!article && (
        <>
          <MediaOverlay />
          <CaptionOverlay />
          <TranscriptPane />
          {!historical && <TacticalHud />}
          <FollowCameraButton />
        </>
      )}
      <ConsentModal />
      {!article && <ReviewBar />}
      {remoteError && (
        <div className="remote-report" role="alert">
          <div className="remote-report-head">
            <strong>Scenario failed validation</strong>
            <button className="icon-btn" onClick={() => setRemoteError(null)} title="Dismiss">×</button>
          </div>
          <ul>
            {remoteError.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {remoteWarnings.length > 0 && (
        <div className="remote-report remote-warnings" role="status">
          <div className="remote-report-head">
            <strong>{remoteWarnings.length} thing{remoteWarnings.length === 1 ? '' : 's'} to check</strong>
            <button className="icon-btn" onClick={() => setRemoteWarnings([])} title="Dismiss">×</button>
          </div>
          <ul>
            {remoteWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
