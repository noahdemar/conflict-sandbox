import * as THREE from 'three';
import type { Strike } from './types';

/**
 * Stateless GPU particle system for the 3D layer. Every frame the emitters
 * rebuild particles purely from timeline time, so scrubbing is exact.
 * Sizes are world-space (mercator units) and converted to pixels in the
 * vertex shader, so particles scale with zoom and perspective.
 */

const MAX = 20000;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aSeed;
  uniform float uHalfHeight;
  uniform float uMinPx;
  varying vec4 vColor;
  varying float vSeed;
  void main() {
    mat4 m = projectionMatrix * modelViewMatrix;
    vec4 c = m * vec4(position, 1.0);
    if (c.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec4 px = m * vec4(position + vec3(aSize, 0.0, 0.0), 1.0);
    vec4 py = m * vec4(position + vec3(0.0, aSize, 0.0), 1.0);
    float dx = length(px.xy / px.w - c.xy / c.w);
    float dy = length(py.xy / py.w - c.xy / c.w);
    gl_PointSize = clamp(max(dx, dy) * uHalfHeight, uMinPx, 900.0);
    gl_Position = c;
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
`;

const SMOKE_FRAG = /* glsl */ `
  varying vec4 vColor;
  varying float vSeed;
  ${NOISE}
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float n = vnoise(q * 3.5 + vSeed * 13.0) * 0.6 + vnoise(q * 9.0 + vSeed * 5.0) * 0.4;
    float a = smoothstep(1.0, 0.15, d + (n - 0.45) * 0.75);
    float shade = 0.72 + 0.45 * n - 0.25 * (q.y + 0.5) * 0.5;
    gl_FragColor = vec4(vColor.rgb * shade, vColor.a * a);
    if (gl_FragColor.a < 0.004) discard;
  }
`;

const FIRE_FRAG = /* glsl */ `
  varying vec4 vColor;
  varying float vSeed;
  ${NOISE}
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float n = vnoise(q * 4.0 + vSeed * 11.0) * 0.6 + vnoise(q * 10.0 + vSeed * 3.0) * 0.4;
    // billowy, fairly crisp flame edge instead of a soft glow
    float a = smoothstep(1.0, 0.55, d + (n - 0.5) * 0.6);
    // hot core with darker, redder rim for depth; normal blending reads on a light map
    float core = smoothstep(0.7, 0.0, d + (n - 0.5) * 0.3);
    vec3 rim = vColor.rgb * vec3(0.78, 0.6, 0.55);
    vec3 col = mix(rim, vColor.rgb, smoothstep(0.95, 0.35, d));
    col = mix(col, vec3(1.0, 0.97, 0.85), core * 0.55);
    gl_FragColor = vec4(col, min(1.0, vColor.a * a));
    if (gl_FragColor.a < 0.01) discard;
  }
`;

const TRAIL_FRAG = /* glsl */ `
  varying vec4 vColor;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.35, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    if (gl_FragColor.a < 0.004) discard;
  }
`;

class Batch {
  geo = new THREE.BufferGeometry();
  pos = new Float32Array(MAX * 3);
  size = new Float32Array(MAX);
  color = new Float32Array(MAX * 4);
  seed = new Float32Array(MAX);
  n = 0;
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(frag: string, additive: boolean, minPx: number) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      uniforms: { uHalfHeight: { value: 400 }, uMinPx: { value: minPx } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }
  push(x: number, y: number, z: number, s: number, r: number, g: number, b: number, a: number, seed: number) {
    if (this.n >= MAX || a <= 0.003 || s <= 0) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = s;
    this.color[i * 4] = r;
    this.color[i * 4 + 1] = g;
    this.color[i * 4 + 2] = b;
    this.color[i * 4 + 3] = a;
    this.seed[i] = seed;
  }
  commit(halfHeight: number) {
    for (const k of ['position', 'aSize', 'aColor', 'aSeed']) {
      (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    }
    this.geo.setDrawRange(0, this.n);
    this.mat.uniforms.uHalfHeight.value = halfHeight;
  }
}

/** Deterministic pseudo-random in [0,1) from a string seed and index. */
export function rnd(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Expand salvo strikes into individual rounds scattered around the aim point. */
export function expandStrikes(strikes: Strike[]): Strike[] {
  const out: Strike[] = [];
  for (const x of strikes) {
    const n = Math.max(1, Math.round(x.salvo ?? 1));
    if (n === 1 || x.targetStrikeId) {
      out.push(x);
      continue;
    }
    const spread = x.spreadM ?? 120;
    for (let i = 0; i < n; i++) {
      const ang = rnd(x.id, i * 7 + 1) * Math.PI * 2;
      const rad = i === 0 ? 0 : Math.sqrt(rnd(x.id, i * 7 + 2)) * spread;
      const dLat = (rad * Math.sin(ang)) / 111320;
      const dLng = (rad * Math.cos(ang)) / (111320 * Math.cos((x.lat * Math.PI) / 180));
      const dt = i * 0.32 + rnd(x.id, i * 7 + 3) * 0.15;
      out.push({
        ...x,
        id: i === 0 ? x.id : `${x.id}#${i}`,
        lat: x.lat + dLat,
        lng: x.lng + dLng,
        size: x.size * (i === 0 ? 1 : 0.6 + rnd(x.id, i * 7 + 4) * 0.3),
        appearAt: x.appearAt + dt,
        launchAt: x.launchAt !== undefined ? x.launchAt + dt : undefined,
        salvo: 1,
      });
    }
  }
  return out;
}

