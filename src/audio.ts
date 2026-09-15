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

/** Sound effects (explosions, rotors), ducked under narration. */
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
  return () => src.disconnect();
}

/** Short synthesized explosion: filtered noise burst + low thump. */
export function boom(intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const strength = Math.round(Math.sqrt(Math.max(0.02, Math.min(2, intensity))) * 10) / 10;
  const dur = 0.22 + strength * 0.4;

  // noise burst
  const buf = noiseBuffer(c, dur, (x) => Math.pow(1 - x, 2.2), `blast:${strength}`);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + dur);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.28 * strength, t);
  noise.connect(lp).connect(ng).connect(sfxBus());
  noise.start(t);

  // low thump
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + dur * 0.8);
  const og = c.createGain();
  og.gain.setValueAtTime(0.24 * strength, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(og).connect(sfxBus());
  osc.start(t);
  osc.stop(t + dur);
  noise.onended = () => { noise.disconnect(); lp.disconnect(); ng.disconnect(); };
  osc.onended = () => { osc.disconnect(); og.disconnect(); };
}

/** Short synthesized gunshot: a sharp noise crack; suppressed = muffled thud. */
export function gunshot(suppressed = false, intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const dur = suppressed ? 0.08 : 0.15;
  const buf = noiseBuffer(c, dur, (x) => Math.pow(1 - x, suppressed ? 4 : 2.8), `gun:${suppressed}`);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = suppressed ? 800 : 2400;
  bp.Q.value = 0.7;
  const ng = c.createGain();
  ng.gain.setValueAtTime((suppressed ? 0.14 : 0.38) * Math.min(1.5, intensity), t);
  noise.connect(bp).connect(ng).connect(sfxBus());
  noise.playbackRate.value = 0.97 + Math.random() * 0.06;
  noise.start(t);
  noise.onended = () => { noise.disconnect(); bp.disconnect(); ng.disconnect(); };
}

const noiseCache = new Map<string, AudioBuffer>();
/** White-noise buffer of `dur` seconds shaped by an envelope. */
function noiseBuffer(c: AudioContext, dur: number, env: (x: number) => number, key?: string) {
  const cached = key ? noiseCache.get(key) : undefined;
  if (cached) return cached;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * env(i / len);
  if (key) {
    if (noiseCache.size >= 32) noiseCache.delete(noiseCache.keys().next().value!);
    noiseCache.set(key, buf);
  }
  return buf;
}

/**
 * Longbow volley: a ripple of string snaps as the archers loose, then the
 * rising, thinning hiss of hundreds of arrows in the air.
 */
export function arrowVolley(intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const k = Math.min(1.5, intensity);
  // bowstrings: short low thwacks spread over a fraction of a second
  for (let i = 0; i < 10; i++) {
    const at = t + Math.random() * 0.35;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.06, (x) => Math.pow(1 - x, 6), 'bow');
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260 + Math.random() * 160;
    bp.Q.value = 3;
    const g = c.createGain();
    g.gain.value = 0.22 * k;
    src.connect(bp).connect(g).connect(sfxBus());
    src.start(at);
  }
  // flight: a swell of high, airy noise
  const dur = 2.2;
  const whoosh = c.createBufferSource();
  whoosh.buffer = noiseBuffer(c, dur, (x) => Math.sin(Math.PI * Math.min(1, x * 1.3)) * (1 - x * 0.4), 'arrows');
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.Q.value = 0.9;
  hp.frequency.setValueAtTime(1800, t + 0.2);
  hp.frequency.exponentialRampToValueAtTime(3600, t + 0.2 + dur);
  const wg = c.createGain();
  wg.gain.value = 0.16 * k;
  whoosh.connect(hp).connect(wg).connect(sfxBus());
  whoosh.start(t + 0.2);
}

/**
 * Hand-to-hand fighting: a wash of trampling and shouting noise with metallic
 * clangs of steel on steel scattered through it.
 */
