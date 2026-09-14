/**
 * Narration engine for keyframe captions.
 * Engines:
 *  - 'webspeech': built-in browser TTS, instant, no download
 *  - 'kokoro': Kokoro-82M local model via kokoro-js (ONNX, runs fully
 *    in-browser; ~90MB one-time download, cached afterwards)
 */

import { routeElement } from './audio';

export type NarrationEngine = 'webspeech' | 'kokoro';

export interface VoiceOption {
  id: string;
  label: string;
}

export const KOKORO_VOICES: VoiceOption[] = [
  { id: 'af_heart', label: 'Heart (F, US)' },
  { id: 'af_bella', label: 'Bella (F, US)' },
  { id: 'am_michael', label: 'Michael (M, US)' },
  { id: 'am_adam', label: 'Adam (M, US)' },
  { id: 'bf_emma', label: 'Emma (F, UK)' },
  { id: 'bm_george', label: 'George (M, UK)' },
];

export function webSpeechVoices(): VoiceOption[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .map((v) => ({ id: v.voiceURI, label: `${v.name} (${v.lang})` }));
}

type KokoroTTS = {
  generate: (
    text: string,
    opts: { voice: string },
  ) => Promise<{ toBlob: () => Blob } | { audio: Float32Array; sampling_rate: number }>;
};

let kokoroPromise: Promise<KokoroTTS> | null = null;
let kokoroStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

/** Voice model download/load state for the UI. `pct` is 0..100 while downloading. */
export interface KokoroProgress {
  state: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  pct: number | null;
  loadedMB: number;
  totalMB: number;
}

const listeners = new Set<(p: KokoroProgress) => void>();
let lastProgress: KokoroProgress = { state: 'idle', message: '', pct: null, loadedMB: 0, totalMB: 0 };

/** Subscribe to model download progress; called immediately with the current state. */
export function onKokoroStatus(fn: (p: KokoroProgress) => void): () => void {
  listeners.add(fn);
  fn(lastProgress);
  return () => listeners.delete(fn);
}

function setStatus(s: typeof kokoroStatus, msg?: string, bytes?: { loaded: number; total: number }) {
  kokoroStatus = s;
  lastProgress = {
    state: s,
    message: msg ?? s,
    pct: bytes && bytes.total > 0 ? Math.min(100, (bytes.loaded / bytes.total) * 100) : s === 'ready' ? 100 : null,
    loadedMB: bytes ? bytes.loaded / 1e6 : lastProgress.loadedMB,
    totalMB: bytes ? bytes.total / 1e6 : lastProgress.totalMB,
  };
  listeners.forEach((fn) => fn(lastProgress));
}

export function kokoroState() {
  return kokoroStatus;
}

async function loadKokoro(): Promise<KokoroTTS> {
  if (!kokoroPromise) {
    setStatus('loading', 'Preparing voice model…');
    // aggregate byte progress across every file the model needs
    const files = new Map<string, { loaded: number; total: number }>();
    kokoroPromise = import('kokoro-js')
      .then(async (mod) => {
        const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8',
          progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
            if (!e.file) return;
            if (e.status === 'progress' && e.total) {
              files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
            } else if (e.status === 'done') {
              const f = files.get(e.file);
              if (f) f.loaded = f.total;
            } else {
              return;
            }
            let loaded = 0;
            let total = 0;
            files.forEach((f) => {
              loaded += f.loaded;
              total += f.total;
            });
            setStatus('loading', 'Downloading voice model (one-time)', { loaded, total });
          },
        });
        setStatus('ready', 'Voice model ready');
        return tts as unknown as KokoroTTS;
      })
      .catch((e) => {
        kokoroPromise = null;
        setStatus('error', 'Local model failed — using browser voice');
        throw e;
      });
  }
  return kokoroPromise;
}

