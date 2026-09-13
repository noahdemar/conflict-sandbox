export type LngLat = [number, number];

/** Catmull-Rom spline smoothing for a polyline. Returns a densified line. */
export function smoothPath(points: LngLat[], resolution = 10): LngLat[] {
  if (points.length < 3) return points.slice();
  const out: LngLat[] = [];
  const pts = [points[0], ...points, points[points.length - 1]];
  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];
    for (let j = 0; j < resolution; j++) {
      const t = j / resolution;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Approximate length of a path in degrees (fine for interpolation). */
export function pathLength(path: LngLat[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  }
  return len;
}

/** Point + heading at fraction t (0..1) along a path. */
export function pointAlongPath(
  path: LngLat[],
  t: number,
): { point: LngLat; bearing: number } {
  if (path.length === 0) return { point: [0, 0], bearing: 0 };
  if (path.length === 1 || t <= 0) {
    const b =
      path.length > 1
        ? bearingBetween(path[0], path[1])
        : 0;
    return { point: path[0], bearing: b };
  }
  const total = pathLength(path);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(
      path[i][0] - path[i - 1][0],
      path[i][1] - path[i - 1][1],
    );
    if (target <= seg || i === path.length - 1) {
      const f = seg === 0 ? 0 : target / seg;
      const point: LngLat = [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f,
      ];
      return { point, bearing: bearingBetween(path[i - 1], path[i]) };
    }
    target -= seg;
  }
  const last = path[path.length - 1];
  return { point: last, bearing: bearingBetween(path[path.length - 2], last) };
}

/** Partial path from start to fraction t (for progressive arrow drawing). */
export function partialPath(path: LngLat[], t: number): LngLat[] {
  if (path.length === 0) return [];
  if (t >= 1) return path.slice();
  const total = pathLength(path);
  let target = Math.max(0, t) * total;
  const out: LngLat[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(
      path[i][0] - path[i - 1][0],
      path[i][1] - path[i - 1][1],
    );
    if (target >= seg) {
      out.push(path[i]);
      target -= seg;
    } else {
      const f = seg === 0 ? 0 : target / seg;
      out.push([
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f,
      ]);
      break;
    }
  }
  return out;
}

export function bearingBetween(a: LngLat, b: LngLat): number {
  return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
}

export interface CameraPose {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/** Shortest-path interpolation between two bearings (degrees). */
function lerpBearing(a: number, b: number, f: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * f;
}

/**
 * Interpolated camera pose at time t across sorted keyframes.
 * Holds the first/last pose outside the keyframe range; eases between keys.
 */
export function interpolateCamera(
  keyframes: {
    time: number;
    lng: number;
    lat: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
    followUnitId?: string;
    followMode?: 'track' | 'chase';
    orbitSpeed?: number;
  }[],
  t: number,
  resolveUnit?: (id: string) => { point: LngLat; bearing: number } | null,
): CameraPose {
  const s = [...keyframes].sort((a, b) => a.time - b.time);
  const toPose = (k: (typeof s)[number]): CameraPose => ({
    lng: k.lng,
    lat: k.lat,
    zoom: k.zoom,
    pitch: k.pitch ?? 0,
    bearing: k.bearing ?? 0,
  });
  const first = s[0];
  const last = s[s.length - 1];
  let pose: CameraPose;
  if (t <= first.time) {
    pose = toPose(first);
  } else if (t >= last.time) {
    pose = toPose(last);
  } else {
    pose = toPose(last);
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (t >= a.time && t <= b.time) {
        const f = smoothstep((t - a.time) / (b.time - a.time));
        pose = {
          lng: a.lng + (b.lng - a.lng) * f,
          lat: a.lat + (b.lat - a.lat) * f,
          zoom: a.zoom + (b.zoom - a.zoom) * f,
          pitch: (a.pitch ?? 0) + ((b.pitch ?? 0) - (a.pitch ?? 0)) * f,
          bearing: lerpBearing(a.bearing ?? 0, b.bearing ?? 0, f),
        };
        break;
      }
    }
  }
  // Tracking shot: active keyframe pins the camera to a unit
  const active =
    t < first.time
      ? first
      : [...s].reverse().find((k) => k.time <= t) ?? first;
  if (active.followUnitId && resolveUnit) {
    const u = resolveUnit(active.followUnitId);
    if (u) {
      pose.lng = u.point[0];
      pose.lat = u.point[1];
      // Chase cam: look along the unit's direction of travel
      if (active.followMode === 'chase') pose.bearing = u.bearing;
    }
  }
  // Orbit: camera bearing sweeps while this keyframe is active
  if (active.orbitSpeed) {
    pose.bearing += (t - active.time) * active.orbitSpeed;
  }
  return pose;
}

