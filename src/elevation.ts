import type { LngLat } from './geo';

/**
 * Terrain elevation sampler for line-of-sight. Reads Terrarium-encoded DEM
 * tiles directly (the map itself renders flat), caches decoded heights and
 * reports when new tiles arrive so dependent overlays can recompute.
 */

const Z = 12;
const SIZE = 256;
const URL = (x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;

const tiles = new Map<string, Float32Array | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

/** Subscribe to "more elevation data is available". */
export function onElevationLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load(x: number, y: number) {
  const key = `${x}/${y}`;
  if (tiles.has(key) || pending.has(key)) return;
  pending.add(key);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const h = new Float32Array(SIZE * SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
      }
      tiles.set(key, h);
    } catch {
      tiles.set(key, null);
    }
    pending.delete(key);
    listeners.forEach((fn) => fn());
  };
  img.onerror = () => {
    tiles.set(key, null);
    pending.delete(key);
  };
  img.src = URL(x, y);
}

/** Elevation in meters, or undefined while the tile is still loading. */
export function elevationAt([lng, lat]: LngLat): number | undefined {
  const n = 2 ** Z;
  const fx = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const key = `${tx}/${ty}`;
  const tile = tiles.get(key);
  if (tile === undefined) {
    load(tx, ty);
    return undefined;
  }
  if (tile === null) return 0;
  const px = Math.min(SIZE - 1.001, (fx - tx) * SIZE);
  const py = Math.min(SIZE - 1.001, (fy - ty) * SIZE);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const ax = px - x0;
  const ay = py - y0;
  const at = (x: number, y: number) => tile[Math.min(SIZE - 1, y) * SIZE + Math.min(SIZE - 1, x)];
  return (
    at(x0, y0) * (1 - ax) * (1 - ay) +
    at(x0 + 1, y0) * ax * (1 - ay) +
    at(x0, y0 + 1) * (1 - ax) * ay +
    at(x0 + 1, y0 + 1) * ax * ay
  );
}

/**
 * Radial line-of-sight: for each bearing, how far the observer can see before
 * terrain first blocks the view. Returns null until all needed terrain is loaded.
 */
export function viewshed(
  center: LngLat,
  rangeKm: number,
  observerHeightM = 4,
  rays = 144,
  steps = 60,
): LngLat[] | null {
  const h0 = elevationAt(center);
  if (h0 === undefined) return null;
  const eye = h0 + observerHeightM;
  const cosLat = Math.cos((center[1] * Math.PI) / 180);
  const ring: LngLat[] = [];
  let complete = true;
  for (let r = 0; r < rays; r++) {
    const b = (r / rays) * Math.PI * 2;
    const dx = Math.sin(b);
    const dy = Math.cos(b);
    let maxSlope = -Infinity;
    let reach = rangeKm;
    for (let i = 1; i <= steps; i++) {
      const dKm = (i / steps) * rangeKm;
      const p: LngLat = [center[0] + (dx * dKm) / (111.32 * cosLat), center[1] + (dy * dKm) / 111.32];
      const h = elevationAt(p);
      if (h === undefined) {
        complete = false;
        break;
      }
      // earth curvature drop (~0.0785 m per km²)
      const slope = (h - 0.0785 * dKm * dKm - eye) / (dKm * 1000);
      if (slope < maxSlope - 0.0005 && i > 2) {
        reach = dKm;
        break;
      }
      maxSlope = Math.max(maxSlope, slope);
    }
    ring.push([center[0] + (dx * reach) / (111.32 * cosLat), center[1] + (dy * reach) / 111.32]);
  }
  if (!complete) return null;
  ring.push(ring[0]);
  return ring;
}
