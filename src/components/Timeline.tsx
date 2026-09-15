import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Diamond,
  Rows3,
  ScrollText,
  Pause,
  Play,
  SkipBack,
} from 'lucide-react';
import { useStore } from '../store';
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
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  const raf = useRef<number>(0);
  const lastTs = useRef<number>(0);
  const [preparing, setPreparing] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const transcriptOpen = useStore((s) => s.transcriptOpen);
  const setTranscriptOpen = useStore((s) => s.setTranscriptOpen);

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
    const onVisibility = () => {
      if (document.hidden) useStore.getState().setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playing]);

  const events = useMemo(() => [
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
  ], [scenario]);

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
          className={`icon-btn tl-transcript-btn ${transcriptOpen ? 'narr-on' : ''}`}
          title="Transcript"
          onClick={() => setTranscriptOpen(!transcriptOpen)}
        >
          <ScrollText size={15} />
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
            if (playing) setPlaying(false);
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
              title={`Keyframe @ ${k.time}s${k.caption ? `: ${k.caption}` : ''}`}
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
    </div>
    </>
  );
}
