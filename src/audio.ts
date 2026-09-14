/**
 * Shared audio graph. Everything audible routes through `master` →
 * speakers AND → `recDest` (a MediaStreamDestination) so recordings
 * capture narration + SFX.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let recDest: MediaStreamAudioDestinationNode | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    recDest = ctx.createMediaStreamDestination();
    master.connect(recDest);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Node all app audio should connect to. */
export function masterBus(): GainNode {
  audioContext();
  return master!;
}

/** Audio track for MediaRecorder; empty until something plays. */
export function recordStream(): MediaStream {
  audioContext();
  return recDest!.stream;
}

/** Route an HTMLAudioElement through the shared bus. */
export function routeElement(el: HTMLAudioElement) {
  const c = audioContext();
  const src = c.createMediaElementSource(el);
  src.connect(masterBus());
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
  noise.connect(lp).connect(ng).connect(masterBus());
  noise.start(t);

  // low thump
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + dur * 0.8);
  const og = c.createGain();
  og.gain.setValueAtTime(0.6 * Math.min(1.5, intensity), t);
  og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(og).connect(masterBus());
  osc.start(t);
  osc.stop(t + dur);
}

/**
 * Continuous helicopter rotor sound: band-passed noise chopped at the blade
 * passage rate (the "wop-wop"), a low body thump and a faint tail-rotor
 * whine. Driven every frame with a 0..1 level and -1..1 stereo pan.
 */
let rotor: {
  out: GainNode;
  pan: StereoPannerNode;
  chop: OscillatorNode;
  whine: OscillatorNode;
} | null = null;

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

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 160;
  band.Q.value = 0.9;

  // blade-passage amplitude modulation: sharp slaps via a shaped LFO
  const chopGain = c.createGain();
  chopGain.gain.value = 0;
  const chop = c.createOscillator();
  chop.type = 'sawtooth';
  chop.frequency.value = 15; // ~4 blades × ~3.9 rev/s
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255; // 0..1 across the saw ramp
    curve[i] = Math.pow(Math.max(0, 1 - x * 2.2), 3); // quick attack, fast decay
  }
  shaper.curve = curve;
  chop.connect(shaper).connect(chopGain.gain);
  noise.connect(band).connect(chopGain);

  // low body resonance under the slaps
  const body = c.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 70;
  const bodyGain = c.createGain();
  bodyGain.gain.value = 0.9;
  noise.connect(body).connect(bodyGain);

  // tail-rotor whine
  const whine = c.createOscillator();
  whine.type = 'triangle';
  whine.frequency.value = 420;
  const whineGain = c.createGain();
  whineGain.gain.value = 0.035;
  whine.connect(whineGain);

  const mix = c.createGain();
  mix.gain.value = 1;
  chopGain.connect(mix);
  bodyGain.connect(mix);
  whineGain.connect(mix);

  const out = c.createGain();
  out.gain.value = 0;
  const pan = c.createStereoPanner();
  mix.connect(out).connect(pan).connect(masterBus());

  noise.start();
  chop.start();
  whine.start();
  rotor = { out, pan, chop, whine };
  return rotor;
}

/** Set rotor loudness (0..1), stereo position (-1..1) and a small pitch shift for load. */
export function setRotor(level: number, pan = 0, load = 0) {
  if (level <= 0.001 && !rotor) return;
  const r = ensureRotor();
  const t = audioContext().currentTime;
  r.out.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * 0.55, t, 0.12);
  r.pan.pan.setTargetAtTime(Math.min(1, Math.max(-1, pan)), t, 0.12);
  r.chop.frequency.setTargetAtTime(15 + load * 1.5, t, 0.3);
  r.whine.frequency.setTargetAtTime(420 + load * 30, t, 0.3);
}
