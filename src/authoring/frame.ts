import type { LngLat } from '../geo';

/**
 * Framing arithmetic shared by the position resolver and the camera composer:
 * offsets on the ground, bounding boxes, and the zoom that fits a box.
 */

const EARTH_M_PER_DEG = 111320;

/** Metres per degree of longitude at a latitude. */
export const lngMetersAt = (lat: number) => EARTH_M_PER_DEG * Math.cos((lat * Math.PI) / 180);

/** Point `km` away from `from` on a compass bearing (0 = north, 90 = east). */
export function destination(from: LngLat, bearingDeg: number, km: number): LngLat {
  const rad = (bearingDeg * Math.PI) / 180;
  const north = Math.cos(rad) * km * 1000;
  const east = Math.sin(rad) * km * 1000;
  return [from[0] + east / Math.max(1, lngMetersAt(from[1])), from[1] + north / EARTH_M_PER_DEG];
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function bboxOf(points: LngLat[]): Bbox | null {
  if (!points.length) return null;
  const box = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  for (const [lng, lat] of points) {
    box.west = Math.min(box.west, lng);
    box.east = Math.max(box.east, lng);
    box.south = Math.min(box.south, lat);
    box.north = Math.max(box.north, lat);
  }
  return box;
}

export const centerOf = (b: Bbox): LngLat => [(b.west + b.east) / 2, (b.south + b.north) / 2];

/** Grow a box by a factor around its centre, with a floor so a single point still gets a frame. */
export function padBox(b: Bbox, factor = 1.6, minSpanDeg = 0.004): Bbox {
  const [cx, cy] = centerOf(b);
  const w = Math.max((b.east - b.west) * factor, minSpanDeg);
  const h = Math.max((b.north - b.south) * factor, minSpanDeg);
  return { west: cx - w / 2, east: cx + w / 2, south: cy - h / 2, north: cy + h / 2 };
}

/**
 * Nominal viewport the composer frames for. Deliberately smaller than a
 * desktop window: zoom is absolute, so framing for a modest viewport keeps the
 * subject inside an embedded article scene and a narrow screen as well as a
 * full-width map.
 */
export const FRAME_W = 960;
export const FRAME_H = 600;

/**
 * Web-mercator zoom that fits a box in the nominal viewport. Clamped to the
 * range where the basemap and unit icons both read well.
 */
export function zoomForBox(b: Bbox, width = FRAME_W, height = FRAME_H): number {
  const lat = (b.south + b.north) / 2;
  const lngSpan = Math.max(1e-5, b.east - b.west);
  const latSpan = Math.max(1e-5, b.north - b.south);
  const zx = Math.log2((360 * width) / (256 * lngSpan));
  // a degree of latitude covers 1/cos(lat) as many pixels as a degree of
  // longitude, so the same box needs a wider zoom to fit vertically
  const zy = Math.log2((360 * height * Math.cos((lat * Math.PI) / 180)) / (256 * latSpan));
  return Math.max(3, Math.min(17, Math.min(zx, zy)));
}

/** Whether a point sits inside the box a shot frames (used by the lint pass). */
export function boxContains(b: Bbox, p: LngLat): boolean {
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
}

/**
 * The box a camera pose covers, approximately: the inverse of zoomForBox.
 *
 * A tilted camera sees much further than a top-down one — the ground stretches
 * away to the horizon — so the box grows with pitch. It stays axis-aligned and
 * symmetric, which overestimates a little; that is the right way to be wrong
 * for a check that tells authors something is out of frame.
 */
export function boxForCamera(center: LngLat, zoom: number, pitch = 0, width = FRAME_W, height = FRAME_H): Bbox {
  const tilt = 1 + Math.sin((Math.max(0, Math.min(85, pitch)) * Math.PI) / 180) * 1.5;
  const lngSpan = ((360 * width) / (256 * Math.pow(2, zoom))) * tilt;
  const latSpan = ((360 * height) / (256 * Math.pow(2, zoom))) * Math.cos((center[1] * Math.PI) / 180) * tilt;
  return {
    west: center[0] - lngSpan / 2,
    east: center[0] + lngSpan / 2,
    south: center[1] - latSpan / 2,
    north: center[1] + latSpan / 2,
  };
}

/** Seconds a caption takes to read aloud: about 2.5 words a second, plus a breath. */
export function readSeconds(caption: string): number {
  const words = caption.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.5 + 0.6;
}
