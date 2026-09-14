import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Diamond,
  Rows3,
  Pause,
  Play,
  SkipBack,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useStore } from '../store';
import {
  KOKORO_VOICES,
  narrate,
  onKokoroStatus,
  preloadKokoro,
  webSpeechVoices,
} from '../narration';
import { startRecording, stopRecording } from '../recorder';
import TimelineTracks from './TimelineTracks';

export default function Timeline() {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const duration = useStore((s) => s.duration);
  const setTime = useStore((s) => s.setTime);
  const setPlaying = useStore((s) => s.setPlaying);
  const setDuration = useStore((s) => s.setDuration);
  const scenario = useStore((s) => s.scenario);
  const addKeyframe = useStore((s) => s.addKeyframe);
  const goToKeyframe = useStore((s) => s.goToKeyframe);
  const setCameraLock = useStore((s) => s.setCameraLock);
  const selection = useStore((s) => s.selection);
  const narration = useStore((s) => s.narration);
  const setNarration = useStore((s) => s.setNarration);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  const raf = useRef<number>(0);
  const lastTs = useRef<number>(0);
  const [voices, setVoices] = useState(webSpeechVoices());
  const [kokoroMsg, setKokoroMsg] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);

  // Auto-stop recording when playback ends or is paused
  useEffect(() => {
    if (!playing && recording) {
      stopRecording();
      setRecording(false);
    }
  }, [playing, recording, setRecording]);

  const toggleRecord = async () => {
    if (recording) {
      setPlaying(false); // effect above stops + saves
      return;
    }
    if (preparing) return;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.map-container canvas',
    );
    if (!canvas) return;
    // Preload every tile along the camera path so the take is clean
    setPreparing(true);
    setCameraLock(true);
    try {
      await useStore.getState().mapApi?.warmup();
    } finally {
      setPreparing(false);
    }
    setTime(0);
    setRecording(true);
    startRecording(canvas, scenario.name);
    setPlaying(true);
  };

  useEffect(() => {
    onKokoroStatus(setKokoroMsg);
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setVoices(webSpeechVoices());
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  useEffect(() => {
    if (!playing) return;
    lastTs.current = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const st = useStore.getState();
      const next = st.time + dt * st.speed;
      if (next >= st.duration) {
        st.setTime(st.duration);
        st.setPlaying(false);
        st.setCameraLock(false);
        return;
      }
      st.setTime(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const events = [
    ...scenario.units.map((u) => ({ t: u.appearAt, c: '#e8c04a' })),
    ...scenario.arrows.map((a) => ({
      t: a.appearAt,
      c: scenario.factions.find((f) => f.id === a.factionId)?.color ?? '#fff',
    })),
    ...scenario.territories.map((t) => ({
      t: t.appearAt,
      c: scenario.factions.find((f) => f.id === t.factionId)?.color ?? '#fff',
    })),
    ...scenario.labels.map((l) => ({ t: l.appearAt, c: '#9a9284' })),
    ...scenario.strikes.map((x) => ({ t: x.appearAt, c: '#ff8c3a' })),
  ];

  return (
    <>
    {tracksOpen && !playing && <TimelineTracks onClose={() => setTracksOpen(false)} />}
    <div className="panel timeline">
      <div className="tl-controls">
        <button
          className="icon-btn"
          title="Back to start"
          onClick={() => {
            setPlaying(false);
            setTime(0);
          }}
        >
          <SkipBack size={15} />
        </button>
        <button
          className="icon-btn play-btn"
          title={playing ? 'Pause' : 'Play scenario'}
          onClick={() => {
            if (!playing) setCameraLock(true);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="icon-btn"
          title="Add camera keyframe at current time & view"
          onClick={addKeyframe}
        >
          <Diamond size={14} />
        </button>
        <button
          className={`icon-btn rec-btn ${recording ? 'recording' : ''} ${preparing ? 'recording' : ''}`}
          title={
            preparing
              ? 'Preloading tiles…'
              : recording
                ? 'Stop & save video'
                : 'Record playback to WebM'
          }
          onClick={toggleRecord}
        >
          <Circle size={13} fill="currentColor" />
        </button>
        <button
          className={`icon-btn tl-tracks-btn ${tracksOpen ? 'narr-on' : ''}`}
          title="Edit timing on per-unit tracks"
          onClick={() => setTracksOpen(!tracksOpen)}
        >
          <Rows3 size={15} />
        </button>
        <select
          className="tl-speed"
          value={speed}
          title="Playback speed"
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
        <span className="tl-clock">
          {time.toFixed(1)}s / {duration}s
        </span>
      </div>
      <div className="tl-track-wrap">
        <input
          className="tl-scrub"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={time}
          onChange={(e) => {
            setCameraLock(true);
            setTime(Number(e.target.value));
          }}
        />
        <div className="tl-marks">
          {events.map((ev, i) => (
            <div
              key={i}
              className="tl-mark"
              style={{
                left: `${(ev.t / duration) * 100}%`,
                background: ev.c,
              }}
            />
          ))}
          {scenario.keyframes.map((k) => (
            <button
              key={k.id}
              className={`tl-key ${
                selection?.kind === 'keyframe' && selection.id === k.id
                  ? 'selected'
                  : ''
              }`}
              style={{ left: `${(k.time / duration) * 100}%` }}
              title={`Keyframe @ ${k.time}s${k.caption ? ` — ${k.caption}` : ''}`}
              onClick={() => goToKeyframe(k.id)}
            />
          ))}
        </div>
      </div>
      <label className="tl-duration">
        Length
        <input
          type="number"
          min={5}
          max={600}
          value={duration}
          onChange={(e) => setDuration(Math.max(5, Number(e.target.value)))}
        />
        s
      </label>
      <div className="tl-narration">
        <button
          className={`icon-btn ${narration.enabled ? 'narr-on' : ''}`}
          title={narration.enabled ? 'Narration on' : 'Narration off'}
          onClick={() => setNarration({ enabled: !narration.enabled })}
        >
          {narration.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        {narration.enabled && (
          <>
            <select
              className="tl-engine"
              value={narration.engine}
              title="Voice engine"
              onChange={(e) => {
                const engine = e.target.value as 'webspeech' | 'kokoro';
                setNarration({ engine, voice: null });
                if (engine === 'kokoro') preloadKokoro();
              }}
            >
              <option value="webspeech">Browser voice</option>
              <option value="kokoro">Local model (Kokoro)</option>
            </select>
            <select
              className="tl-voice"
              value={narration.voice ?? ''}
              title="Voice"
              onChange={(e) => setNarration({ voice: e.target.value || null })}
            >
              <option value="">Default</option>
              {(narration.engine === 'kokoro' ? KOKORO_VOICES : voices).map(
                (v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ),
              )}
            </select>
            <button
              className="icon-btn"
              title="Preview voice"
              onClick={() =>
                narrate(
                  'Armored columns advance toward the capital.',
                  narration.engine,
                  narration.voice,
                  narration.rate,
                  true,
                )
              }
            >
              <Play size={12} />
            </button>
          </>
        )}
      </div>
      {kokoroMsg && narration.engine === 'kokoro' && (
        <div className="tl-kokoro-status">{kokoroMsg}</div>
      )}
    </div>
    </>
  );
}
