import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParticleSystem, expandStrikes, MAX_SALVO_ROUNDS, weaponKind } from '../src/particles';
import { scenarioErrors, realismWarnings } from '../src/realism';
import { unitAmmo } from '../src/combat';
import { DEMOS } from '../src/demos';
import { existsSync, readFileSync } from 'node:fs';
import { toSpokenText } from '../src/speechText';
import { gunshot } from '../src/audio';
import { silhouetteFor } from '../src/silhouettes';

const node = () => ({
  gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {}, setValueAtTime() {} },
  threshold: {}, knee: {}, ratio: {}, attack: {}, release: {},
  connect() { return this; }, disconnect() {},
});
class FakeContext {
  static buffers = 0;
  sampleRate = 48000;
  createBuffer(_channels: number, len: number) {
    FakeContext.buffers++;
    return { getChannelData: () => new Float32Array(len) };
  }
  createBufferSource = () => ({ ...node(), playbackRate: { value: 1 }, start() {} });
  createBiquadFilter = () => ({ ...node(), frequency: { value: 0 }, Q: { value: 0 } });
  state = 'running';
  currentTime = 0;
  destination = node();
  createGain = node;
  createDynamicsCompressor = node;
  createMediaStreamDestination = node;
  createMediaElementSource = node;
}
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playbackRate = 1;
  currentTime = 0;
  crossOrigin = '';
  constructor(public src: string) { FakeAudio.instances.push(this); }
  pause() {}
  async play() {}
}
Object.assign(globalThis, { window: {}, AudioContext: FakeContext, Audio: FakeAudio });
const { narrateRecorded, stopNarration } = await import('../src/narration');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('particle uploads cover only live particles and skip empty batches', () => {
  const particles = new ParticleSystem();
  particles.begin();
  particles.smoke.push(0, 0, 0, 1, 1, 1, 1, 1, 0);
  particles.commit(400);
  const position = particles.smoke.geo.getAttribute('position');
  assert.deepEqual(position.updateRanges, [{ start: 0, count: 3 }]);
  const empty = particles.fire.geo.getAttribute('position');
  assert.equal(empty.version, 0);
  particles.begin();
  particles.commit(400);
  assert.equal(particles.smoke.geo.drawRange.count, 0);
});

test('salvo starts exactly at its authored launch and impact times', () => {
  const strike = { id: 'burst', name: 'Rifle shots', lat: 34, lng: 70, size: 0.08, appearAt: 10, launchAt: 9.8, salvo: 3 };
  const rounds = expandStrikes([strike]);
  assert.equal(rounds[0].appearAt, 10);
  assert.equal(rounds[0].launchAt, 9.8);
  assert.deepEqual(rounds, expandStrikes([strike]));
  assert.ok(rounds[1].appearAt > rounds[0].appearAt);
});

test('late completion from stopped narration cannot interrupt a new line', async () => {
  stopNarration();
  narrateRecorded('old.mp3', 'Old', 'kokoro', null);
  await flush();
  const oldEnd = FakeAudio.instances.at(-1)!.onended!;
  stopNarration();
  narrateRecorded('new.mp3', 'New', 'kokoro', null);
  narrateRecorded('next.mp3', 'Next', 'kokoro', null);
  await flush();
  const count = FakeAudio.instances.length;
  oldEnd();
  await flush();
  assert.equal(FakeAudio.instances.length, count);
  stopNarration();
});

test('recorded narration can resume at the current scene position', async () => {
  stopNarration();
  narrateRecorded('resume.mp3', 'Resume', 'kokoro', null, 1.5, 3);
  await flush();
  const audio = FakeAudio.instances.at(-1)!;
  assert.ok(audio.currentTime >= 3 && audio.currentTime < 3.1);
  assert.equal(audio.playbackRate, 1.5);
  stopNarration();
});

test('repeated gunfire reuses its sound buffer', () => {
  const before = FakeContext.buffers;
  for (let i = 0; i < 100; i++) gunshot(false);
  assert.equal(FakeContext.buffers - before, 1);
});

test('salvo expansion is bounded for oversized imported values', () => {
  const rounds = expandStrikes([{ id: 'huge', name: 'Rifle', lat: 0, lng: 0, size: 0.08, appearAt: 2, salvo: 1e9 }]);
  assert.equal(rounds.length, MAX_SALVO_ROUNDS);
});

