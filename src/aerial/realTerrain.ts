import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { MODERN_LAYERS, TAN_BLUE_STYLE } from '../mapStyle';

/**
 * Real terrain for the aerial scene: elevation from Terrarium DEM tiles built
 * into a mesh, draped with our own basemap rendered top-down with every name,
 * road, border and building removed (water, woodland and hill shading only).
 */

/** Elevation tile zoom: about 75 m per sample at mid latitudes, fine from the air. */
const DEM_Z = 11;
const TILE = 256;
/** Mesh resolution per side. */
const GRID = 200;

const demUrl = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export type TerrainTexture = 'basemap' | 'satellite';

const ELEVATION_CREDIT = 'Elevation: AWS Terrain Tiles (SRTM and others)';

/** Credit line required for each ground texture. */
export const TERRAIN_CREDIT: Record<TerrainTexture, string> = {
  basemap: `${ELEVATION_CREDIT} · Map data © OpenStreetMap contributors, OpenMapTiles`,
  // CC BY 4.0 edition; later editions are non-commercial only
  satellite: `${ELEVATION_CREDIT} · Sentinel-2 cloudless (s2maps.eu) by EOX IT Services GmbH, contains modified Copernicus Sentinel data 2016`,
};

/** Satellite imagery tile zoom: roughly 30 m per pixel, about a 7 by 7 tile mosaic for a 60 km square. */
const IMAGERY_Z = 12;
const imageryUrl = (z: number, x: number, y: number) =>
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Decode a Terrarium tile into meters. */
function decode(img: HTMLImageElement): Float32Array {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, TILE, TILE).data;
  const h = new Float32Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  return h;
}

const tileXY = (lng: number, lat: number, z: number) => {
  const n = 2 ** z;
  const latR = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n];
};

/** Metres per degree at a latitude, for the local east/north frame. */
export const metersPerDegree = (lat: number) => ({ lng: 111320 * Math.cos((lat * Math.PI) / 180), lat: 110574 });

export interface RealTerrain {
  mesh: THREE.Mesh;
  /** Ground height in meters at local world x (east) and z (south). */
  heightAt: (x: number, z: number) => number;
  minHeight: number;
  dispose: () => void;
}

/** Elevation grid covering the square of half-size `radiusM` around the origin. */
async function heightGrid(origin: [number, number], radiusM: number) {
  const mpd = metersPerDegree(origin[1]);
  const west = origin[0] - radiusM / mpd.lng;
  const east = origin[0] + radiusM / mpd.lng;
  const south = origin[1] - radiusM / mpd.lat;
  const north = origin[1] + radiusM / mpd.lat;
  const [x0, y0] = tileXY(west, north, DEM_Z);
  const [x1, y1] = tileXY(east, south, DEM_Z);
  const tiles = new Map<string, Float32Array | null>();
  const jobs: Promise<void>[] = [];
  for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      jobs.push(loadImage(demUrl(DEM_Z, tx, ty)).then((img) => void tiles.set(`${tx}/${ty}`, img ? decode(img) : null)));
    }
  }
  await Promise.all(jobs);
  const sample = (lng: number, lat: number) => {
    const [fx, fy] = tileXY(lng, lat, DEM_Z);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) return 0;
    const px = Math.min(TILE - 1.001, (fx - tx) * TILE);
    const py = Math.min(TILE - 1.001, (fy - ty) * TILE);
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const ax = px - ix;
    const ay = py - iy;
    const at = (x: number, y: number) => t[Math.min(TILE - 1, y) * TILE + Math.min(TILE - 1, x)];
    // sea and bathymetry read as flat water
    const v = at(ix, iy) * (1 - ax) * (1 - ay) + at(ix + 1, iy) * ax * (1 - ay) + at(ix, iy + 1) * (1 - ax) * ay + at(ix + 1, iy + 1) * ax * ay;
    return Math.max(0, v);
  };
  const heights = new Float32Array(GRID * GRID);
  for (let r = 0; r < GRID; r++) {
    // row 0 is the north edge
    const lat = north - ((north - south) * r) / (GRID - 1);
    for (let c = 0; c < GRID; c++) {
      const lng = west + ((east - west) * c) / (GRID - 1);
      heights[r * GRID + c] = sample(lng, lat);
    }
  }
  return { heights, bounds: { west, east, south, north } };
}

