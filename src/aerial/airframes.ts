import * as THREE from 'three';
import type { Airframe } from '../types';

/**
 * Aircraft built in code from simple shapes (no model files), in meters at
 * roughly true size, nose along +X, top along +Y, right wing along +Z.
 */

type Mats = { skin: THREE.Material; dark: THREE.Material; glass: THREE.Material };

/** Fuselage from a radius profile [[x, radius], ...], revolved about the X axis. */
function fuselage(profile: [number, number][], m: THREE.Material) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(0.001, r), x));
  const g = new THREE.LatheGeometry(pts, 18);
  g.rotateZ(-Math.PI / 2); // lathe axis Y -> X
  return new THREE.Mesh(g, m);
}

/** Flat lifting surface from a planform [[x, span], ...] in the X/Z plane, `t` meters thick. */
function surface(points: [number, number][], t: number, m: THREE.Material) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape Y -> +Z span, extrusion -> -Y thickness
  g.translate(0, t / 2, 0);
  return new THREE.Mesh(g, m);
}

/** Vertical fin from a profile [[x, height], ...] in the X/Y plane. */
function fin(points: [number, number][], t: number, m: THREE.Material) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return new THREE.Mesh(g, m);
}

/** Mirror a right-side part to the left (Z -> -Z), including its position and tilt. */
function mirrored(part: THREE.Object3D) {
  const g = new THREE.Group();
  const left = new THREE.Group();
  left.add(part.clone());
  // mirroring the parent flips the part's own offset and rotation too
  left.scale.z = -1;
  g.add(part, left);
  return g;
}

function nozzle(x: number, y: number, z: number, r: number, l: number, m: THREE.Material) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, l, 14), m);
  c.rotation.z = Math.PI / 2;
  c.position.set(x, y, z);
  return c;
}

/** McDonnell Douglas F-4 Phantom II: long nose, big intakes, cranked wing with upturned tips, drooping tailplanes, twin engines. */
function phantom(m: Mats) {
  const g = new THREE.Group();
  g.add(
    fuselage(
      [[9.6, 0], [8.8, 0.3], [7.2, 0.62], [5.2, 0.86], [3, 1.0], [0, 1.12], [-3, 1.15], [-6.5, 1.0], [-8.8, 0.82], [-9.6, 0.72]],
      m.skin,
    ),
  );
  // tandem canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m.glass);
  canopy.scale.set(2.7, 0.62, 0.58);
  canopy.position.set(4.4, 0.78, 0);
  g.add(canopy);
  // boxy intakes beside the cockpit
  const intake = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.35, 0.75), m.skin);
  intake.position.set(1.6, -0.05, 1.2);
  g.add(mirrored(intake));
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.15, 0.55), m.dark);
  mouth.position.set(3.72, -0.05, 1.2);
  g.add(mirrored(mouth));
  // inner wing, flat
  const inner = surface([[2.6, 1.1], [-0.6, 4.1], [-3.8, 4.1], [-4.6, 1.1]], 0.28, m.skin);
  inner.position.y = -0.35;
  g.add(mirrored(inner));
  // outer wing panel with the Phantom's 12 degree dihedral
  const outerShape = surface([[-0.6, 0], [-2.3, 1.8], [-3.4, 1.8], [-3.8, 0]], 0.2, m.skin);
  const outer = new THREE.Group();
  outer.add(outerShape);
  outer.position.set(0, -0.35, 4.1);
  outer.rotation.x = -THREE.MathUtils.degToRad(12);
  g.add(mirrored(outer));
  // stabilators with 23 degree anhedral
  const stabShape = surface([[-6.8, 0], [-9.2, 2.6], [-10.2, 2.6], [-9.7, 0]], 0.16, m.skin);
  const stab = new THREE.Group();
  stab.add(stabShape);
  stab.position.set(0, 0.2, 0.75);
  stab.rotation.x = THREE.MathUtils.degToRad(23);
  g.add(mirrored(stab));
  // fin
  g.add(fin([[-4.9, 0.7], [-8.4, 3.7], [-9.6, 3.7], [-9.3, 0.7]], 0.18, m.skin));
  // twin J79 nozzles
  g.add(nozzle(-9.7, -0.15, 0.48, 0.42, 0.6, m.dark), nozzle(-9.7, -0.15, -0.48, 0.42, 0.6, m.dark));
  return g;
}