export function meleeClash(intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const k = Math.min(1.5, intensity);
  const dur = 3;
  const crowd = c.createBufferSource();
  crowd.buffer = noiseBuffer(c, dur, (x) => Math.min(1, x * 6) * Math.pow(1 - x, 1.5), 'melee');
  const lp = c.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = 520;
  lp.Q.value = 0.6;
  const cg = c.createGain();
  cg.gain.value = 0.2 * k;
  crowd.connect(lp).connect(cg).connect(sfxBus());
  crowd.start(t);
  for (let i = 0; i < 9; i++) {
    const at = t + 0.1 + Math.random() * (dur - 0.6);
    const base = 900 + Math.random() * 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12 * k, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    // inharmonic partials read as struck metal rather than a musical tone
    for (const ratio of [1, 2.76, 5.4]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      o.connect(g);
      o.start(at);
      o.stop(at + 0.4);
    }
    g.connect(sfxBus());
  }
}

/** Galloping horses: a drumming of low hoof thuds in a loose four-beat rhythm. */
export function gallop(intensity = 1, seconds = 3) {
  const c = audioContext();
  const t = c.currentTime;
  const k = Math.min(1.5, intensity);
  const stride = 0.42;
  for (let s = 0; s * stride < seconds; s++) {
    // many horses: each stride smears several beats
    for (let beat = 0; beat < 4; beat++) {
      const at = t + s * stride + beat * 0.07 + Math.random() * 0.05;
      const fade = Math.min(1, (s * stride) / 0.8) * Math.min(1, (seconds - s * stride) / 0.8);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 0.09, (x) => Math.pow(1 - x, 4), 'hooves');
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const g = c.createGain();
      g.gain.value = 0.5 * k * fade;
      src.connect(lp).connect(g).connect(sfxBus());
      src.start(at);
    }
  }
}

/**
 * Continuous helicopter rotor sound: just the blade beats: band-passed noise
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

  // low, soft thud band, no tonal components
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

/** Continuous jet engine roar: broadband noise with a low rumble and a high whine. */
let jet: { out: GainNode } | null = null;

function ensureJet() {
  if (jet) return jet;
  const c = audioContext();
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const rumble = c.createBiquadFilter();
  rumble.type = 'lowpass';
  rumble.frequency.value = 420;
  const whine = c.createBiquadFilter();
  whine.type = 'bandpass';
  whine.frequency.value = 2600;
  whine.Q.value = 1.2;
  const whineGain = c.createGain();
  whineGain.gain.value = 0.25;
  const out = c.createGain();
  out.gain.value = 0;
  noise.connect(rumble).connect(out);
  noise.connect(whine).connect(whineGain).connect(out);
  out.connect(sfxBus());
  noise.start();
  jet = { out };
  return jet;
}

/** Set jet engine loudness 0..1 (driven by how close the camera is to an aircraft). */
export function setJetNoise(level: number) {
  if (level <= 0.001 && !jet) return;
  const j = ensureJet();
  j.out.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * 0.55, audioContext().currentTime, 0.15);
}

/**
 * One aircraft cannon round: a deep, chesty thump rather than a rifle crack.
 * `heavy` is a 37 mm round (lower and longer); otherwise a 23 mm or 20 mm round.
 */
export function cannonRound(heavy = false, intensity = 1) {
  const c = audioContext();
  const t = c.currentTime;
  const k = Math.min(1.5, intensity);
  const dur = heavy ? 0.28 : 0.16;
  // body: a pitched-down sine thump
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(heavy ? 95 : 150, t);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 38 : 60, t + dur);
  const og = c.createGain();
  og.gain.setValueAtTime((heavy ? 0.75 : 0.45) * k, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(og).connect(sfxBus());
  osc.start(t);
  osc.stop(t + dur + 0.02);
  // blast: short low-passed noise
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, heavy ? 3 : 4);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = heavy ? 700 : 1300;
  const ng = c.createGain();
  ng.gain.value = (heavy ? 0.55 : 0.35) * k;
  src.connect(lp).connect(ng).connect(sfxBus());
  src.start(t);
}
