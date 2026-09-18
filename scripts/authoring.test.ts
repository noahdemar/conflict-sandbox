import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveAuthoring, hasAuthoringSugar } from '../src/authoring/resolve';
import { composeKeyframes } from '../src/authoring/autoCamera';
import { evalTimeExpr, offsetExpr, parseTimeExpr } from '../src/authoring/time';
import { boxContains, boxForCamera, padBox, readSeconds, zoomForBox } from '../src/authoring/frame';
import { storyboardSvg } from '../src/authoring/storyboard';
import { bundledPack, PACKS } from '../src/packs';
import { ICON_PERIODS, PERIODS, PERIOD_IDS, iconsForPeriod } from '../src/eras';
import { lintScenario } from '../src/lint';
import { scenarioErrors } from '../src/realism';
import type { ContentPack } from '../src/authoring/types';
import type { Scenario } from '../src/types';

const loadPack = async (ref: string): Promise<ContentPack | null> => bundledPack(ref);

/** A small authoring document exercising places, offsets, macros, beats and relative times. */
const doc = () => ({
  format: 'openbrief-authoring',
  duration: 45,
  places: { Bridge: [35.045, 48.446], Staging: [35.03, 48.43] },
  scenario: {
    name: 'Test crossing',
    period: 'modern',
    factions: [
      { id: 'f_blue', name: 'Blue', color: '#3a6fc0', affiliation: 'friend' },
      { id: 'f_red', name: 'Red', color: '#cf5a50', affiliation: 'hostile' },
    ],
    units: [
      { id: 'u_def', factionId: 'f_blue', type: 'infantry', name: 'Rifle platoon', icon: 'troops', at: 'Bridge' },
      {
        id: 'u_heli',
        factionId: 'f_blue',
        type: 'air',
        name: 'AH-64',
        icon: 'attackheli',
        near: { of: 'Bridge', bearingDeg: 90, km: 5 },
        appearAt: 's_hit-16',
      },
    ],
    macros: [
      {
        macro: 'column',
        id: 'm_red',
        factionId: 'f_red',
        count: 3,
        startAt: 4,
        duration: 20,
        via: ['Staging', 'Bridge'],
        unit: { name: 'T-72', type: 'armor', icon: 'tank' },
      },
    ],
    strikes: [
      {
        id: 's_hit',
        name: 'AGM-114 Hellfire',
        fromUnitId: 'u_heli',
        targetUnitId: 'm_red_1',
        at: 'Bridge',
        appearAt: 30,
        launchAt: 's_hit-6',
      },
    ],
    keyframes: 'auto',
    beats: [
      { at: 0, caption: 'The column moves on the bridge.', shot: 'establish', focus: ['m_red_1', 'u_def'] },
      { at: 's_hit-1', caption: 'The lead tank is hit.', shot: 'action', focus: ['s_hit', 'm_red_1'] },
      { caption: 'The crossing holds.', shot: 'aftermath', focus: ['u_def'] },
    ],
  },
});

test('time expressions parse, offset and evaluate', () => {
  assert.equal(parseTimeExpr(12)?.literal, 12);
  assert.deepEqual(parseTimeExpr('s_hit-4'), { anchor: 's_hit', field: 'start', offset: -4 });
  assert.deepEqual(parseTimeExpr('a_route.end+2'), { anchor: 'a_route', field: 'end', offset: 2 });
  // an id that really contains a hyphen wins over an offset reading
  assert.deepEqual(parseTimeExpr('helo-2', new Set(['helo-2'])), { anchor: 'helo-2', field: 'start', offset: 0 });
  assert.equal(offsetExpr('s_hit-4', 2), 's_hit-2');
  assert.equal(offsetExpr(10, 2.5), 12.5);

  const anchors = new Map([['s_hit', { start: 30, end: 30 }]]);
  assert.deepEqual(evalTimeExpr('s_hit-4', anchors, 60), { ok: true, value: 26 });
  assert.deepEqual(evalTimeExpr('end-5', anchors, 60), { ok: true, value: 55 });
  assert.deepEqual(evalTimeExpr('nope', anchors, 60), { ok: false, missing: 'nope' });
  assert.equal(evalTimeExpr('end', anchors, undefined).ok, false);
});