/** Mikoyan-Gurevich MiG-17: nose intake, bubble canopy, 45 degree wings with fences, tall swept fin with high tailplane. */
function fresco(m: Mats) {
  const g = new THREE.Group();
  g.add(fuselage([[5.65, 0.52], [4.6, 0.72], [2.5, 0.82], [0, 0.82], [-2.5, 0.72], [-4.6, 0.55], [-5.65, 0.46]], m.skin));
  // dark nose intake with splitter
  const intake = new THREE.Mesh(new THREE.CircleGeometry(0.45, 18), m.dark);
  intake.rotation.y = Math.PI / 2;
  intake.position.x = 5.66;
  g.add(intake);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m.glass);
  canopy.scale.set(1.25, 0.5, 0.42);
  canopy.position.set(2.4, 0.66, 0);
  g.add(canopy);
  const wing = surface([[1.3, 0.6], [-2.7, 4.8], [-3.7, 4.8], [-2.5, 0.6]], 0.22, m.skin);
  wing.position.y = -0.2;
  wing.rotation.x = -THREE.MathUtils.degToRad(3);
  g.add(mirrored(wing));
  // boundary-layer fences on the wing
  for (const z of [1.7, 2.8, 3.8]) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.05), m.skin);
    fence.position.set(-1.2 - z * 0.85, -0.02, z);
    g.add(mirrored(fence));
  }
  g.add(fin([[-2.1, 0.5], [-4.8, 3.1], [-5.9, 3.1], [-5.4, 0.5]], 0.16, m.skin));
  const stab = surface([[-4.3, 0], [-5.4, 1.8], [-6.0, 1.8], [-5.9, 0]], 0.12, m.skin);
  stab.position.y = 1.4;
  g.add(mirrored(stab));
  g.add(nozzle(-5.75, 0, 0, 0.36, 0.4, m.dark));
  return g;
}

/** Generic swept-wing jet for aircraft without a dedicated airframe. */
function genericJet(m: Mats) {
  const g = new THREE.Group();
  g.add(fuselage([[7, 0], [6, 0.35], [3.5, 0.8], [0, 0.95], [-4, 0.9], [-7, 0.6]], m.skin));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), m.glass);
  canopy.scale.set(1.6, 0.5, 0.45);
  canopy.position.set(3.6, 0.7, 0);
  g.add(canopy);
  g.add(mirrored(surface([[1.5, 0.8], [-2.5, 5], [-3.6, 5], [-3.2, 0.8]], 0.22, m.skin)));
  g.add(mirrored(surface([[-5, 0.5], [-6.6, 2.4], [-7.3, 2.4], [-7, 0.5]], 0.14, m.skin)));
  g.add(fin([[-3.6, 0.7], [-6.3, 3], [-7.2, 3], [-7, 0.7]], 0.15, m.skin));
  g.add(nozzle(-7.1, 0, 0, 0.45, 0.4, m.dark));
  return g;
}

const cache = new Map<string, THREE.Group>();

/**
 * Airframe template (clone before adding to a scene). Cinematic style uses a
 * period finish (Southeast Asia camouflage for the F-4, bare metal for the
 * MiG); briefing style paints the whole aircraft in its faction color.
 */
export function airframeModel(airframe: Airframe, style: 'cinematic' | 'briefing', factionColor: string): THREE.Group {
  const key = `${airframe}|${style}|${factionColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const briefing = style === 'briefing';
  const skinColor = briefing
    ? factionColor
    : airframe === 'f4'
      ? '#7d7a57'
      : airframe === 'mig17'
        ? '#b9bdc0'
        : '#9aa0a6';
  const mats: Mats = {
    skin: briefing
      ? new THREE.MeshLambertMaterial({ color: skinColor, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: skinColor, roughness: airframe === 'mig17' ? 0.38 : 0.8, metalness: airframe === 'mig17' ? 0.55 : 0.05, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: briefing ? 0xeef3f7 : 0x1c2a33, roughness: 0.15, metalness: 0.4 }),
  };
  const model = airframe === 'f4' ? phantom(mats) : airframe === 'mig17' ? fresco(mats) : genericJet(mats);
  // the Phantom is drawn at F-4E length (19.2 m); scale it to the F-4C's 17.8 m
  if (airframe === 'f4') model.scale.setScalar(17.8 / 19.2);
  cache.set(key, model);
  return model;
}

/** Real length in meters, used for camera framing. */
export const AIRFRAME_LENGTH_M: Record<Airframe, number> = { f4: 17.8, mig17: 11.3, jet: 14 };
