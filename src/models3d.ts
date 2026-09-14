import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cyl = (
  r1: number,
  r2: number,
  len: number,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  axis: 'x' | 'y' | 'z' = 'y',
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 10), m);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
};

/** Small missile/dart model, nose along +X, ~0.5 units long. */
export function getMissileModel(): THREE.Group {
  const key = '__missile';
  let m = cache.get(key);
  if (!m) {
    const body = new THREE.MeshStandardMaterial({
      color: 0xd8d4c8,
      roughness: 0.4,
      metalness: 0.5,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8a2f22 });
    m = new THREE.Group();
    m.add(cyl(0.03, 0.03, 0.34, body, 0, 0, 0, 'x')); // body
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 10), dark);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.23;
    m.add(nose);
    for (const ry of [0, Math.PI / 2]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.09), dark);
      fin.position.set(-0.14, 0, 0.045);
      fin.rotation.y = ry;
      m.add(fin);
      const fin2 = fin.clone();
      fin2.position.z = -0.045;
      m.add(fin2);
    }
    cache.set(key, m);
  }
  return m;
}

const cache = new Map<string, THREE.Group>();

/* ---------- user-supplied GLB assets ---------- */

const gltfLoader = new GLTFLoader();
const glbCache = new Map<string, THREE.Group | 'loading' | 'error'>();

/**
 * Load a .glb/.gltf model, normalized to ~1 unit footprint, centered,
 * grounded at y=0, facing +X. Returns the template once loaded, or null
 * while loading/failed. `onReady` fires when the model becomes available.
 */
export function loadGlbModel(
  url: string,
  yawDeg: number,
  onReady: () => void,
): THREE.Group | null {
  const key = `${url}|${yawDeg}`;
  const hit = glbCache.get(key);
  if (hit instanceof THREE.Group) return hit;
  if (hit === 'loading' || hit === 'error') return null;

  glbCache.set(key, 'loading');
  gltfLoader.load(
    url,
    (gltf) => {
      const inner = gltf.scene;
      // Normalize: center on origin, ground at y=0, max footprint = 1
      const box3 = new THREE.Box3().setFromObject(inner);
      const size = box3.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z, 1e-6);
      const scale = 1 / maxDim;
      inner.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(inner);
      const center = box2.getCenter(new THREE.Vector3());
      inner.position.sub(center);
      inner.position.y -= box2.min.y;
      // glTF convention is +Z forward; rotate to +X, then apply user yaw
      inner.rotation.y = THREE.MathUtils.degToRad(90 + yawDeg);

      const wrapper = new THREE.Group();
      wrapper.add(inner);
      glbCache.set(key, wrapper);
      onReady();
    },
    undefined,
    () => {
      glbCache.set(key, 'error');
    },
  );
  return null;
}

/**
 * Generic communications satellite, ~1 unit across the solar arrays:
 * foil-wrapped bus, two panel wings, and a nadir-pointing dish (−Z is down).
 */
export function getSatelliteModel(): THREE.Group {
  const key = '__satellite';
  let m = cache.get(key);
  if (!m) {
    const foil = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.8 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1d2f5a, roughness: 0.3, metalness: 0.6, emissive: 0x0a1428 });
    const frame = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.5, metalness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6, metalness: 0.2 });
    m = new THREE.Group();
    // bus
    m.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.22), foil));
    // solar wings with frames and cell rows
    for (const side of [-1, 1]) {
      const boom = cyl(0.006, 0.006, 0.1, frame, side * 0.13, 0, 0, 'x');
      m.add(boom);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.005, 0.14), panel);
      wing.position.set(side * 0.35, 0, 0);
      m.add(wing);
      for (let i = 0; i < 5; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.007, 0.14), frame);
        rib.position.set(side * (0.19 + i * 0.08), 0, 0);
        m.add(rib);
      }
    }
    // nadir dish and feed
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), white);
    dish.rotation.x = Math.PI; // open side faces down
    dish.position.set(0, 0, -0.11);
    const dishHolder = new THREE.Group();
    dishHolder.add(dish);
    dishHolder.rotation.x = -Math.PI / 2;
    m.add(dishHolder);
    m.add(cyl(0.004, 0.004, 0.08, frame, 0, 0, -0.16, 'z'));
    cache.set(key, m);
  }
  return m;
}