test('rifle visual scale cannot turn the hit into a cannon fireball', () => {
  const particles = new ParticleSystem();
  particles.explosion('rifle', { x: 0, y: 0, z: 0 }, 1, 1, 0.01, false, 'gun', 'Rifle shots');
  assert.ok(particles.fire.n <= 2);
  assert.ok([...particles.fire.size.slice(0, particles.fire.n)].every((size) => size < 20));
  particles.begin();
  particles.explosion('cannon', { x: 0, y: 0, z: 0 }, 1, 0.1, 0.01, false, 'gun', '30mm chain gun');
  assert.ok(particles.fire.n > 2);
});

test('ordinary blast fire is shorter than an explicit fuel fireball', () => {
  const particles = new ParticleSystem();
  particles.explosion('bomb', { x: 0, y: 0, z: 0 }, 1, 1, 0.7, false, 'bomb', 'JDAM');
  const restrained = particles.fire.n;
  particles.begin();
  particles.explosion('bomb', { x: 0, y: 0, z: 0 }, 1, 1, 0.7, false, 'bomb', 'JDAM', 'fireball');
  assert.ok(particles.fire.n > restrained);
});

test('dismounted troops do not receive cavalry silhouettes', () => {
  const unit = { id: 'foot', name: 'French men-at-arms (dismounted)', factionId: 'french', type: 'infantry' as const, appearAt: 0, lat: 0, lng: 0 };
  assert.equal(silhouetteFor(unit), 'menatarms');
  assert.equal(silhouetteFor({ ...unit, name: 'Mounted knights' }), 'cavalry');
});

test('WW2 propeller aircraft resolve to prop silhouettes', () => {
  const unit = { id: 'a', name: '', factionId: 'f', type: 'air' as const, appearAt: 0, lat: 0, lng: 0 };
  assert.equal(silhouetteFor({ ...unit, name: 'Spitfire patrol' }), 'propfighter');
  assert.equal(silhouetteFor({ ...unit, name: 'P-51 Mustangs' }), 'propfighter');
  assert.equal(silhouetteFor({ ...unit, name: 'Bf 109 flight' }), 'propfighter');
  assert.equal(silhouetteFor({ ...unit, name: 'B-17 formation' }), 'propbomber');
  assert.equal(silhouetteFor({ ...unit, name: 'Lancaster bombers' }), 'propbomber');
  assert.equal(silhouetteFor({ ...unit, name: 'Ju 87 Stuka' }), 'propbomber');
  assert.equal(silhouetteFor({ ...unit, name: 'C-47 Skytrain' }), 'proptransport');
  assert.equal(silhouetteFor({ ...unit, name: 'Dakota transport' }), 'proptransport');
  // modern types still take precedence
  assert.equal(silhouetteFor({ ...unit, name: 'B-52 bombers' }), 'bomber');
  assert.equal(silhouetteFor({ ...unit, name: 'C-130 transport' }), 'transport');
  // explicit icon keys and aliases resolve too
  assert.equal(silhouetteFor({ ...unit, name: 'anything', icon: 'propfighter' }), 'propfighter');
  assert.equal(silhouetteFor({ ...unit, name: 'anything', icon: 'spitfire' }), 'propfighter');
});

test('Western vehicles, naval and helicopter silhouettes resolve by name', () => {
  const armor = { id: 'v', name: '', factionId: 'f', type: 'armor' as const, appearAt: 0, lat: 0, lng: 0 };
  assert.equal(silhouetteFor({ ...armor, name: 'M1 Abrams platoon' }), 'abrams');
  assert.equal(silhouetteFor({ ...armor, name: 'Leopard 2 tanks' }), 'abrams');
  assert.equal(silhouetteFor({ ...armor, name: 'M2 Bradley section' }), 'bradley');
  assert.equal(silhouetteFor({ ...armor, name: 'German half-tracks' }), 'halftrack');
  assert.equal(silhouetteFor({ ...armor, name: 'T-72 tank' }), 'tank');
  assert.equal(silhouetteFor({ ...armor, name: 'BMP-2 IFV' }), 'ifv');

  const naval = { ...armor, type: 'naval' as const };
  assert.equal(silhouetteFor({ ...naval, name: 'U-boat patrol' }), 'uboat');
  assert.equal(silhouetteFor({ ...naval, name: 'USS Gato' }), 'uboat');
  assert.equal(silhouetteFor({ ...naval, name: 'Virginia-class submarine' }), 'submarine');
  assert.equal(silhouetteFor({ ...naval, name: 'LCVP Higgins boats' }), 'higgins');
  assert.equal(silhouetteFor({ ...naval, name: 'LCAC hovercraft' }), 'lcac');
  assert.equal(silhouetteFor({ ...naval, name: 'LCU landing craft' }), 'landingcraft');

  const air = { ...armor, type: 'air' as const };
  assert.equal(silhouetteFor({ ...air, name: 'Mi-8 Hip flight' }), 'mi8');
  assert.equal(silhouetteFor({ ...air, name: 'Mi-17 transports' }), 'mi8');
  assert.equal(silhouetteFor({ ...air, name: 'Mi-24 Hind' }), 'attackheli');
  assert.equal(silhouetteFor({ ...air, name: 'UH-60 Black Hawks' }), 'heli');
});

