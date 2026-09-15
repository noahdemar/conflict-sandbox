import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { airframeModel, AIRFRAME_LENGTH_M } from '../aerial/airframes';
import { add, cross, flightTime, isHeld, len, missilePos, norm, poseAt, scale, sub, type Pose, type V3 } from '../aerial/flight';
import { boom, cannonRound, gunshot, setJetNoise } from '../audio';
import { loadRealTerrain, TERRAIN_CREDIT } from '../aerial/realTerrain';
import type { AerialScene, AerialShot, AerialStyle, Keyframe, Scenario } from '../types';

/** Active keyframe carrying an aerial shot, if the aerial scene should be on screen now. */
function activeAerial(s: ReturnType<typeof useStore.getState>): { kf: Keyframe; shot: AerialShot } | null {
  const scene = s.scenario.aerial;
  if (!scene || !(s.playing || s.cameraLock || s.viewer || s.articlePreview)) return null;
  const kf = [...s.scenario.keyframes].sort((a, b) => a.time - b.time).filter((k) => k.time <= s.time).pop();
  return kf?.aerial ? { kf, shot: kf.aerial } : null;
}

/** Soft round sprite texture drawn on a canvas (clouds, smoke, fire). */
function softTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Deterministic pseudo-random in [0,1). */
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Patchwork ground texture for the cinematic view. */
function groundTexture(kind: AerialScene['terrain']) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const palettes: Record<string, string[]> = {
    jungle: ['#3f5a2e', '#4d6a34', '#35502a', '#5b7a3c', '#6e8a4a', '#7a8d55'],
    desert: ['#c9b48a', '#bfa77b', '#d4c29b', '#b59c70'],
    sea: ['#2f5670', '#335d78', '#2b4f68'],
    plain: ['#6f7f4d', '#7d8b57', '#8a9460', '#66754a'],
  };
  const pal = palettes[kind ?? 'plain'] ?? palettes.plain;
  g.fillStyle = pal[0];
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = pal[Math.floor(rand(i) * pal.length)];
    g.globalAlpha = 0.35 + rand(i + 5000) * 0.5;
    const x = rand(i + 1000) * 512;
    const y = rand(i + 2000) * 512;
    const w = 12 + rand(i + 3000) * 70;
    const h = 10 + rand(i + 4000) * 60;
    g.beginPath();
    g.ellipse(x, y, w, h, rand(i + 6000) * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  if (kind === 'jungle' || kind === 'plain') {
    // a few rivers and paddy strips
    g.globalAlpha = 0.55;
    g.strokeStyle = '#6f8596';
    g.lineWidth = 3;
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      let x = rand(r + 9000) * 512;
      g.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) {
        x += (rand(r * 100 + y) - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 24);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Vertical gradient sky dome. */
function skyDome(top: string, horizon: string) {
  const geo = new THREE.SphereGeometry(80000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }',
  });
  return new THREE.Mesh(geo, mat);
}