test('framing maths round-trips: a box fits inside the camera it produced', () => {
  const box = { west: 35.0, east: 35.1, south: 48.4, north: 48.47 };
  const zoom = zoomForBox(padBox(box, 1.4));
  const covered = boxForCamera([(box.west + box.east) / 2, (box.south + box.north) / 2], zoom);
  for (const corner of [
    [box.west, box.south],
    [box.east, box.north],
  ] as [number, number][]) {
    assert.ok(boxContains(covered, corner), `corner ${corner} should be inside the frame`);
  }
});

test('resolution turns places, offsets, macros and relative times into a plain scenario', async () => {
  const { file, errors, notes } = await resolveAuthoring(doc(), { loadPack });
  assert.deepEqual(errors, []);
  assert.ok(file);
  const s = file!.scenario;

  // places and offsets became coordinates
  const def = s.units.find((u) => u.id === 'u_def')!;
  assert.equal(def.lat, 48.446);
  assert.equal(def.lng, 35.045);
  const heli = s.units.find((u) => u.id === 'u_heli')!;
  assert.ok(heli.lng > 35.09 && heli.lng < 35.12, `heli should be ~5 km east, got ${heli.lng}`);
  assert.ok(Math.abs(heli.lat - 48.446) < 0.001);

  // the macro expanded, and its route exists
  assert.equal(s.units.filter((u) => u.id.startsWith('m_red_')).length, 3);
  assert.ok(s.arrows.some((a) => a.id === 'm_red_route'));
  assert.ok(notes.some((n) => n.includes('m_red')));

  // relative times resolved against the strike impact
  const strike = s.strikes[0];
  assert.equal(strike.appearAt, 30);
  assert.equal(strike.launchAt, 24);
  assert.equal(heli.appearAt, 14);

  // nothing symbolic survives into the plain scenario
  const raw = JSON.stringify(file);
  for (const key of ['"at":', '"near":', '"via":', '"macro"', '"beats"', '"places"']) {
    assert.ok(!raw.includes(key), `${key} should not survive resolution`);
  }
  assert.deepEqual(scenarioErrors(s, file!.duration), []);
});

test('the camera composer frames its focus and gives captions time to be read', async () => {
  const { file } = await resolveAuthoring(doc(), { loadPack });
  const s = file!.scenario;
  assert.equal(s.keyframes.length, 3);

  s.keyframes.forEach((k, i) => {
    const box = boxForCamera([k.lng, k.lat], k.zoom, k.pitch);
    for (const id of k.highlightUnitIds ?? []) {
      const u = s.units.find((x) => x.id === id);
      if (u) assert.ok(boxContains(box, [u.lng, u.lat]) || u.arrowId, `shot ${k.id} should frame ${id}`);
    }
    const next = s.keyframes[i + 1];
    const length = (next ? next.time : file!.duration) - k.time;
    assert.ok(length >= readSeconds(k.caption), `shot ${k.id} should run at least as long as its caption`);
  });

  // a beat with an explicit time keeps it
  assert.equal(s.keyframes[1].time, 29);
});

test('a duration too short for the captions is raised, not silently cut', () => {
  const base: Scenario = {
    name: 'x',
    factions: [{ id: 'f', name: 'F', color: '#fff' }],
    units: [{ id: 'u', factionId: 'f', type: 'infantry', name: 'U', lat: 1, lng: 1, appearAt: 0 }],
    arrows: [],
    territories: [],
    labels: [],
    strikes: [],
    keyframes: [],
  };
  const composed = composeKeyframes(
    base,
    [
      { at: 0, caption: 'A caption with quite a few words in it, which takes a while to say out loud.' },
      { at: 20, caption: 'Another line that also takes a moment to read aloud properly.' },
    ],
    10,
  );
  assert.ok(composed.duration > 20);
  assert.ok(composed.notes.some((n) => n.includes('Duration raised')));
});