type P3 = { x: number; y: number; z: number };

export type WeaponKind = 'missile' | 'bomb' | 'gun' | 'shell';

/** Classify a strike by its weapon name for in-flight visuals. */
export function weaponKind(name: string): WeaponKind {
  const n = name.toLowerCase();
  if (/\b(20|23|25|30)\s?mm|chain ?gun|cannon|gun ?run|strafe|gau|minigun|machine ?gun|rifle|carbine|small arms|pistol|gunfire|shots?\b/.test(n)) return 'gun';
  if (/jdam|gbu|mk ?8\d|bomb|glide|kab|fab/.test(n)) return 'bomb';
  if (/howitzer|\d{3}\s?mm|shell|mortar|fire mission|artillery/.test(n)) return 'shell';
  return 'missile';
}

/** Blackbody-ish ramp for a cooling fireball; heat in [0,1]. */
function heatColor(h: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [1, [1, 0.97, 0.86]],
    [0.75, [1, 0.78, 0.32]],
    [0.5, [0.98, 0.45, 0.12]],
    [0.3, [0.55, 0.2, 0.08]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [h0, c0] = stops[i];
    const [h1, c1] = stops[i + 1];
    if (h <= h0 && h >= h1) {
      const t = (h0 - h) / (h0 - h1);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return h > 1 ? stops[0][1] : stops[stops.length - 1][1];
}

export class ParticleSystem {
  /** Wind drift direction/strength in mercator axes (x east, y south). */
  wx = 1;
  wy = -0.35;
  trails = new Batch(TRAIL_FRAG, false, 2.5);
  smoke = new Batch(SMOKE_FRAG, false, 2);
  fire = new Batch(FIRE_FRAG, false, 3);

  addTo(scene: THREE.Scene) {
    // smoke first so fire glows on top
    this.trails.points.renderOrder = 9;
    this.smoke.points.renderOrder = 10;
    this.fire.points.renderOrder = 11;
    scene.add(this.trails.points, this.smoke.points, this.fire.points);
  }

  begin() {
    this.trails.n = 0;
    this.smoke.n = 0;
    this.fire.n = 0;
  }

  commit(halfHeight: number) {
    this.trails.commit(halfHeight);
    this.smoke.commit(halfHeight);
    this.fire.commit(halfHeight);
  }

  /**
   * Detonation, shaped by weapon type. `m` = mercator units per meter.
   * - gun: dust puffs + ricochet sparks, no fireball
   * - shell: small flash, brown dirt geyser, lingering dust
   * - missile: tight fireball, sparks, dark plume
   * - bomb: large rolling fireball cooling to black smoke, debris with smoke trails, rising column
   */
  explosion(id: string, p: P3, m: number, size: number, age: number, airburst = false, kind: WeaponKind = 'missile') {
    const life = kind === 'bomb' ? 18 : kind === 'gun' ? 3 : 14;
    if (age < 0 || age > life) return;
    const S = size * m;
    if (kind === 'gun') return this.gunImpact(id, p, S, age);

    const big = kind === 'bomb';
    // white-hot flash + ground glow lighting the terrain
    if (age < 0.14) {
      const k = 1 - age / 0.14;
      this.fire.push(p.x, p.y, p.z + 12 * S, (big ? 160 : 110) * S * (0.7 + 0.3 * k), 1, 0.97, 0.88, k, 1);
    }
    if (age < 0.7) {
      const k = 1 - age / 0.7;
      this.trails.push(p.x, p.y, p.z + 2 * S, (big ? 320 : 200) * S, 1, 0.55, 0.18, 0.2 * k * k, 2);
    }

    if (kind === 'shell') {
      this.dirtGeyser(id, p, S, age);
    } else {
      // rolling fireball that cools from white through orange to soot
      const balls = big ? 13 : 7;
      for (let i = 0; i < balls; i++) {
        const dur = (big ? 1.6 : 1.0) + rnd(id, i) * (big ? 1.2 : 0.6);
        const lf = age / dur;
        if (lf >= 1.6) continue;
        const a = rnd(id, i + 20) * Math.PI * 2;
        const grow = 1 - Math.pow(1 - Math.min(1, lf), 3);
        const r = (big ? 55 : 28) * S * rnd(id, i + 40) * (0.35 + grow);
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        const z = p.z + ((big ? 30 : 18) + (big ? 160 : 70) * grow * (0.4 + rnd(id, i + 60))) * S;
        const sz = ((big ? 60 : 40) + (big ? 110 : 60) * grow) * S;
        const heat = Math.max(0, 1 - lf);
        if (heat > 0.3) {
          const [cr, cg, cb] = heatColor(heat);
          this.fire.push(x, y, z, sz, cr, cg, cb, Math.min(1, heat * 1.5), rnd(id, i + 80));
        } else {
          // cooled into sooty smoke that lingers at the same spot
          const soot = Math.min(1, (0.3 - heat) / 0.3);
          const fade = lf < 1 ? 1 : Math.max(0, 1 - (lf - 1) / 0.6);
          this.smoke.push(x, y, z + 20 * S * soot, sz * (1 + 0.4 * soot), 0.1, 0.09, 0.08, 0.85 * fade, rnd(id, i + 80));
        }
      }
    }

    // incandescent sparks
    const sparks = big ? 26 : 16;
    for (let i = 0; i < sparks; i++) {
      const dur = 0.6 + rnd(id, i + 100) * 1.0;
      if (age >= dur) continue;
      const a = rnd(id, i + 120) * Math.PI * 2;
      const v = (70 + rnd(id, i + 140) * (big ? 260 : 150)) * S;
      const vz = (90 + rnd(id, i + 160) * (big ? 260 : 170)) * S;
      const k = 1 - age / dur;
      this.fire.push(
        p.x + Math.cos(a) * v * age,
        p.y + Math.sin(a) * v * age,
        p.z + Math.max(0, vz * age - 200 * S * age * age) + 5 * S,
        (big ? 16 : 12) * S,
        1, 0.75, 0.35, k, i,
      );
    }

    // debris chunks trailing smoke (bombs and missiles on ground targets)
    if (!airburst) {
      const chunks = big ? 14 : kind === 'missile' ? 6 : 0;
      for (let i = 0; i < chunks; i++) {
        const dur = 1.2 + rnd(id, i + 700) * 1.4;
        if (age >= dur) continue;
        const a = rnd(id, i + 720) * Math.PI * 2;
        const v = (60 + rnd(id, i + 740) * (big ? 220 : 120)) * S;
        const vz = (140 + rnd(id, i + 760) * (big ? 280 : 160)) * S;
        const pos = (t: number) => ({
          x: p.x + Math.cos(a) * v * t,
          y: p.y + Math.sin(a) * v * t,
          z: p.z + Math.max(0, vz * t - 190 * S * t * t) + 4 * S,
        });
        const h = pos(age);
        this.smoke.push(h.x, h.y, h.z, 16 * S, 0.08, 0.07, 0.06, 0.95, i);
        for (let k = 1; k <= 5; k++) {
          const tk = age - k * 0.07;
          if (tk <= 0) break;
          const q = pos(tk);
          this.smoke.push(q.x, q.y, q.z, (14 + k * 6) * S, 0.25, 0.23, 0.21, 0.5 * (1 - k / 6), i + k);
        }
      }
    }

    // smoke plume / column: puffs released over the first second, rise and drift downwind
    const puffs = airburst ? 5 : big ? 22 : kind === 'shell' ? 6 : 14;
    for (let i = 0; i < puffs; i++) {
      const delay = rnd(id, i + 200) * (big ? 2 : 1.2);
      const t = age - delay;
      const dur = (big ? 11 : 7) + rnd(id, i + 220) * 6;
      if (t < 0 || t >= dur) continue;
      const lf = t / dur;
      const ease = 1 - Math.pow(1 - lf, 2.2);
      const a = rnd(id, i + 240) * Math.PI * 2;
      const r = (15 + (big ? 90 : 45) * ease) * S * rnd(id, i + 260);
      const rise = (40 + (big ? 700 : 420) * ease * (0.6 + 0.6 * rnd(id, i + 280))) * S;
      const drift = (big ? 260 : 180) * ease * S;
      const fadeIn = Math.min(1, t / 0.35);
      const dark = 0.13 + 0.32 * lf;
      this.smoke.push(
        p.x + Math.cos(a) * r + drift * this.wx,
        p.y + Math.sin(a) * r + drift * this.wy,
        p.z + rise,
        ((big ? 110 : 70) + (big ? 360 : 260) * ease) * S,
        dark * 1.05, dark, dark * 0.9,
        0.75 * fadeIn * (1 - lf) * (1 - lf * 0.3),
        rnd(id, i + 300),
      );
    }

    // ground shock: dust skirt racing outward
    if (!airburst) {
      const n = big ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const dur = (big ? 4.5 : 3) + rnd(id, i + 400) * 2;
        if (age >= dur) continue;
        const lf = age / dur;
        const a = (i / n) * Math.PI * 2 + rnd(id, i + 420);
        const r = (30 + (big ? 300 : 160) * (1 - Math.pow(1 - lf, 3))) * S;
        this.smoke.push(
          p.x + Math.cos(a) * r,
          p.y + Math.sin(a) * r,
          p.z + 12 * S,
          ((big ? 90 : 60) + (big ? 140 : 90) * lf) * S,
          0.66, 0.58, 0.44,
          0.5 * (1 - lf),
          rnd(id, i + 440),
        );
      }
    }
  }

  /** Cannon round strike: kicked-up dust, a spray of ricochet sparks. */
  private gunImpact(id: string, p: P3, S: number, age: number) {
    if (age < 0.08) this.fire.push(p.x, p.y, p.z + 6 * S, 60 * S, 1, 0.85, 0.5, 1 - age / 0.08, 1);
    for (let i = 0; i < 6; i++) {
      const dur = 0.25 + rnd(id, i + 50) * 0.35;
      if (age >= dur) continue;
      const a = rnd(id, i + 60) * Math.PI * 2;
      const v = (80 + rnd(id, i + 70) * 120) * S;
      this.fire.push(
        p.x + Math.cos(a) * v * age,
        p.y + Math.sin(a) * v * age,
        p.z + (10 + 120 * age - 200 * age * age) * S,
        9 * S, 1, 0.8, 0.4, 1 - age / dur, i,
      );
    }
    for (let i = 0; i < 4; i++) {
      const dur = 1.8 + rnd(id, i + 80) * 1.2;
      if (age >= dur) continue;
      const lf = age / dur;
      const a = rnd(id, i + 90) * Math.PI * 2;
      this.smoke.push(
        p.x + Math.cos(a) * 20 * S * lf,
        p.y + Math.sin(a) * 20 * S * lf,
        p.z + (8 + 50 * lf) * S,
        (30 + 70 * lf) * S,
        0.66, 0.58, 0.45,
        0.6 * (1 - lf),
        rnd(id, i + 95),
      );
    }
  }

  /** Artillery impact: a cone of brown earth thrown up and falling back. */
  private dirtGeyser(id: string, p: P3, S: number, age: number) {
    for (let i = 0; i < 14; i++) {
      const dur = 1.4 + rnd(id, i + 800) * 0.8;
      if (age >= dur) continue;
      const a = rnd(id, i + 810) * Math.PI * 2;
      const spread = rnd(id, i + 820);
      const v = (20 + 70 * spread) * S;
      const vz = (220 + 160 * (1 - spread)) * S;
      const lf = age / dur;
      this.smoke.push(
        p.x + Math.cos(a) * v * age,
        p.y + Math.sin(a) * v * age,
        p.z + Math.max(0, vz * age - 230 * S * age * age),
        (40 + 70 * lf) * S,
        0.36, 0.29, 0.2,
        0.9 * (1 - lf * lf),
        rnd(id, i + 830),
      );
    }
    if (age < 0.35) {
      const k = 1 - age / 0.35;
      this.fire.push(p.x, p.y, p.z + 25 * S, 90 * S, 1, 0.62, 0.22, k, 3);
    }
  }

  /**
   * Weapon in flight. `at(f)` gives the position along its trajectory for
   * flight fraction f in [0,1]; `f` is the current fraction.
   */
  projectile(id: string, kind: WeaponKind, at: (f: number) => P3, f: number, m: number) {
    const head = at(f);
    if (kind === 'gun') {
      // tracer stream: a few glowing slugs strung along the line of fire
      for (let k = 0; k < 4; k++) {
        const fk = f - k * 0.14;
        if (fk <= 0) break;
        const p0 = at(fk);
        const p1 = at(Math.max(0, fk - 0.05));
        for (let j = 0; j < 4; j++) {
          const t = j / 3;
          this.fire.push(
            p0.x + (p1.x - p0.x) * t,
            p0.y + (p1.y - p0.y) * t,
            p0.z + (p1.z - p0.z) * t,
            (16 - j * 3) * m,
            1,
            0.62 - t * 0.2,
            0.25,
            1 - t * 0.6,
            k + j,
          );
        }
      }
      return;
    }
    if (kind === 'bomb') {
      // dark casing with a faint vapor wake
      this.smoke.push(head.x, head.y, head.z, 22 * m, 0.16, 0.16, 0.17, 0.95, 1);
      for (let k = 1; k <= 6; k++) {
        const fk = f - k * 0.025;
        if (fk <= 0) break;
        const p = at(fk);
        this.smoke.push(p.x, p.y, p.z, (16 + k * 4) * m, 0.92, 0.92, 0.9, 0.28 * (1 - k / 7), rnd(id, k));
      }
      return;
    }
    if (kind === 'shell') {
      this.fire.push(head.x, head.y, head.z, 26 * m, 1, 0.78, 0.45, 1, 2);
      for (let k = 1; k <= 4; k++) {
        const p = at(Math.max(0, f - k * 0.02));
        this.fire.push(p.x, p.y, p.z, (20 - k * 3) * m, 1, 0.6, 0.3, 0.5 * (1 - k / 5), k);
      }
      return;
    }
    // missile / rocket: hot motor glow + expanding smoke trail
    this.fire.push(head.x, head.y, head.z, 70 * m, 1, 0.7, 0.35, 0.55, 3);
    this.fire.push(head.x, head.y, head.z, 28 * m, 1, 0.95, 0.8, 1, 4);
    const trail = 26;
    for (let k = 1; k <= trail; k++) {
      const fk = f - k * 0.018;
      if (fk <= 0) break;
      const p = at(fk);
      const life = k / trail;
      const jitter = (rnd(id, k) - 0.5) * 14 * m * life;
      this.smoke.push(
        p.x + jitter,
        p.y - jitter,
        p.z + 6 * m * life,
        (18 + 70 * life) * m,
        0.86,
        0.85,
        0.82,
        0.55 * (1 - life),
        rnd(id, k + 30),
      );
    }
  }

  /** Faint trajectory ribbon from the firing point out to fraction `reach`. */
  trail(id: string, at: (f: number) => P3, reach: number, m: number, r: number, g: number, b: number, alpha: number) {
    if (alpha <= 0.004 || reach <= 0) return;
    // dense overlapping points read as a continuous soft ribbon;
    // it thins toward the firing end so the direction of fire is clear
    const n = Math.max(16, Math.round(140 * reach));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const p = at(k * reach);
      this.trails.push(p.x, p.y, p.z, (10 + 12 * k) * m, r, g, b, alpha * (0.35 + 0.65 * k), rnd(id, i));
    }
  }

  /** Muzzle blast at a launcher. */
  muzzle(id: string, p: P3, m: number, age: number) {
    if (age < 0 || age > 3) return;
    if (age < 0.18) this.fire.push(p.x, p.y, p.z + 8 * m, 90 * m, 1, 0.85, 0.5, 1 - age / 0.18, 3);
    for (let i = 0; i < 4; i++) {
      const life = age / 3;
      const a = rnd(id, i + 500) * Math.PI * 2;
      this.smoke.push(
        p.x + Math.cos(a) * 20 * m * life + 40 * m * life * this.wx,
        p.y + Math.sin(a) * 20 * m * life,
        p.z + (10 + 60 * life) * m,
        (40 + 90 * life) * m,
        0.7,
        0.66,
        0.58,
        0.45 * (1 - life),
        rnd(id, i + 520),
      );
    }
  }

  /** Burning wreck: flickering fire + looping dark smoke column. */
  /** `cookOff`: secondary ammunition bursts (armored vehicles), off for aircraft */
  wreck(id: string, p: P3, m: number, since: number, time: number, cookOff = true) {
    if (since < 0) return;
    const grow = Math.min(1, since / 2.5);
    // ammunition cooking off in the first seconds
    if (cookOff && since < 9) {
      for (let j = 0; j < 5; j++) {
        const tj = 0.9 + rnd(id, j + 950) * 7;
        const age = since - tj;
        if (age < 0 || age > 0.6) continue;
        const k = 1 - age / 0.6;
        this.fire.push(p.x, p.y, p.z + (10 + 40 * age) * m, (60 + 50 * age) * m * (0.6 + rnd(id, j + 960)), 1, 0.7, 0.25, k, j);
        for (let q = 0; q < 6; q++) {
          const a2 = rnd(id, j * 10 + q + 970) * Math.PI * 2;
          const v = (60 + rnd(id, j * 10 + q + 980) * 90) * m;
          this.fire.push(
            p.x + Math.cos(a2) * v * age,
            p.y + Math.sin(a2) * v * age,
            p.z + (15 + 160 * age - 220 * age * age) * m,
            8 * m, 1, 0.85, 0.45, k, q,
          );
        }
      }
    }
    // embers lifting off the fire
    for (let e = 0; e < 5; e++) {
      const period = 2.2 + rnd(id, e + 990) * 1.5;
      const ph = ((time + rnd(id, e + 995) * period) % period) / period;
      this.fire.push(
        p.x + (rnd(id, e + 1000) - 0.5) * 20 * m + 30 * m * ph,
        p.y + (rnd(id, e + 1005) - 0.5) * 20 * m,
        p.z + (15 + 120 * ph) * m,
        6 * m, 1, 0.6, 0.2, grow * (1 - ph), e,
      );
    }
    for (let i = 0; i < 4; i++) {
      const flick = 0.75 + 0.25 * Math.sin(time * (9 + i * 3) + i * 1.7);
      this.fire.push(
        p.x + (rnd(id, i + 600) - 0.5) * 18 * m,
        p.y + (rnd(id, i + 620) - 0.5) * 18 * m,
        p.z + (8 + 10 * i) * m,
        (36 - i * 5) * m * grow * flick,
        1,
        0.5 + 0.1 * i,
        0.15,
        0.9 * grow,
        i + 7,
      );
    }
    const period = 6;
    for (let i = 0; i < 12; i++) {
      const phase = (time + rnd(id, i + 640) * period) % period;
      const life = phase / period;
      if (since < phase) continue;
      this.smoke.push(
        p.x + 110 * m * life * this.wx + (rnd(id, i + 660) - 0.5) * 20 * m,
        p.y + 110 * m * life * this.wy,
        p.z + (20 + 320 * life) * m,
        (35 + 170 * life) * m,
        0.14 + 0.2 * life,
        0.13 + 0.19 * life,
        0.12 + 0.17 * life,
        0.7 * Math.min(1, life * 6) * (1 - life) * grow,
        rnd(id, i + 680),
      );
    }
  }

  /** Damaged but not destroyed: thin grey smoke and the odd spark. */
  smolder(id: string, p: P3, m: number, since: number, time: number) {
    const grow = Math.min(1, since / 1.5);
    const period = 5;
    for (let i = 0; i < 7; i++) {
      const phase = (time + rnd(id, i + 900) * period) % period;
      const life = phase / period;
      this.smoke.push(
        p.x + 70 * m * life * this.wx + (rnd(id, i + 920) - 0.5) * 12 * m,
        p.y + 70 * m * life * this.wy,
        p.z + (14 + 180 * life) * m,
        (22 + 90 * life) * m,
        0.42 + 0.25 * life,
        0.42 + 0.24 * life,
        0.42 + 0.22 * life,
        0.5 * Math.min(1, life * 5) * (1 - life) * grow,
        rnd(id, i + 940),
      );
    }
  }

  /** Dust kicked up behind a moving vehicle: pass recent trail points (newest first). */
  dust(id: string, trail: P3[], m: number, heavy: boolean) {
    trail.forEach((p, k) => {
      const life = k / trail.length;
      const s = (heavy ? 55 : 30) * m;
      this.smoke.push(
        p.x + (rnd(id, k) - 0.5) * s * 0.6,
        p.y + (rnd(id, k + 50) - 0.5) * s * 0.6,
        p.z + (6 + 30 * life) * m,
        s * (0.6 + 1.6 * life),
        0.74,
        0.66,
        0.5,
        (heavy ? 0.26 : 0.16) * (1 - life),
        rnd(id, k + 90),
      );
    });
  }
}
