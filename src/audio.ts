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
