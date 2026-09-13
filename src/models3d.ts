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