test('melee involving archers never becomes an arrow or missile effect', () => {
  assert.equal(weaponKind('Archers join the melee with mallets and swords'), 'melee');
  assert.equal(weaponKind('Mounted raid on the baggage'), 'melee');
  assert.equal(weaponKind('Longbow volley'), 'arrow');
  assert.equal(weaponKind('Cavalry charge'), 'melee');
  assert.equal(weaponKind('Demolition charges'), 'bomb');
});

for (const demo of DEMOS) {
  test(`${demo.id}: valid references and timelines`, () => {
    const s = { ...demo.scenario(), duration: demo.duration };
    assert.deepEqual(scenarioErrors(s), []);
    if (demo.id !== 'agincourt') assert.deepEqual(realismWarnings(s), []);
    if (demo.id === 'khasham') {
      assert.equal(s.keyframes.filter((k) => k.sensor).length, 0);
      assert.equal(s.effects?.filter((e) => e.kind === 'jamming').length ?? 0, 0);
    }
    const path = `public/narration/${demo.id}/manifest.json`;
    if (!existsSync(path)) return;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const k of s.keyframes.filter((k) => k.caption && k.narrate !== false)) {
      const item = manifest.items[k.id];
      assert.ok(item, `Missing recording: ${k.id}`);
      assert.equal(item.text, k.caption, `Stale caption: ${k.id}`);
      assert.equal(item.spoken, toSpokenText(k.caption), `Stale spoken text: ${k.id}`);
      assert.ok(existsSync(`public/narration/${demo.id}/${item.file}`));
    }
  });
}

test('semantic validation catches broken references, invalid hovers and huge salvos', () => {
  const s = DEMOS[0].scenario();
  s.units[0] = { ...s.units[0], factionId: 'missing' };
  s.arrows[0] = { ...s.arrows[0], times: [1, 1] };
  s.strikes[0] = { ...s.strikes[0], salvo: 1e9 };
  const errors = scenarioErrors(s);
  assert.ok(errors.some((e) => e.includes('/units/0/factionId')));
  assert.ok(errors.some((e) => e.includes('/arrows/0/times')));
  assert.ok(errors.some((e) => e.includes('/strikes/0/salvo')));
});

test('range warnings use moving targets at impact, not their starting positions', () => {
  const s = DEMOS[0].scenario();
  s.units = [
    { id: 'bow', name: 'Archers', type: 'infantry', factionId: 'a', lat: 0, lng: 0, appearAt: 0 },
    { id: 'target', name: 'Target', type: 'infantry', factionId: 'b', lat: 0.01, lng: 0, appearAt: 0, arrowId: 'approach' },
  ];
  s.arrows = [{ id: 'approach', name: 'Approach', factionId: 'b', points: [[0, 0.01], [0, 0.001]], times: [0, 10], appearAt: 0, duration: 10 }];
  s.strikes = [{ id: 'shot', name: 'Longbow volley', size: 0.1, lat: 0.01, lng: 0, fromUnitId: 'bow', targetUnitId: 'target', launchAt: 8, appearAt: 10 }];
  assert.deepEqual(realismWarnings(s), []);
});

test('cached ammunition remains correct when scrubbing and editing', () => {
  const s = DEMOS[0].scenario();
  const x = s.strikes.find((x) => x.fromUnitId)!;
  const u = s.units.find((u) => u.id === x.fromUnitId)!;
  const only = { ...s, strikes: [{ ...x, salvo: 1, launchAt: 5, appearAt: 6 }], effects: [] };
  assert.equal(unitAmmo(only, u, 0), 100);
  assert.equal(unitAmmo(only, u, 6), 25);
  assert.equal(unitAmmo(only, u, 0), 100);
  assert.equal(unitAmmo({ ...only, strikes: [] }, u, 6), null);
});

test('a media error releases the narration queue', async () => {
  stopNarration();
  narrateRecorded('broken.mp3', 'Broken', 'kokoro', null);
  narrateRecorded('following.mp3', 'Following', 'kokoro', null);
  await flush();
  const audio = FakeAudio.instances.at(-1)!;
  assert.equal(typeof audio.onerror, 'function');
  audio.onerror!();
  await flush();
  assert.equal(FakeAudio.instances.at(-1)!.src, 'following.mp3');
  stopNarration();
});