/** A reusable line whose points are rewritten every frame. */
class DynLine {
  geo = new THREE.BufferGeometry();
  arr: Float32Array;
  n = 0;
  obj: THREE.Line | THREE.LineSegments;
  constructor(max: number, mat: THREE.LineBasicMaterial, segments = false) {
    this.arr = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.obj = segments ? new THREE.LineSegments(this.geo, mat) : new THREE.Line(this.geo, mat);
    this.obj.frustumCulled = false;
  }
  begin() {
    this.n = 0;
  }
  push(p: V3) {
    if ((this.n + 1) * 3 > this.arr.length) return;
    this.arr.set(p, this.n * 3);
    this.n++;
  }
  commit() {
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

const FT_PER_M = 3.28084;
const WORLD_UP: V3 = [0, 1, 0];

/**
 * The 3D aerial scene: aircraft built from code, flying their scripted tracks,
 * seen through the active keyframe's camera shot. Two styles: cinematic (sky,
 * clouds, haze, smoke) and briefing (clean grid, colored flight ribbons,
 * altitude drop lines, labels).
 */
export default function AerialView() {
  const on = useStore((s) => !!activeAerial(s));
  const sceneData = useStore((s) => s.scenario.aerial);
  const [styleOverride, setStyleOverride] = useState<AerialStyle | null>(null);
  const style: AerialStyle = styleOverride ?? sceneData?.style ?? 'cinematic';
  const held = useStore((s) => (s.scenario.aerial ? isHeld(s.scenario.aerial, s.time) : false));
  // select the keyframe itself (a stable reference); a fresh object here would re-render forever
  const compareKf = useStore((s) => {
    const act = activeAerial(s);
    return act?.shot.mode === 'compare' ? act.kf : null;
  });
  const factions = useStore((s) => s.scenario.factions);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    if (!on || !hostRef.current) return;
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 120000);
    const scene = new THREE.Scene();

    let built: { style: AerialStyle; data: AerialScene | undefined; dispose: () => void } | null = null;
    /** Ground height under a point; flat until real terrain has loaded. */
    let groundAt: (x: number, z: number) => number = () => 0;
    const planes = new Map<string, THREE.Group>();
    const trails = new Map<string, DynLine>();
    const drops = new DynLine(4000, new THREE.LineBasicMaterial({ color: 0x6b7784, transparent: true, opacity: 0.45 }), true);
    const shadows = new Map<string, DynLine>();
    const tracers = new DynLine(4000, new THREE.LineBasicMaterial({ color: 0xffc36b, transparent: true, opacity: 0.95 }), true);
    const missileSmoke = new DynLine(2000, new THREE.LineBasicMaterial({ color: 0xe8e8e2, transparent: true, opacity: 0.7 }), true);
    const fireTex = softTexture('rgba(255,236,180,1)', 'rgba(255,120,30,0)');
    const smokeTex = softTexture('rgba(70,68,66,0.9)', 'rgba(70,68,66,0)');
    const fx = new THREE.Group();
    const missileBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 3, 8).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xdedcd4 }),
    );
    const labels = new Map<string, HTMLDivElement>();

    // ---- compare shot: the two aircraft on turntables in a plain studio ----
    const studio = new THREE.Scene();
    const studioCam = new THREE.PerspectiveCamera(30, 1, 0.5, 3000);
    const turntables: THREE.Group[] = [];
    let studioKey = '';
    let studioScenario: Scenario | null = null;
    const buildStudio = (st: Scenario, look: AerialStyle, shot: AerialShot) => {
      const key = `${look}|${shot.target}|${shot.secondary}`;
      // rebuild when the shot, the style or the scenario (aircraft, colors) changes
      if (key === studioKey && st === studioScenario) return;
      studioKey = key;
      studioScenario = st;
      studio.clear();
      turntables.length = 0;
      const cinematic = look === 'cinematic';
      studio.background = new THREE.Color(cinematic ? 0x26323d : 0xeef1f4);
      studio.add(new THREE.HemisphereLight(0xffffff, cinematic ? 0x55606b : 0xb8c0c8, cinematic ? 2.2 : 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
      keyLight.position.set(-20, 40, 30);
      studio.add(keyLight);
      const rim = new THREE.DirectionalLight(cinematic ? 0x9fc3ff : 0xffffff, cinematic ? 1.4 : 0.6);
      rim.position.set(30, 10, -40);
      studio.add(rim);
      [shot.target, shot.secondary].forEach((id, i) => {
        const ac = st.aerial?.aircraft.find((a) => a.id === id);
        if (!ac) return;
        const color = st.factions.find((f) => f.id === ac.factionId)?.color ?? '#888888';
        const table = new THREE.Group();
        table.position.set(i === 0 ? -13 : 13, 0, 0);
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(11, 48),
          new THREE.MeshBasicMaterial({ color: cinematic ? 0x2c3945 : 0xdfe4e9, transparent: true, opacity: 0.9 }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = -3.4;
        const ring = new THREE.Mesh(new THREE.RingGeometry(10.6, 11, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -3.35;
        const model = airframeModel(ac.airframe, look, color).clone();
        table.add(disc, ring, model);
        studio.add(table);
        turntables.push(model as THREE.Group);
      });
    };

    /** (Re)build sky, ground, lights and aircraft for the current style and scenario. */
    const build = (st: Scenario, look: AerialStyle) => {
      const data = st.aerial;
      built?.dispose();
      scene.clear();
      planes.clear();
      trails.clear();
      shadows.clear();
      labelsRef.current?.replaceChildren();
      labels.clear();
      const disposables: { dispose: () => void }[] = [];
      const cinematic = look === 'cinematic';
      if (cinematic) {
        const horizon = '#c9d3da';
        scene.add(skyDome('#4f7fb3', horizon));
        scene.fog = new THREE.Fog(horizon, 4000, 42000);
        scene.background = new THREE.Color(horizon);
        const tex = groundTexture(data?.terrain === 'real' ? 'plain' : data?.terrain);
        disposables.push(tex);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshLambertMaterial({ map: tex }));
        ground.rotation.x = -Math.PI / 2;
        ground.name = 'flat-ground';
        scene.add(ground);
        scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x4a5a3a, 1.1));
        const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
        sun.position.set(-3000, 6000, 2000);
        scene.add(sun);
        const cloudTex = softTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
        disposables.push(cloudTex);
        const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, depthWrite: false, fog: true, transparent: true, opacity: 0.85 });
        for (let i = 0; i < 70; i++) {
          const cloud = new THREE.Sprite(cloudMat);
          const size = 900 + rand(i + 70) * 2400;
          cloud.scale.set(size * 1.8, size * 0.7, 1);
          cloud.position.set((rand(i) - 0.5) * 50000, 1400 + rand(i + 30) * 1800, (rand(i + 60) - 0.5) * 50000);
          scene.add(cloud);
        }
      } else {
        const paper = '#eef1f4';
        scene.background = new THREE.Color(paper);
        scene.fog = new THREE.Fog(paper, 12000, 70000);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshBasicMaterial({ color: 0xdde3e8 }));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
        ground.name = 'flat-ground';
        if (data?.terrain !== 'real') {
          const grid = new THREE.GridHelper(60000, 60, 0x9aa7b2, 0xc4ccd3);
          grid.position.y = 1;
          scene.add(grid);
        }
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4ad, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(2000, 5000, 3000);
        scene.add(key);
      }
      for (const ac of data?.aircraft ?? []) {
        const color = st.factions.find((f) => f.id === ac.factionId)?.color ?? '#888888';
        const plane = airframeModel(ac.airframe, look, color).clone();
        planes.set(ac.id, plane);
        scene.add(plane);
        const trailColor = cinematic ? (ac.airframe === 'f4' ? 0x55524c : 0xf2f2ee) : new THREE.Color(color).getHex();
        const trail = new DynLine(3000, new THREE.LineBasicMaterial({ color: trailColor, transparent: true, opacity: cinematic ? 0.4 : 0.95 }));
        trails.set(ac.id, trail);
        scene.add(trail.obj);
        if (!cinematic) {
          const shadow = new DynLine(3000, new THREE.LineBasicMaterial({ color: trailColor, transparent: true, opacity: 0.25 }));
          shadows.set(ac.id, shadow);
          scene.add(shadow.obj);
        }
        const label = document.createElement('div');
        label.className = `aerial-label ${look}`;
        label.style.setProperty('--fc', color);
        labelsRef.current?.appendChild(label);
        labels.set(ac.id, label);
      }
      groundAt = () => 0;
      if (data?.terrain === 'real') {
        // real relief loads in the background; flat ground stands in until it arrives
        const requested = data;
        void loadRealTerrain(data.origin, data.terrainRadiusKm ?? 30, data.terrainExaggeration ?? 1, look, data.terrainTexture ?? 'basemap').then((terrain) => {
          if (!terrain || !built || built.data !== requested || built.style !== look) return;
          const flat = scene.getObjectByName('flat-ground');
          if (flat) flat.position.y = terrain.minHeight - 4;
          scene.add(terrain.mesh);
          groundAt = terrain.heightAt;
        });
      }
      if (!cinematic) scene.add(drops.obj);
      scene.add(tracers.obj, missileSmoke.obj, fx, missileBody);
      built = { style: look, data, dispose: () => disposables.forEach((d) => d.dispose()) };
    };

    const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shotKey: '', lastT: -1, lastFt: -1 };
    let raf = 0;
    let lastFrame = performance.now();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const st = useStore.getState();
      const act = activeAerial(st);
      const data = st.scenario.aerial;
      if (!act || !data) return;
      const look = styleRef.current;
      if (!built || built.style !== look || built.data !== data) build(st.scenario, look);
      const cinematic = look === 'cinematic';

      if (act.shot.mode === 'compare') {
        buildStudio(st.scenario, look, act.shot);
        const cw = host.clientWidth;
        const ch = host.clientHeight;
        renderer.setSize(cw, ch, false);
        studioCam.aspect = cw / Math.max(1, ch);
        // pull back on narrow screens so both aircraft fit
        const fit = Math.max(1, 1.6 / Math.max(0.5, studioCam.aspect));
        studioCam.position.set(0, 13 * fit, 60 * fit);
        studioCam.lookAt(0, -1.5 * fit, 0);
        studioCam.updateProjectionMatrix();
        const spin = (st.time - act.kf.time) * 0.4;
        turntables.forEach((m, i) => (m.rotation.y = spin + (i === 0 ? 0.6 : -0.6 + Math.PI)));
        labels.forEach((l) => (l.style.display = 'none'));
        setJetNoise(0);
        renderer.render(studio, studioCam);
        return;
      }

      const w = host.clientWidth;
      const h = host.clientHeight;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      }
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const t = st.time;
      const ft = flightTime(data, t);
      const byId = new Map(data.aircraft.map((a) => [a.id, a]));
      const poses = new Map<string, Pose>();

      // ---- aircraft ----
      let nearest = Infinity;
      for (const ac of data.aircraft) {
        const pose = poseAt(ac, ft);
        poses.set(ac.id, pose);
        const plane = planes.get(ac.id)!;
        const crashed = pose.down && pose.pos[1] <= groundAt(pose.pos[0], pose.pos[2]) + 2;
        plane.visible = !crashed && ft >= ac.track[0][0] - 30;
        plane.position.set(...pose.pos);
        const basis = new THREE.Matrix4().makeBasis(
          new THREE.Vector3(...pose.fwd),
          new THREE.Vector3(...pose.up),
          new THREE.Vector3(...pose.right),
        );
        plane.quaternion.setFromRotationMatrix(basis);
        nearest = Math.min(nearest, cam.pos.distanceTo(plane.position));

        // trail: cinematic smoke is a short wake; briefing shows the whole path flown so far
        const trail = trails.get(ac.id)!;
        trail.begin();
        const from = cinematic ? Math.max(ac.track[0][0], ft - (pose.down ? 30 : 3.5)) : ac.track[0][0];
        const step = cinematic ? 0.1 : 0.25;
        for (let s = from; s <= ft; s += step) trail.push(poseAt(ac, s).pos);
        trail.push(pose.pos);
        trail.commit();
        const shadow = shadows.get(ac.id);
        if (shadow) {
          shadow.begin();
          for (let s = ac.track[0][0]; s <= ft; s += 0.5) {
            const p = poseAt(ac, s).pos;
            shadow.push([p[0], groundAt(p[0], p[2]) + 3, p[2]]);
          }
          shadow.commit();
        }

        // labels
        const label = labels.get(ac.id);
        if (label) {
          const v = new THREE.Vector3(...pose.pos).project(camera);
          const behind = v.z > 1;
          label.style.display = behind || crashed ? 'none' : '';
          label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
          const alt = Math.round((pose.pos[1] * FT_PER_M) / 100) * 100;
          label.textContent = cinematic ? ac.name : `${ac.name} · ${alt.toLocaleString()} ft`;
        }
      }

      // briefing drop lines: altitude guides every few seconds along each path
      if (!cinematic) {
        drops.begin();
        for (const ac of data.aircraft) {
          for (let s = Math.ceil(ac.track[0][0] / 4) * 4; s <= ft; s += 4) {
            const p = poseAt(ac, s).pos;
            drops.push(p);
            drops.push([p[0], groundAt(p[0], p[2]) + 2, p[2]]);
          }
          const p = poses.get(ac.id)!.pos;
          drops.push(p);
          drops.push([p[0], groundAt(p[0], p[2]) + 2, p[2]]);
        }
        drops.commit();
      }

      // ---- weapons ----
      tracers.begin();
      missileSmoke.begin();
      fx.clear();
      missileBody.visible = false;
      const prevFt = cam.lastFt;
      const playingForward = st.playing && ft >= prevFt && ft - prevFt < 0.5;
      for (const wpn of data.weapons ?? []) {
        const shooter = byId.get(wpn.from);
        const target = byId.get(wpn.target);
        if (!shooter || !target) continue;
        if (wpn.kind === 'guns') {
          const dur = wpn.duration ?? 1.2;
          // MiG-17 cannon fire slower, heavier rounds than a rifle-caliber gun
          const cannon = shooter.airframe === 'mig17';
          const cadence = cannon ? 0.1 : 0.06;
          let round = 0;
          for (let tk = wpn.time; tk <= wpn.time + dur; tk += cadence, round++) {
            const age = ft - tk;
            if (age < 0 || age > 1.6) continue;
            const sp = poseAt(shooter, tk);
            const muzzle = add(sp.pos, scale(sp.fwd, 8));
            // cannon shells are slower than rifle-caliber bullets and fall away a little
            const head = add(add(muzzle, scale(sp.fwd, (sp.speed + (cannon ? 700 : 950)) * age)), [0, -4.9 * age * age, 0]);
            tracers.push(head);
            tracers.push(add(head, scale(sp.fwd, cannon ? -45 : -28)));
            if (cannon) {
              const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
              glow.position.set(...head);
              // every third round is a big 37 mm shell
              glow.scale.setScalar(round % 3 === 0 ? 9 : 5);
              fx.add(glow);
            }
          }
          // muzzle flash while firing
          if (cannon && ft >= wpn.time && ft <= wpn.time + dur) {
            const sp = poseAt(shooter, ft);
            const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
            flash.position.set(...add(sp.pos, scale(sp.fwd, 7)));
            flash.scale.setScalar(6 + Math.sin(ft * 60) * 2);
            fx.add(flash);
          }
          if (playingForward) {
            round = 0;
            for (let tk = wpn.time; tk <= wpn.time + dur; tk += cadence, round++) {
              if (tk > prevFt && tk <= ft) {
                if (cannon) cannonRound(round % 3 === 0, 0.9);
                else gunshot(false, 0.35);
              }
            }
          }
        } else {
          const flight = wpn.duration ?? 3;
          const impact = wpn.time + flight;
          const m = missilePos(shooter, target, wpn.time, impact, ft);
          if (m) {
            const ahead = missilePos(shooter, target, wpn.time, impact, Math.min(impact, ft + 0.02)) ?? m;
            missileBody.visible = true;
            missileBody.position.set(...m);
            const dir = norm(sub(ahead, m));
            if (len(dir) > 0) missileBody.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...dir));
            const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
            flare.position.set(...m);
            flare.scale.setScalar(9);
            fx.add(flare);
          }
          // smoke trail lingers after the missile is gone
          const trailEnd = Math.min(ft, impact);
          if (ft >= wpn.time && ft < impact + 6) {
            let last: V3 | null = null;
            for (let s = wpn.time; s <= trailEnd; s += 0.04) {
              const p = missilePos(shooter, target, wpn.time, impact, s);
              if (p && last) {
                missileSmoke.push(last);
                missileSmoke.push(p);
              }
              last = p;
            }
          }
          if (wpn.hit !== false) {
            const age = ft - impact;
            if (age >= 0 && age < 2.5) {
              const at = poseAt(target, impact).pos;
              const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, depthWrite: false, transparent: true, opacity: Math.max(0, 1 - age / 1.2) }));
              ball.position.set(...at);
              ball.scale.setScalar(20 + age * 60);
              fx.add(ball);
              const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: Math.max(0, 0.8 - age / 3) }));
              puff.position.set(at[0], at[1] + age * 8, at[2]);
              puff.scale.setScalar(30 + age * 45);
              fx.add(puff);
            }
          }
          if (playingForward) {
            if (wpn.time > prevFt && wpn.time <= ft) boom(0.2);
            if (wpn.hit !== false && impact > prevFt && impact <= ft) boom(1.1);
          }
        }
      }
      // burning wrecks trail black smoke puffs
      for (const ac of data.aircraft) {
        const pose = poses.get(ac.id)!;
        if (!pose.down || pose.pos[1] <= groundAt(pose.pos[0], pose.pos[2]) + 2) continue;
        for (let k = 0; k < 14; k++) {
          const s = ft - k * 0.35;
          if (s < ac.destroyedAt!) break;
          const p = poseAt(ac, s).pos;
          const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0.7 * (1 - k / 14) }));
          puff.position.set(...p);
          puff.scale.setScalar(14 + k * 9);
          fx.add(puff);
        }
      }
      tracers.commit();
      missileSmoke.commit();

      // ---- camera director ----
      const shot = act.shot;
      const tgt = poses.get(shot.target) ?? poses.values().next().value;
      if (tgt) {
        const acT = byId.get(shot.target);
        const size = acT ? AIRFRAME_LENGTH_M[acT.airframe] : 15;
        const flatRight = norm(cross(tgt.fwd, WORLD_UP));
        let pos: V3;
        let lookAt: V3;
        if (shot.mode === 'chase') {
          const d = shot.distanceM ?? size * 4.5;
          pos = add(add(tgt.pos, scale(tgt.fwd, -d)), scale(WORLD_UP, d * 0.22));
          lookAt = add(tgt.pos, scale(tgt.fwd, d * 0.6));
        } else if (shot.mode === 'side') {
          const d = shot.distanceM ?? size * 6;
          pos = add(add(tgt.pos, scale(flatRight, d)), scale(WORLD_UP, d * 0.1));
          lookAt = tgt.pos;
        } else if (shot.mode === 'flyby') {
          // a fixed camera the aircraft passes about three seconds into the shot
          const ft0 = flightTime(data, act.kf.time);
          const passing = poseAt(acT ?? data.aircraft[0], ft0 + 3);
          const r = norm(cross(passing.fwd, WORLD_UP));
          pos = add(add(passing.pos, scale(r, shot.distanceM ?? 45)), [0, -12, 0]);
          lookAt = tgt.pos;
        } else {
          const other = shot.secondary ? poses.get(shot.secondary) : undefined;
          const center = other ? scale(add(tgt.pos, other.pos), 0.5) : tgt.pos;
          const spread = other ? len(sub(tgt.pos, other.pos)) : 0;
          const d = shot.distanceM ?? Math.max(400, spread * 1.4);
          const az = Math.atan2(tgt.fwd[2], tgt.fwd[0]) + Math.PI * 0.75 + THREE.MathUtils.degToRad((shot.orbitDegPerS ?? 4) * (t - act.kf.time));
          const el = THREE.MathUtils.degToRad(30);
          pos = add(center, [Math.cos(az) * d * Math.cos(el), d * Math.sin(el), Math.sin(az) * d * Math.cos(el)]);
          lookAt = center;
        }
        // never put the camera underground or skimming the hills
        pos[1] = Math.max(pos[1], groundAt(pos[0], pos[2]) + 30);
        const shotKey = act.kf.id;
        const jumped = Math.abs(t - cam.lastT) > 0.5;
        if (shotKey !== cam.shotKey || jumped) {
          // a new shot is a cut; scrubbing snaps too
          cam.pos.set(...pos);
          cam.look.set(...lookAt);
        } else {
          const k = 1 - Math.exp(-dt * (shot.mode === 'overview' ? 3 : 9));
          cam.pos.lerp(new THREE.Vector3(...pos), k);
          cam.look.lerp(new THREE.Vector3(...lookAt), k);
        }
        cam.shotKey = shotKey;
        camera.position.copy(cam.pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(cam.look);
      }
      cam.lastT = t;
      cam.lastFt = ft;
      setJetNoise(st.playing ? Math.max(0, Math.min(1, 1 - nearest / 1600)) : 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      setJetNoise(0);
      built?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelsRef.current?.replaceChildren();
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className={`aerial-view aerial-${style}`}>
      <div ref={hostRef} className="aerial-canvas" />
      <div ref={labelsRef} className="aerial-labels" />
      {held && !compareKf && <div className="aerial-hold">Action paused</div>}
      {compareKf?.aerial && sceneData && (
        <ComparePanel scene={sceneData} shot={compareKf.aerial} shotKey={compareKf.id} factions={factions} />
      )}
      <div className="aerial-style" role="group" aria-label="Aerial view style">
        {(['cinematic', 'briefing'] as AerialStyle[]).map((s) => (
          <button key={s} className={style === s ? 'on' : ''} onClick={() => setStyleOverride(s)}>
            {s === 'cinematic' ? 'Cinematic' : 'Briefing'}
          </button>
        ))}
      </div>
      {/* the comparison studio shows no terrain, so no data credit is needed there */}
      {!compareKf && (
        <CreditNote credit={sceneData?.terrain === 'real' ? TERRAIN_CREDIT[sceneData.terrainTexture ?? 'basemap'] : undefined} />
      )}
    </div>
  );
}