/** Pre-warm the local model so first narration is instant. */
export function preloadKokoro() {
  loadKokoro().catch(() => undefined);
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Latest caption waiting for the current line to finish (older ones are dropped). */
type Queued = { text: string; engine: NarrationEngine; voiceId: string | null; rate: number; file?: string; at: number };
/** Lines waiting for the current one to finish, oldest first. */
let queue: Queued[] = [];
/** A waiting line older than this is dropped if something newer is also waiting. */
const STALE_MS = 3500;
let speaking = false;

export function stopNarration() {
  queue = [];
  speaking = false;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/**
 * Most natural-sounding male English system voice available, used when no
 * voice is chosen. Browsers don't expose voice gender, so voices are ranked
 * by name: neural/"Natural" voices (Edge), Google UK Male (Chrome), Apple's
 * Premium/Enhanced and standard male voices; robotic and novelty voices and
 * female voices rank last.
 */
export function bestWebVoice(): SpeechSynthesisVoice | undefined {
  if (!('speechSynthesis' in window)) return undefined;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  const MALE =
    /\b(guy|davis|andrew|brian|christopher|eric|roger|steffan|ryan|thomas|william|liam|connor|tony|jason|evan|nathan|aaron|arthur|oliver|tom|alex|daniel|gordon|lee|male)\b/i;
  const FEMALE =
    /\b(samantha|ava|zoe|allison|susan|karen|moira|tessa|fiona|victoria|aria|jenny|emma|michelle|sonia|libby|natasha|serena|kate|kathy|nicky|joanna|female|flo|sandy|shelley|grandma)\b/i;
  const ROBOTIC =
    /compact|eloquence|espeak|novelty|bad news|good news|bahh|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|albert|jester|organ|superstar|wobble|fred|ralph|junior|grandpa|rocko|eddy|reed/i;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name;
    let sc = 0;
    if (/natural|neural/i.test(n)) sc += 100;
    if (/premium/i.test(n)) sc += 80;
    if (/enhanced/i.test(n)) sc += 70;
    if (/^google/i.test(n)) sc += 40;
    if (MALE.test(n)) sc += 60;
    if (FEMALE.test(n)) sc -= 60;
    if (ROBOTIC.test(n)) sc -= 200;
    if (/en-(us|gb)/i.test(v.lang)) sc += 5;
    return sc;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

function speakWeb(text: string, voiceId: string | null, rate: number) {
  if (!('speechSynthesis' in window)) return;
  const utt = new SpeechSynthesisUtterance(text);
  const voice =
    window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceId) ?? bestWebVoice();
  if (voice) utt.voice = voice;
  utt.rate = rate;
  utt.onend = utt.onerror = () => {
    speaking = false;
    playPending();
  };
  speaking = true;
  window.speechSynthesis.speak(utt);
}

function playPending() {
  const now = performance.now();
  // skip lines that have fallen too far behind, as long as a newer one is waiting
  while (queue.length > 1 && now - queue[0].at > STALE_MS) queue.shift();
  const next = queue.shift();
  if (!next) return;
  if (next.file) {
    playFile(next.file, next.rate).catch(() => speak(next.text, next.engine, next.voiceId, next.rate));
  } else {
    speak(next.text, next.engine, next.voiceId, next.rate);
  }
}

/** Play a pre-recorded narration line through the recordable audio bus. */
async function playFile(url: string, rate: number) {
  if (currentAudio) currentAudio.pause();
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  currentAudio = new Audio(url);
  currentAudio.crossOrigin = 'anonymous';
  currentAudio.playbackRate = rate;
  speaking = true;
  currentAudio.onended = () => {
    speaking = false;
    playPending();
  };
  try {
    routeElement(currentAudio);
  } catch {
    /* element already routed */
  }
  try {
    await currentAudio.play();
  } catch (e) {
    speaking = false;
    throw e;
  }
}

/**
 * Speak a caption from a pre-recorded file when one is available, queued the
 * same way as live speech; falls back to live synthesis if the file fails.
 */
export function narrateRecorded(
  file: string,
  text: string,
  engine: NarrationEngine,
  voiceId: string | null,
  rate = 1,
) {
  if (speaking) {
    queue.push({ text, engine, voiceId, rate, file, at: performance.now() });
    return;
  }
  playFile(file, rate).catch(() => speak(text, engine, voiceId, rate));
}

type Manifest = { voice: string; items: Record<string, { text: string; file: string }> };
const manifests = new Map<string, Promise<Manifest | null>>();

/** Fetch (once) the manifest of a narration pack folder, e.g. "narration/binladen-raid". */
export function loadNarrationPack(pack: string): Promise<Manifest | null> {
  let p = manifests.get(pack);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}${pack}/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null);
    manifests.set(pack, p);
  }
  return p;
}

function speak(text: string, engine: NarrationEngine, voiceId: string | null, rate: number) {
  if (engine === 'kokoro') {
    speakKokoro(text, voiceId ?? 'bm_george', rate).catch(() => speakWeb(text, null, rate));
  } else {
    speakWeb(text, voiceId, rate);
  }
}

async function speakKokoro(text: string, voiceId: string, rate: number) {
  const tts = await loadKokoro();
  const out = await tts.generate(text, { voice: voiceId });
  let blob: Blob;
  if ('toBlob' in out && typeof out.toBlob === 'function') {
    blob = out.toBlob();
  } else if ('audio' in out) {
    blob = floatToWav(out.audio, out.sampling_rate);
  } else {
    return;
  }
  if (currentAudio) currentAudio.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentUrl);
  currentAudio.playbackRate = rate;
  speaking = true;
  currentAudio.onended = currentAudio.onerror = () => {
    speaking = false;
    playPending();
  };
  try {
    routeElement(currentAudio); // route through recordable bus
  } catch {
    /* element already routed */
  }
  await currentAudio.play();
}

/** Minimal Float32 → WAV encoder for raw model output. */
function floatToWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Speak a caption. By default a line already being spoken is allowed to
 * finish and later captions queue behind it (stale ones are dropped); `interrupt` cuts in
 * immediately (used for voice previews).
 */
export function narrate(
  text: string,
  engine: NarrationEngine,
  voiceId: string | null,
  rate = 1,
  interrupt = false,
) {
  if (!text.trim()) return;
  if (interrupt) stopNarration();
  if (speaking) {
    queue.push({ text, engine, voiceId, rate, at: performance.now() });
    return;
  }
  speak(text, engine, voiceId, rate);
}