/** Geographic circle polygon (great-circle radius in km). */
export function circlePolygon(
  center: LngLat,
  radiusKm: number,
  steps = 72,
): LngLat[] {
  const [lng, lat] = center;
  const rad = radiusKm / 6371;
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const pts: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const la = Math.asin(
      Math.sin(latR) * Math.cos(rad) +
        Math.cos(latR) * Math.sin(rad) * Math.cos(brg),
    );
    const lo =
      lngR +
      Math.atan2(
        Math.sin(brg) * Math.sin(rad) * Math.cos(latR),
        Math.cos(rad) - Math.sin(latR) * Math.sin(la),
      );
    pts.push([(lo * 180) / Math.PI, (la * 180) / Math.PI]);
  }
  return pts;
}

/**
 * Clockwise loiter orbit entered tangentially from `entry` while flying
 * `bearing` (compass degrees). Returns position and heading `t` seconds in.
 */
export function orbitPose(
  entry: LngLat,
  bearing: number,
  t: number,
  radiusM: number,
  periodS: number,
): { point: LngLat; bearing: number } {
  const lat0 = (entry[1] * Math.PI) / 180;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(lat0);
  const rad = (d: number) => (d * Math.PI) / 180;
  // orbit center sits to the right of the entry heading
  const cb = rad(bearing + 90);
  const center: LngLat = [
    entry[0] + (Math.sin(cb) * radiusM) / mLng,
    entry[1] + (Math.cos(cb) * radiusM) / mLat,
  ];
  const theta = bearing - 90 + (360 * Math.max(0, t)) / periodS;
  const th = rad(theta);
  return {
    point: [center[0] + (Math.sin(th) * radiusM) / mLng, center[1] + (Math.cos(th) * radiusM) / mLat],
    bearing: (theta + 90) % 360,
  };
}

/**
 * Round polyline corners (Chaikin corner cutting). Near-duplicate points are
 * dropped first so dense road geometry doesn't produce kinks.
 */
export function roundCorners(path: LngLat[], iterations = 3, minStep = 0.00003): LngLat[] {
  let pts: LngLat[] = [];
  for (const p of path) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) pts.push(p);
  }
  if (pts.length < 3) return path.slice();
  for (let it = 0; it < iterations; it++) {
    const out: LngLat[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * Position at fraction t with a heading averaged over a short window of
 * path distance (`windowDeg`, in path units), so turns ease instead of snapping.
 */
export function smoothPoseAlongPath(
  path: LngLat[],
  t: number,
  windowDeg = 0.00035,
): { point: LngLat; bearing: number } {
  const here = pointAlongPath(path, t);
  const total = pathLength(path);
  if (total <= 0) return here;
  const d = windowDeg / total;
  const back = pointAlongPath(path, Math.max(0, t - d)).point;
  const ahead = pointAlongPath(path, Math.min(1, t + d)).point;
  if (back[0] === ahead[0] && back[1] === ahead[1]) return here;
  return { point: here.point, bearing: bearingBetween(back, ahead) };
}