/**
 * Our basemap rendered top-down over the square, without names, roads,
 * borders or buildings, cropped exactly to the bounds.
 */
function basemapImage(bounds: { west: number; east: number; south: number; north: number }, px = 2048): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${px / 2}px`, height: `${px / 2}px`, pointerEvents: 'none' });
    document.body.appendChild(host);
    const style = {
      ...TAN_BLUE_STYLE,
      layers: TAN_BLUE_STYLE.layers.filter((l) => l.type !== 'symbol' && !MODERN_LAYERS.includes(l.id)),
    };
    let done = false;
    let map: maplibregl.Map | null = null;
    const finish = (canvas: HTMLCanvasElement | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      map?.remove();
      host.remove();
      resolve(canvas);
    };
    const timer = window.setTimeout(() => capture(), 25000);
    const capture = () => {
      if (!map || done) return finish(null);
      const src = map.getCanvas();
      const ratio = src.width / host.clientWidth;
      const nw = map.project([bounds.west, bounds.north]);
      const se = map.project([bounds.east, bounds.south]);
      const out = document.createElement('canvas');
      out.width = out.height = px;
      out.getContext('2d')!.drawImage(src, nw.x * ratio, nw.y * ratio, (se.x - nw.x) * ratio, (se.y - nw.y) * ratio, 0, 0, px, px);
      finish(out);
    };
    try {
      map = new maplibregl.Map({
        container: host,
        style,
        interactive: false,
        attributionControl: false,
        pixelRatio: 2,
        fadeDuration: 0,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        bounds: [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
      });
      map.once('idle', capture);
      map.on('error', () => undefined);
    } catch {
      finish(null);
    }
  });
}

/** Cloud-free satellite mosaic stitched from imagery tiles and cropped exactly to the bounds. */
async function satelliteImage(bounds: { west: number; east: number; south: number; north: number }, px = 2048): Promise<HTMLCanvasElement | null> {
  const [fx0, fy0] = tileXY(bounds.west, bounds.north, IMAGERY_Z);
  const [fx1, fy1] = tileXY(bounds.east, bounds.south, IMAGERY_Z);
  const tx0 = Math.floor(fx0);
  const ty0 = Math.floor(fy0);
  const tx1 = Math.floor(fx1);
  const ty1 = Math.floor(fy1);
  const mosaic = document.createElement('canvas');
  mosaic.width = (tx1 - tx0 + 1) * TILE;
  mosaic.height = (ty1 - ty0 + 1) * TILE;
  const g = mosaic.getContext('2d')!;
  // a neutral ground color, so a tile that never arrives isn't a black hole
  g.fillStyle = '#5d6a45';
  g.fillRect(0, 0, mosaic.width, mosaic.height);
  let loaded = 0;
  /** Retry a tile a couple of times; imagery servers occasionally drop requests. */
  const fetchTile = async (z: number, x: number, y: number) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const img = await loadImage(imageryUrl(z, x, y));
      if (img) return img;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return null;
  };
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        fetchTile(IMAGERY_Z, tx, ty).then(async (img) => {
          const dx = (tx - tx0) * TILE;
          const dy = (ty - ty0) * TILE;
          if (img) {
            g.drawImage(img, dx, dy);
            loaded++;
            return;
          }
          // still missing: stretch the matching quarter of the lower-zoom parent tile
          const parent = await fetchTile(IMAGERY_Z - 1, tx >> 1, ty >> 1);
          if (parent) g.drawImage(parent, (tx & 1) * (TILE / 2), (ty & 1) * (TILE / 2), TILE / 2, TILE / 2, dx, dy, TILE, TILE);
        }),
      );
    }
  }
  await Promise.all(jobs);
  if (!loaded) return null;
  const out = document.createElement('canvas');
  out.width = out.height = px;
  out.getContext('2d')!.drawImage(mosaic, (fx0 - tx0) * TILE, (fy0 - ty0) * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE, 0, 0, px, px);
  return out;
}

const cache = new Map<string, Promise<RealTerrain | null>>();

/**
 * Terrain mesh for the local frame used by the aerial scene (x east, y up,
 * z south, meters). Resolves null if elevation or map tiles can't be loaded.
 */
export function loadRealTerrain(
  origin: [number, number],
  radiusKm = 30,
  exaggeration = 1,
  look: 'cinematic' | 'briefing' = 'cinematic',
  texture: TerrainTexture = 'basemap',
): Promise<RealTerrain | null> {
  const key = `${origin.join(',')}|${radiusKm}|${exaggeration}|${look}|${texture}`;
  let p = cache.get(key);
  if (!p) {
    p = build(origin, radiusKm * 1000, exaggeration, look, texture).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

async function build(
  origin: [number, number],
  radiusM: number,
  exaggeration: number,
  look: 'cinematic' | 'briefing',
  textureKind: TerrainTexture,
): Promise<RealTerrain | null> {
  const box = boundsFor(origin, radiusM);
  const [{ heights }, image] = await Promise.all([
    heightGrid(origin, radiusM),
    // satellite falls back to the name-free basemap if imagery can't be loaded
    textureKind === 'satellite' ? satelliteImage(box).then((img) => img ?? basemapImage(box)) : basemapImage(box),
  ]);
  const geo = new THREE.PlaneGeometry(radiusM * 2, radiusM * 2, GRID - 1, GRID - 1);
  geo.rotateX(-Math.PI / 2); // plane's +Y (north edge) -> world -Z (north)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const h = heights[i] * exaggeration;
    pos.setY(i, h);
    min = Math.min(min, h);
  }
  geo.computeVertexNormals();
  let texture: THREE.Texture | null = null;
  if (image) {
    let canvas = image;
    if (look === 'briefing') {
      // briefing: the same ground, desaturated and lightened so flight paths stand out
      const grey = document.createElement('canvas');
      grey.width = canvas.width;
      grey.height = canvas.height;
      const g = grey.getContext('2d')!;
      g.filter = 'grayscale(1) brightness(1.18) contrast(0.75)';
      g.drawImage(canvas, 0, 0);
      canvas = grey;
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }
  const mat = texture
    ? new THREE.MeshLambertMaterial({ map: texture })
    : new THREE.MeshLambertMaterial({ color: look === 'briefing' ? 0xd9dee2 : 0x6f7f4d });
  const mesh = new THREE.Mesh(geo, mat);

  const span = radiusM * 2;
  const heightAt = (x: number, z: number) => {
    // grid column from west (x = -R) to east, row from north (z = -R) to south
    const c = ((x + radiusM) / span) * (GRID - 1);
    const r = ((z + radiusM) / span) * (GRID - 1);
    if (c < 0 || r < 0 || c > GRID - 1 || r > GRID - 1) return min;
    const c0 = Math.floor(c);
    const r0 = Math.floor(r);
    const c1 = Math.min(GRID - 1, c0 + 1);
    const r1 = Math.min(GRID - 1, r0 + 1);
    const fc = c - c0;
    const fr = r - r0;
    const h = (rr: number, cc: number) => heights[rr * GRID + cc];
    return (
      (h(r0, c0) * (1 - fc) * (1 - fr) + h(r0, c1) * fc * (1 - fr) + h(r1, c0) * (1 - fc) * fr + h(r1, c1) * fc * fr) * exaggeration
    );
  };
  return {
    mesh,
    heightAt,
    minHeight: min,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      texture?.dispose();
    },
  };
}

function boundsFor(origin: [number, number], radiusM: number) {
  const mpd = metersPerDegree(origin[1]);
  return {
    west: origin[0] - radiusM / mpd.lng,
    east: origin[0] + radiusM / mpd.lng,
    south: origin[1] - radiusM / mpd.lat,
    north: origin[1] + radiusM / mpd.lat,
  };
}