/**
 * "Illustrative reconstruction" plus the data credit. The credit shows for a
 * moment, then folds into an info button that reopens it.
 */
function CreditNote({ credit }: { credit?: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), 2500);
    return () => window.clearTimeout(timer);
  }, [credit]);
  return (
    <div className={`aerial-note ${open ? 'open' : ''}`}>
      <span>Illustrative reconstruction</span>
      {credit && (
        <>
          <button
            className="aerial-info"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={open ? 'Hide data credits' : 'Show data credits'}
          >
            i
          </button>
          {open && <small>{credit}</small>}
        </>
      )}
    </div>
  );
}

/** Head-to-head stats: aircraft names on each side, rows revealed one by one with proportional bars. */
function ComparePanel({
  scene,
  shot,
  shotKey,
  factions,
}: {
  scene: AerialScene;
  shot: AerialShot;
  shotKey: string;
  factions: Scenario['factions'];
}) {
  const side = (id?: string) => {
    const ac = scene.aircraft.find((a) => a.id === id);
    return { name: ac?.name ?? '', color: factions.find((f) => f.id === ac?.factionId)?.color ?? '#888' };
  };
  const left = side(shot.target);
  const right = side(shot.secondary);
  const rows = shot.compare?.rows ?? [];
  return (
    <div className="compare-panel" key={shotKey}>
      <div className="compare-head">
        <span style={{ '--fc': left.color } as React.CSSProperties}>{left.name}</span>
        <em>vs</em>
        <span style={{ '--fc': right.color } as React.CSSProperties}>{right.name}</span>
      </div>
      {rows.map((r, i) => {
        const max = r.bars ? Math.max(r.bars[0], r.bars[1], 1e-9) : 1;
        return (
          <div className="compare-row" key={r.label} style={{ animationDelay: `${0.4 + i * 0.7}s` }}>
            <div className="compare-val left">
              {r.values[0]}
              {r.bars && <i style={{ width: `${(r.bars[0] / max) * 100}%`, background: left.color }} />}
            </div>
            <div className="compare-label">{r.label}</div>
            <div className="compare-val right">
              {r.values[1]}
              {r.bars && <i style={{ width: `${(r.bars[1] / max) * 100}%`, background: right.color }} />}
            </div>
          </div>
        );
      })}
      {shot.compare?.note && <p className="compare-note">{shot.compare.note}</p>}
    </div>
  );
}