test('unresolvable references are reported by name, not swallowed', async () => {
  const broken = doc();
  broken.scenario.units[0].at = 'Nowhere';
  broken.scenario.beats[1].at = 's_missing-2';
  const { file, errors } = await resolveAuthoring(broken, { loadPack });
  assert.equal(file, null);
  assert.ok(errors.some((e) => e.includes('Nowhere')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('s_missing')), errors.join('\n'));
});

test('a plain scenario file passes through resolution unchanged', async () => {
  const plain = JSON.parse(readFileSync('public/examples/river-crossing.json', 'utf8'));
  assert.equal(hasAuthoringSugar(plain), false);
  const { file, errors } = await resolveAuthoring(plain, { loadPack });
  assert.deepEqual(errors, []);
  assert.deepEqual(file!.scenario.keyframes, plain.scenario.keyframes);
  assert.deepEqual(file!.scenario.units, plain.scenario.units);
});

test('the published authoring example resolves and lints clean', async () => {
  const raw = JSON.parse(readFileSync('public/examples/authored-river-crossing.json', 'utf8'));
  assert.equal(hasAuthoringSugar(raw), true);
  const { file, errors } = await resolveAuthoring(raw, { loadPack });
  assert.deepEqual(errors, []);
  const findings = lintScenario(file!.scenario, file!.duration);
  assert.deepEqual(
    findings.filter((f) => f.severity !== 'info').map((f) => f.message),
    [],
  );
  // the roster entries its units point at came from the included packs
  assert.ok(file!.roster.some((r) => r.id === 'opf_t72'));
  assert.ok(file!.roster.some((r) => r.id === 'mod_ah64'));
});

test('the lint catches what it is meant to catch', () => {
  const s: Scenario = {
    name: 'x',
    period: 'medieval',
    factions: [{ id: 'f', name: 'F', color: '#fff' }],
    units: [
      { id: 'u', factionId: 'f', type: 'armor', name: 'Tank', icon: 'tank', lat: 48, lng: 35, appearAt: 0 },
    ],
    arrows: [],
    territories: [],
    labels: [],
    strikes: [{ id: 's', name: 'Melee', lat: 10, lng: 10, size: 1, appearAt: 5 }],
    keyframes: [
      { id: 'k1', time: 0, lat: 48, lng: 35, zoom: 14, pitch: 0, bearing: 0, caption: 'A short line.' },
      {
        id: 'k2',
        time: 1,
        lat: 48,
        lng: 35,
        zoom: 14,
        pitch: 0,
        bearing: 0,
        caption: 'A much longer line that certainly cannot be read aloud inside a single second of screen time.',
      },
    ],
    duration: 6,
  };
  const findings = lintScenario(s);
  assert.ok(findings.some((f) => f.message.includes('read aloud')), 'caption timing');
  assert.ok(findings.some((f) => f.message.includes('no shot is looking')), 'unseen strike');
  assert.ok(findings.some((f) => f.message.includes('does not belong in the Medieval period')), 'period icon');
});

test('content packs are complete and period-consistent', () => {
  for (const pack of PACKS) {
    assert.ok(PERIOD_IDS.includes(pack.period), `${pack.id} has a known period`);
    assert.ok(pack.roster?.length, `${pack.id} has a roster`);
    const allowed = new Set(iconsForPeriod(pack.period));
    for (const entry of pack.roster ?? []) {
      assert.ok(entry.icon, `${pack.id}/${entry.id} sets an icon`);
      assert.ok(allowed.has(entry.icon as never), `${pack.id}/${entry.id} uses a ${pack.period} icon (${entry.icon})`);
    }
    assert.ok(PERIODS[pack.period].packs.includes(pack.id), `${pack.id} is listed by its period`);
  }
  // every icon in the library belongs to at least one period
  for (const [icon, periods] of Object.entries(ICON_PERIODS)) {
    assert.ok(periods.length, `${icon} belongs to a period`);
  }
});

test('the storyboard draws one panel per shot', async () => {
  const { file } = await resolveAuthoring(doc(), { loadPack });
  const svg = storyboardSvg(file!.scenario, file!.duration);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<g>/g) ?? []).length, file!.scenario.keyframes.length);
  assert.ok(svg.includes('The crossing holds.'));
  // captions are escaped, not injected
  assert.ok(!svg.includes('<script'));
});
