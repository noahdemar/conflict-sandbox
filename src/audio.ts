/**
 * Shared audio graph. Everything audible routes through `master` →
 * speakers AND → `recDest` (a MediaStreamDestination) so recordings
 * capture narration + SFX.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let voice: GainNode | null = null;
let recDest: MediaStreamAudioDestinationNode | null = null;

/** Effects level while narration is speaking (ducking), and at rest. */
const SFX_DUCKED = 0.4;
const SFX_NORMAL = 1;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // sfx bus + voice bus → master → gentle limiter → speakers and recorder
    master = ctx.createGain();
    master.gain.value = 1;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    recDest = ctx.createMediaStreamDestination();
    limiter.connect(recDest);
    sfx = ctx.createGain();
    sfx.gain.value = SFX_NORMAL;
    sfx.connect(master);
    voice = ctx.createGain();
    voice.gain.value = 1.15;
    voice.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Node all app audio should connect to. */
export function masterBus(): GainNode {
  audioContext();
  return master!;
}

/** Sound effects (explosions, rotors) — ducked under narration. */
export function sfxBus(): GainNode {
  audioContext();
  return sfx!;
}

/** Narration voice. */
export function voiceBus(): GainNode {
  audioContext();
  return voice!;
}

/**
 * Duck effects while a narration line is speaking so the voice stays
 * intelligible; both keep playing together.
 */
export function setVoiceActive(active: boolean) {
  // releasing before anything has played needs no audio graph (and must not create one early)
  if (!ctx && !active) return;
  const c = audioContext();
  const g = sfxBus().gain;
  g.cancelScheduledValues(c.currentTime);
  g.setTargetAtTime(active ? SFX_DUCKED : SFX_NORMAL, c.currentTime, active ? 0.08 : 0.35);
}

/** Audio track for MediaRecorder; empty until something plays. */
export function recordStream(): MediaStream {
  audioContext();
  return recDest!.stream;
}

/** Route a narration HTMLAudioElement through the voice bus. */
export function routeElement(el: HTMLAudioElement) {
  const c = audioContext();
  const src = c.createMediaElementSource(el);
  src.connect(voiceBus());
}

/** Short synthesized explosion: filtered noise burst + low thump. */
export function boom(intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const dur = 0.7 * Math.min(2, intensity);

  // noise burst
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + dur);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.5 * Math.min(1.5, intensity), t);
  noise.connect(lp).connect(ng).connect(sfxBus());
  noise.start(t);

  // low thump
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + dur * 0.8);
  const og = c.createGain();
  og.gain.setValueAtTime(0.6 * Math.min(1.5, intensity), t);
  og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(og).connect(sfxBus());
  osc.start(t);
  osc.stop(t + dur);
}

/** Short synthesized gunshot: a sharp noise crack; suppressed = muffled thud. */
export function gunshot(suppressed = false, intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const dur = suppressed ? 0.08 : 0.15;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, suppressed ? 4 : 2.8);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = suppressed ? 800 : 2400;
  bp.Q.value = 0.7;
  const ng = c.createGain();
  ng.gain.setValueAtTime((suppressed ? 0.14 : 0.38) * Math.min(1.5, intensity), t);
  noise.connect(bp).connect(ng).connect(sfxBus());
  noise.start(t);
}

/**
 * Continuous helicopter rotor sound: just the blade beats — band-passed noise
 * chopped at the blade-passage rate. Driven every frame with a 0..1 level and
 * -1..1 stereo pan.
 */
let rotor: { out: GainNode; pan: StereoPannerNode; chop: OscillatorNode } | null = null;

function ensureRotor() {
  if (rotor) return rotor;
  const c = audioContext();

  // looping noise source
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  // low, soft thud band — no tonal components
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 110;
  band.Q.value = 0.7;
  const soften = c.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 380;

  // blade-passage amplitude modulation: short beats with silence between
  const chopGain = c.createGain();
  chopGain.gain.value = 0;
  const chop = c.createOscillator();
  chop.type = 'sawtooth';
  chop.frequency.value = 15; // ~4 blades × ~3.9 rev/s
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255; // 0..1 across the saw ramp
    curve[i] = Math.pow(Math.max(0, 1 - x * 2.6), 2.5);
  }
  shaper.curve = curve;
  chop.connect(shaper).connect(chopGain.gain);
  noise.connect(band).connect(soften).connect(chopGain);

  const out = c.createGain();
  out.gain.value = 0;
  const pan = c.createStereoPanner();
  chopGain.connect(out).connect(pan).connect(sfxBus());

  noise.start();
  chop.start();
  rotor = { out, pan, chop };
  return rotor;
}

/** Set rotor loudness (0..1), stereo position (-1..1) and a small tempo shift for load. */
export function setRotor(level: number, pan = 0, load = 0) {
  if (level <= 0.001 && !rotor) return;
  const r = ensureRotor();
  const t = audioContext().currentTime;
  r.out.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * 0.9, t, 0.12);
  r.pan.pan.setTargetAtTime(Math.min(1, Math.max(-1, pan)), t, 0.12);
  r.chop.frequency.setTargetAtTime(15 + load * 1.5, t, 0.3);
}
