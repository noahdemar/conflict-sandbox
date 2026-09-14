import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { useStore } from '../store';
import { getMissileModel, loadGlbModel } from '../models3d';
import { ParticleSystem, expandStrikes, weaponKind } from '../particles';
import { arrowPath, routeKey } from '../routing';
import { FACILITY_META, facilityIconSvg } from '../facilities';
import { STATUS_META, activeEffects, statusIconSvg } from '../statusEffects';
import { onElevationLoaded, viewshed } from '../elevation';
import { unitAmmo } from '../combat';
import { lightingFromSun, nightPolygon, sunElevation, utcInstant, windVector } from '../environment';
import { APP6_FILL, factionAffiliation, unitSymbolSvg } from '../natoSymbols';
import { TAN_BLUE_STYLE } from '../mapStyle';
import {
  circlePolygon,
  interpolateCamera,
  orbitPose,
  pathLength,
  smoothPoseAlongPath,
  partialPath,
  pointAlongPath,
  type LngLat,
} from '../geo';
import { shadowSvg, silhouetteFor, silhouetteScale, silhouetteSvg } from '../silhouettes';
import type { Arrow, Strike, Unit } from '../types';

/** Area-weighted centroid of a [lng, lat] ring. */
function polygonCentroid(pts: [number, number][]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a === 0 ? pts[0] : [cx / (3 * a), cy / (3 * a)];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex color. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Grid spacing (deg) that keeps roughly 6–15 lines across the view. */
const gridStep = (zoom: number) =>
  zoom >= 12 ? 0.01 : zoom >= 10 ? 0.05 : zoom >= 8 ? 0.1 : zoom >= 6 ? 0.5 : zoom >= 4 ? 2 : 10;

/** Graticule lines around a center, span ~= 40 steps each way. */
function buildGraticule(lng: number, lat: number, step: number): GeoJSON.FeatureCollection {
  const n = 40;
  const x0 = Math.floor(lng / step) * step;
  const y0 = Math.floor(lat / step) * step;
  const feats: GeoJSON.Feature[] = [];
  const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
  for (let i = -n; i <= n; i++) {
    const x = +(x0 + i * step).toFixed(4);
    const y = +(y0 + i * step).toFixed(4);
    const major = (v: number) => Math.abs(Math.round(v / (step * 5)) * step * 5 - v) < step / 10;
    feats.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[x, clampLat(y0 - n * step)], [x, clampLat(y0 + n * step)]] },
      properties: { major: major(x) },
    });
    if (Math.abs(y) <= 85)
      feats.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[x0 - n * step, y], [x0 + n * step, y]] },
        properties: { major: major(y) },
      });
  }
  return { type: 'FeatureCollection', features: feats };
}

/** White square with dark outline — settlement marker. */
function makeCitySquareImage(size = 28) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(5, 6, size - 9, size - 9);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 2.5;
  ctx.fillRect(3, 3, size - 9, size - 9);
  ctx.strokeRect(3, 3, size - 9, size - 9);
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

function makeArrowheadImage(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.06);
  ctx.lineTo(size * 0.92, size * 0.9);
  ctx.lineTo(size * 0.5, size * 0.66);
  ctx.lineTo(size * 0.08, size * 0.9);
  ctx.closePath();
  ctx.fill();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const unitMarkers = useRef(new Map<string, maplibregl.Marker>());
  const labelMarkers = useRef(new Map<string, maplibregl.Marker>());
  const reticleMarkers = useRef(new Map<string, maplibregl.Marker>());
  const tagMarkers = useRef(new Map<string, maplibregl.Marker>());
  const nightKey = useRef<number | null>(null);
  const hoverPt = useRef<LngLat | null>(null);
  const lastProjection = useRef<string>('mercator');
  const interactionLocked = useRef(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: TAN_BLUE_STYLE,
      center: [20, 42],
      zoom: 3.2,
      attributionControl: { compact: true },
      maxPitch: 80,
      // Cinematic tile behavior: keep everything cached, prefetch parents,
      // never re-request mid-recording
      maxTileCacheSize: 8192,
      maxTileCacheZoomLevels: 12,
      refreshExpiredTiles: false,
      fadeDuration: 200,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left');
    mapRef.current = map;

    const factionColor = (id: string) =>
      useStore.getState().scenario.factions.find((f) => f.id === id)?.color ??
      '#888888';

    /** Loiter orbit per airframe: [radius m, period s]. */
    const orbitFor = (u: Unit): [number, number] => {
      const name = useStore.getState().unitLibrary.find((e) => e.id === u.rosterId)?.name;
      switch (silhouetteFor(u, name)) {
        case 'heli':
          return [450, 12];
        case 'drone':
          return [1400, 24];
        case 'gunship':
          return [1800, 20];
        case 'bomber':
          return [3800, 28];
        case 'flyingwing':
          return [3000, 40];
        case 'satellite':
          return [60000, 600];
        default:
          return [2400, 14];
      }
    };

    /** Path length in meters (paths are lng/lat degrees). */
    const pathMeters = (path: LngLat[]) => {
      let m = 0;
      for (let i = 1; i < path.length; i++) {
        const cosLat = Math.cos((path[i][1] * Math.PI) / 180);
        m += Math.hypot((path[i][0] - path[i - 1][0]) * 111320 * cosLat, (path[i][1] - path[i - 1][1]) * 111320);
      }
      return m;
    };

    /**
     * Aircraft inertia along a route: enter slower, accelerate to cruise, then
     * bleed speed down to loiter-orbit speed so the handoff into the orbit is
     * seamless. Returns route progress 0..1 at time t.
     */
    const airProgress = (u: Unit, arrow: Arrow, path: LngLat[], t: number): number => {
      const D = arrow.duration;
      const e = t - arrow.appearAt;
      if (e <= 0) return 0;
      if (e >= D) return 1;
      const L = pathMeters(path);
      if (L <= 0) return clamp01(e / D);
      const [r, period] = orbitFor(u);
      // landing aircraft slow to a hover; others hand off to orbit speed
      const vOrbit = u.landAtEnd ? 0 : (2 * Math.PI * r) / period;
      const ta = Math.min(D * 0.3, 4); // accelerate
      const td = Math.min(D * 0.3, 4); // decelerate into orbit
      const cruiseT = Math.max(0, D - ta - td);
      // entry speed is a fraction of cruise; solve cruise speed so distance covers L
      const k = 0.55;
      const vc = Math.max(
        vOrbit * 0.6,
        (L - (td * vOrbit) / 2) / ((ta * (1 + k)) / 2 + cruiseT + td / 2),
      );
      const v0 = vc * k;
      let dist: number;
      if (e < ta) {
        dist = v0 * e + ((vc - v0) / (2 * ta)) * e * e;
      } else if (e < ta + cruiseT) {
        dist = (ta * (v0 + vc)) / 2 + vc * (e - ta);
      } else {
        const x = e - ta - cruiseT;
        dist = (ta * (v0 + vc)) / 2 + vc * cruiseT + vc * x + ((vOrbit - vc) / (2 * td)) * x * x;
      }
      return clamp01(dist / L);
    };

    /**
     * Timed waypoints: position interpolates between the two points bracketing
     * t; while stationary, keeps facing the direction of its last movement.
     */
    const timedPose = (pts: LngLat[], times: number[], t: number): { point: LngLat; bearing: number } => {
      const n = pts.length;
      let i = 0;
      while (i < n - 2 && t >= times[i + 1]) i++;
      const span = times[i + 1] - times[i];
      const f = span > 0 ? clamp01((t - times[i]) / span) : 1;
      const a = pts[i];
      const b = pts[Math.min(n - 1, i + 1)];
      const point: LngLat = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      let bearing = 0;
      for (let k = Math.min(n - 1, i + 1); k > 0; k--) {
        const p0 = pts[k - 1];
        const p1 = pts[k];
        if (p0[0] !== p1[0] || p0[1] !== p1[1]) {
          bearing = (Math.atan2((p1[0] - p0[0]) * Math.cos((p0[1] * Math.PI) / 180), p1[1] - p0[1]) * 180) / Math.PI;
          break;
        }
      }
      return { point, bearing };
    };

    /** Gap kept between vehicles queued on or halted at the end of a shared route. */
    const FORMATION_GAP_M = 45;

    /**
     * Vehicles sharing a route wait in line behind the start before departing
     * and halt in line behind the end on arrival, instead of stacking up.
     * Returns null while the unit is simply moving along the route.
     */
    const formationPose = (
      u: Unit,
      arrow: Arrow,
      path: LngLat[],
      t: number,
    ): { point: LngLat; bearing: number } | null => {
      const end = arrow.appearAt + arrow.duration;
      const waiting = t < arrow.appearAt;
      const arrived = t >= end;
      if (!waiting && !arrived) return null;
      const st = useStore.getState();
      const key = routeKey(arrow.points);
      let rank = 0;
      for (const v of st.scenario.units) {
        if (v.id === u.id || v.type === 'air' || v.factionId !== u.factionId || !v.arrowId) continue;
        const va = st.scenario.arrows.find((a) => a.id === v.arrowId);
        if (!va || routeKey(va.points) !== key) continue;
        const vEnd = va.appearAt + va.duration;
        if (waiting) {
          // everyone still waiting who leaves before me is ahead in the queue
          if (t < va.appearAt && (va.appearAt < arrow.appearAt || (va.appearAt === arrow.appearAt && v.id < u.id))) rank++;
        } else {
          // everyone who arrived (intact) before me is parked ahead
          const vDead = v.destroyedAt !== undefined && v.destroyedAt < vEnd;
          if (!vDead && t >= vEnd && (vEnd < end || (vEnd === end && v.id < u.id))) rank++;
        }
      }
      const gapDeg = (rank * FORMATION_GAP_M) / 111320;
      if (waiting) {
        const start = smoothPoseAlongPath(path, 0);
        const b = (start.bearing * Math.PI) / 180;
        const cosLat = Math.cos((start.point[1] * Math.PI) / 180);
        return {
          point: [start.point[0] - (Math.sin(b) * gapDeg) / cosLat, start.point[1] - Math.cos(b) * gapDeg],
          bearing: start.bearing,
        };
      }
      const len = pathLength(path);
      return smoothPoseAlongPath(path, len > 0 ? Math.max(0, 1 - gapDeg / len) : 1);
    };

    const unitPose = (u: Unit, at?: number): { point: LngLat; bearing: number } => {
      const st = useStore.getState();
      const now = at ?? st.time;
      // wrecks stop where they were destroyed
      const t = u.destroyedAt !== undefined ? Math.min(now, u.destroyedAt) : now;
      const air = u.type === 'air';
      if (u.arrowId) {
        const arrow = st.scenario.arrows.find((a) => a.id === u.arrowId);
        if (arrow) {
          const path = arrowPath(arrow);
          const end = arrow.appearAt + arrow.duration;
          if (air && t > end && u.landAtEnd) {
            return smoothPoseAlongPath(path, 1);
          }
          if (air && t > end) {
            // aircraft never park: loiter over the end of their route
            const arrive = pointAlongPath(path, 1);
            const [r, period] = orbitFor(u);
            return orbitPose(arrive.point, arrive.bearing, t - end, r, period);
          }
          if (arrow.times && arrow.times.length === arrow.points.length) {
            return timedPose(arrow.points, arrow.times, t);
          }
          if (!air) {
            const spaced = formationPose(u, arrow, path, t);
            if (spaced) return spaced;
          }
          return smoothPoseAlongPath(
            path,
            air ? airProgress(u, arrow, path, t) : clamp01((t - arrow.appearAt) / arrow.duration),
          );
        }
      }
      if (air) {
        const [r, period] = orbitFor(u);
        return orbitPose([u.lng, u.lat], u.heading ?? 0, t - u.appearAt, r, period);
      }
      return { point: [u.lng, u.lat], bearing: u.heading ?? 0 };
    };

    /** Mercator coords grounded on terrain elevation (+ optional extra meters). */
    const merc = (lng: number, lat: number, altM = 0) => {
      let elev = 0;
      try {
        elev = map.queryTerrainElevation({ lng, lat }) ?? 0;
      } catch {
        /* terrain off */
      }
      return maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, elev + altM);
    };

    /** Loaded GLB template for a unit, or null (unit stays a 2D marker). */
    const modelFor = (u: Unit): { obj: THREE.Group; sig: string } | null => {
      const entry = u.rosterId
        ? useStore.getState().unitLibrary.find((e) => e.id === u.rosterId)
        : undefined;
      if (!entry?.modelUrl) return null;
      const tpl = loadGlbModel(entry.modelUrl, entry.modelYaw ?? 0, () =>
        map.triggerRepaint(),
      );
      return tpl ? { obj: tpl, sig: `glb:${tpl.uuid}` } : null;
    };

    /** Strikes with unit targets moved onto that unit's position at impact time. */
    const resolvedStrikes = (): Strike[] => {
      const st = useStore.getState();
      return st.scenario.strikes.map((x) => {
        if (!x.targetUnitId) return x;
        const u = st.scenario.units.find((v) => v.id === x.targetUnitId);
        if (!u) return x;
        const [lng, lat] = unitPose(u, x.appearAt).point;
        return { ...x, lng, lat };
      });
    };

    /** Interceptor that kills strike x mid-flight, if any. */
    const interceptorFor = (
      st: { scenario: { strikes: Strike[] } },
      x: Strike,
    ): Strike | undefined =>
      st.scenario.strikes.find(
        (s2) =>
          s2.targetStrikeId === x.id &&
          s2.appearAt > (x.launchAt ?? x.appearAt - 3) &&
          s2.appearAt < x.appearAt,
      );

    const syncGeo = () => {
      const st = useStore.getState();
      const terrSrc = map.getSource('territories') as maplibregl.GeoJSONSource;
      const arrSrc = map.getSource('arrows') as maplibregl.GeoJSONSource;
      const headSrc = map.getSource('arrowheads') as maplibregl.GeoJSONSource;
      const rangeSrc = map.getSource('ranges') as maplibregl.GeoJSONSource;
      const strikeSrc = map.getSource('strikes') as maplibregl.GeoJSONSource;
      if (!terrSrc || !arrSrc || !headSrc || !rangeSrc || !strikeSrc) return;
      const sel = st.selection;

      // day/night terminator with twilight bands (visible at world scale)
      {
        const nightSrc = map.getSource('night') as maplibregl.GeoJSONSource | undefined;
        const env = st.scenario.environment;
        if (nightSrc) {
          if (!env) {
            nightSrc.setData(EMPTY_FC);
          } else {
            const ms = utcInstant(env, st.time, st.duration);
            // recompute only when the sun has moved noticeably (~1 minute)
            const key = Math.round(ms / 60000);
            if (key !== nightKey.current) {
              nightKey.current = key;
              nightSrc.setData({
                type: 'FeatureCollection',
                features: [0, -6, -12, -18].map((elev) => ({
                  type: 'Feature' as const,
                  geometry: { type: 'Polygon' as const, coordinates: [nightPolygon(ms, elev)] },
                  properties: { elev },
                })),
              });
            }
          }
        }
      }

      // line of sight (terrain-aware) and air-defense envelopes
      {
        const losSrc = map.getSource('fx-los') as maplibregl.GeoJSONSource | undefined;
        const adSrc = map.getSource('fx-ad') as maplibregl.GeoJSONSource | undefined;
        const losFeats: GeoJSON.Feature[] = [];
        const adFeats: GeoJSON.Feature[] = [];
        const alive = (u: Unit) =>
          st.time >= u.appearAt && !(u.destroyedAt !== undefined && st.time >= u.destroyedAt);
        for (const u of st.scenario.units) {
          if (!alive(u)) continue;
          const center = unitPose(u).point;
          const color = factionColor(u.factionId);
          if (u.sensorKm && u.type !== 'air') {
            const key = `${center[0].toFixed(4)},${center[1].toFixed(4)},${u.sensorKm}`;
            let ring: [number, number][] | null | undefined = losCache.get(key);
            if (ring === undefined) {
              ring = viewshed(center, u.sensorKm);
              if (ring) losCache.set(key, ring);
            }
            const full = circlePolygon(center, u.sensorKm);
            if (ring) {
              // shadow = sensor circle minus what the unit can actually see
              losFeats.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [full, [...ring].reverse()] },
                properties: { color, part: 'shadow' },
              });
              losFeats.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: { color, part: 'seen' },
              });
            } else {
              losFeats.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [full] },
                properties: { color, part: 'pending' },
              });
            }
          }
          if (u.airDefenseKm) {
            const aff = factionAffiliation(st.scenario.factions.find((f) => f.id === u.factionId), st.scenario.factions);
            const threats = st.scenario.units.filter((v) => {
              if (v.type !== 'air' || !alive(v) || v.factionId === u.factionId) return false;
              const vAff = factionAffiliation(st.scenario.factions.find((f) => f.id === v.factionId), st.scenario.factions);
              if (vAff === aff || vAff === 'neutral') return false;
              const p = unitPose(v).point;
              const km = Math.hypot((p[0] - center[0]) * 111.32 * Math.cos((center[1] * Math.PI) / 180), (p[1] - center[1]) * 111.32);
              return km <= u.airDefenseKm!;
            });
            const engaged = threats.length > 0;
            const pulse = engaged ? 0.5 + 0.5 * Math.sin(st.time * 10) : 0;
            adFeats.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [circlePolygon(center, u.airDefenseKm)] },
              properties: { color: engaged ? '#e03131' : color, engaged, pulse },
            });
            for (const v of threats) {
              adFeats.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [center, unitPose(v).point] },
                properties: { color: '#e03131', engaged: true, pulse },
              });
            }
          }
        }
        losSrc?.setData({ type: 'FeatureCollection', features: losFeats });
        adSrc?.setData({ type: 'FeatureCollection', features: adFeats });
      }

      // datalinks (glowing link + moving packets) and jamming fields
      {
        const linkSrc = map.getSource('fx-links') as maplibregl.GeoJSONSource | undefined;
        const jamSrc = map.getSource('fx-jam') as maplibregl.GeoJSONSource | undefined;
        const linkFeats: GeoJSON.Feature[] = [];
        const jamFeats: GeoJSON.Feature[] = [];
        for (const { fx, env, age } of activeEffects(st.scenario, st.time)) {
          const u = st.scenario.units.find((v) => v.id === fx.unitId);
          if (!u || st.time < u.appearAt) continue;
          if (u.destroyedAt !== undefined && st.time >= u.destroyedAt) continue;
          const a = unitPose(u).point;
          if (fx.kind === 'datalink' && fx.targetUnitId) {
            const v = st.scenario.units.find((w) => w.id === fx.targetUnitId);
            if (!v) continue;
            const b = unitPose(v).point;
            // link grows out from the source over the first 0.6s
            const grow = Math.min(1, age / 0.6);
            const end: LngLat = [a[0] + (b[0] - a[0]) * grow, a[1] + (b[1] - a[1]) * grow];
            linkFeats.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [a, end] },
              properties: { env, color: STATUS_META.datalink.color },
            });
            if (grow >= 1) {
              for (let i = 0; i < 6; i++) {
                const f = (st.time * 0.55 + i / 6) % 1;
                const dir = i % 2 === 0; // packets flow both ways
                const k = dir ? f : 1 - f;
                linkFeats.push({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] },
                  properties: { env: env * Math.sin(Math.PI * f), color: dir ? '#7fe3ff' : '#ffffff' },
                });
              }
            }
          }
          if (fx.kind === 'jamming') {
            const r = (fx.radiusM ?? 2500) / 1000;
            const base = circlePolygon(a, r);
            // noisy, crawling edge so the field reads as interference
            const noisy = base.map(([x, y], i) => {
              const w = 1 + 0.045 * Math.sin(i * 1.7 + st.time * 6) + 0.03 * Math.sin(i * 5.3 - st.time * 9);
              return [a[0] + (x - a[0]) * w, a[1] + (y - a[1]) * w] as LngLat;
            });
            noisy[noisy.length - 1] = noisy[0];
            jamFeats.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [noisy] },
              properties: { env, pulse: 0.5 + 0.5 * Math.sin(st.time * 5), ring: 0 },
            });
            // expanding interference rings
            for (let k = 0; k < 3; k++) {
              const ph = (st.time * 0.45 + k / 3) % 1;
              jamFeats.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [circlePolygon(a, r * ph)] },
                properties: { env: env * (1 - ph), pulse: 0, ring: 1 },
              });
            }
          }
        }
        linkSrc?.setData({ type: 'FeatureCollection', features: linkFeats });
        jamSrc?.setData({ type: 'FeatureCollection', features: jamFeats });
      }

      rangeSrc.setData({
        type: 'FeatureCollection',
        features: st.scenario.units.flatMap((u) => {
          if (!u.rangeKm || st.time < u.appearAt) return [];
          const ring = circlePolygon(unitPose(u).point, u.rangeKm);
          return [
            {
              type: 'Feature' as const,
              geometry: { type: 'Polygon' as const, coordinates: [ring] },
              properties: { color: factionColor(u.factionId) },
            },
          ];
        }),
      });

      strikeSrc.setData({
        type: 'FeatureCollection',
        features: expandStrikes(resolvedStrikes()).flatMap((x) => {
          const feats: GeoJSON.Feature[] = [];
          // scorch only for ground detonations (not interceptors, not kills)
          if (
            st.time >= x.appearAt &&
            !x.targetStrikeId &&
            !interceptorFor(st, x)
          ) {
            feats.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [x.lng, x.lat],
              },
              properties: {
                oid: x.id,
                kind: 'strike',
                sz: x.size,
                selected: sel?.kind === 'strike' && sel.id === x.id,
              },
            });
          }
          // trajectory preview for launched strikes (visible when selected)
          const from = x.fromUnitId
            ? st.scenario.units.find((u) => u.id === x.fromUnitId)
            : undefined;
          if (from && sel?.kind === 'strike' && sel.id === x.id) {
            let dst: LngLat = [x.lng, x.lat];
            if (x.targetStrikeId) {
              const tgt = st.scenario.strikes.find(
                (s2) => s2.id === x.targetStrikeId,
              );
              if (tgt) dst = [tgt.lng, tgt.lat];
            }
            feats.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [unitPose(from).point, dst],
              },
              properties: { oid: x.id, kind: 'strike' },
            });
          }
          return feats;
        }),
      });

      (map.getSource('territory-labels') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: st.scenario.territories.flatMap((t) => {
          const prog = clamp01((st.time - t.appearAt) / t.duration);
          if (!t.label || prog <= 0 || t.points.length < 3) return [];
          const pos = t.labelAt ?? polygonCentroid(t.points);
          return [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: pos },
              properties: {
                label: t.label.toUpperCase(),
                color: shade(factionColor(t.factionId), -0.35),
                alpha: prog,
                rotate: t.labelRotate ?? -8,
              },
            },
          ];
        }),
      });
      terrSrc.setData({
        type: 'FeatureCollection',
        features: st.scenario.territories.flatMap((t) => {
          const prog = clamp01((st.time - t.appearAt) / t.duration);
          if (prog <= 0 || t.points.length < 3) return [];
          const ring = [...t.points, t.points[0]];
          return [
            {
              type: 'Feature' as const,
              geometry: { type: 'Polygon' as const, coordinates: [ring] },
              properties: {
                oid: t.id,
                kind: 'territory',
                color: factionColor(t.factionId),
                alpha: prog,
                selected: sel?.kind === 'territory' && sel.id === t.id,
              },
            },
          ];
        }),
      });

      const lineFeats: GeoJSON.Feature[] = [];
      const headFeats: GeoJSON.Feature[] = [];
      for (const a of st.scenario.arrows) {
        const path = arrowPath(a);
        if (a.hideLine) continue;
        const flyer = st.scenario.units.find((u) => u.arrowId === a.id && u.type === 'air');
        const prog = flyer
          ? airProgress(flyer, a, path, st.time)
          : clamp01((st.time - a.appearAt) / a.duration);
        if (prog <= 0 || a.points.length < 2) continue;
        const drawn = partialPath(path, Math.max(prog, 0.02));
        const color = factionColor(a.factionId);
        const selected = sel?.kind === 'arrow' && sel.id === a.id;
        lineFeats.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: drawn },
          properties: { oid: a.id, kind: 'arrow', color, selected },
        });
        const head = pointAlongPath(path, prog);
        headFeats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: head.point },
          properties: { oid: a.id, kind: 'arrow', color, bearing: head.bearing, selected },
        });
      }
      arrSrc.setData({ type: 'FeatureCollection', features: lineFeats });
      headSrc.setData({ type: 'FeatureCollection', features: headFeats });
    };

    const syncDraft = () => {
      const st = useStore.getState();
      const src = map.getSource('draft') as maplibregl.GeoJSONSource;
      if (!src) return;
      const pts = st.draft;
      const feats: GeoJSON.Feature[] = [];
      const color = factionColor(st.activeFactionId);
      const linePts = hoverPt.current && pts.length ? [...pts, hoverPt.current] : pts;
      if (linePts.length >= 2) {
        feats.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: linePts },
          properties: { color },
        });
      }
      if (st.tool === 'territory' && linePts.length >= 3) {
        feats.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...linePts, linePts[0]]] },
          properties: { color, draft: true },
        });
      }
      pts.forEach((p) =>
        feats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p },
          properties: { color },
        }),
      );
      src.setData({ type: 'FeatureCollection', features: feats });
    };

    /** Clicking a stacked group zooms in to split it; a single unit gets selected. */
    const onUnitClick = (id: string) => {
      const tag = tagMarkers.current.get(id);
      const n = Number(tag?.getElement().dataset.count ?? '1');
      if (n > 1 && tag) {
        map.easeTo({ center: tag.getLngLat(), zoom: Math.min(map.getZoom() + 1.6, 17), duration: 600 });
        return;
      }
      useStore.getState().setSelection({ kind: 'unit', id });
    };

    /** Icon size multiplier: full size at zoom 13, half size by zoom 9.5. */
    const zoomScale = () => 0.5 + 0.5 * clamp01((map.getZoom() - 9.5) / 3.5);

    type Box = { x0: number; y0: number; x1: number; y1: number };
    const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const pad = (r: DOMRect, p: number): Box => ({ x0: r.left - p, y0: r.top - p, x1: r.right + p, y1: r.bottom + p });
    const shifted = (b: Box, dx: number, dy: number): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });

    /**
     * Screen-space declutter, run after markers move:
     * 1) stack same-side ground units that sit on top of each other into one
     *    icon with a count; 2) place text (badges > facilities/flags > unit
     *    names > plain labels) in the first free slot, hiding what can't fit.
     */
    const layoutOverlays = () => {
      const st = useStore.getState();
      const sel = st.selection;
      const zs = zoomScale();
      const container = map.getContainer();
      container.style.setProperty('--zs', zs.toFixed(3));
      container.classList.toggle('tags-min', map.getZoom() < 10.5);

      // ---- 1. stacking ----
      type Entry = { id: string; el: HTMLElement; tag: HTMLElement; x: number; y: number; group: string; prio: number };
      const entries: Entry[] = [];
      for (const u of st.scenario.units) {
        const mk = unitMarkers.current.get(u.id);
        const tag = tagMarkers.current.get(u.id);
        if (!mk || !tag || mk.getElement().style.display === 'none') continue;
        const pt = map.project(tag.getLngLat());
        const dead = u.destroyedAt !== undefined && st.time >= u.destroyedAt;
        const selected = sel?.kind === 'unit' && sel.id === u.id;
        const hasFx = (st.scenario.effects ?? []).some(
          (fx) => fx.unitId === u.id && st.time >= fx.start && st.time <= fx.start + fx.duration,
        );
        entries.push({
          id: u.id,
          el: mk.getElement(),
          tag: tag.getElement(),
          x: pt.x,
          y: pt.y,
          // air, wrecks and each side stack separately
          group: `${u.factionId}|${u.type === 'air' ? 'air' : 'gnd'}|${dead ? 'dead' : 'live'}`,
          prio: (selected ? 0 : 10) + (hasFx ? 0 : 1) + (dead ? 2 : 0),
        });
      }
      entries.sort((a, b) => a.prio - b.prio);
      const radius = 26 * zs + 4;
      const leaders: (Entry & { n: number })[] = [];
      const leaderOf = new Map<string, Entry & { n: number }>();
      for (const e of entries) {
        const hit = e.prio >= 10
          ? leaders.find((l) => l.group === e.group && Math.hypot(l.x - e.x, l.y - e.y) < radius)
          : undefined;
        if (hit) {
          hit.n++;
          leaderOf.set(e.id, hit);
        } else {
          const l = { ...e, n: 1 };
          leaders.push(l);
          leaderOf.set(e.id, l);
        }
      }
      for (const e of entries) {
        const l = leaderOf.get(e.id)!;
        const stacked = l.id !== e.id;
        e.el.classList.toggle('stacked', stacked);
        e.tag.classList.toggle('stacked', stacked);
        const count = e.tag.querySelector<HTMLElement>('.mk-count');
        const n = stacked ? 1 : l.n;
        e.tag.dataset.count = String(n);
        if (count) {
          count.hidden = n <= 1;
          count.textContent = `×${n}`;
        }
      }

      // ---- 2. text placement ----
      const placed: Box[] = [];
      // unit icons are obstacles text must avoid
      for (const l of leaders) {
        const r = l.el.querySelector('.mk-box')?.getBoundingClientRect();
        if (r && r.width) placed.push(pad(r, -r.width * 0.18));
      }
      type Item = { el: HTMLElement; prio: number; hideable: boolean; cands: [number, number][] };
      const items: Item[] = [];
      for (const l of leaders) {
        const status = l.tag.querySelector<HTMLElement>('.mk-status');
        if (status && status.childElementCount) {
          items.push({ el: status, prio: 0, hideable: false, cands: [[0, 0]] });
        }
        const name = l.tag.querySelector<HTMLElement>('.mk-name');
        if (name && !name.hidden) {
          const gap = l.tag.querySelector<HTMLElement>('.mk-gap')?.offsetHeight ?? 40;
          const h = name.offsetHeight;
          const w = name.offsetWidth;
          const side = gap / 2 + w / 2 + 6;
          items.push({
            el: name,
            prio: 2,
            hideable: true,
            cands: [[0, 0], [side, -(gap / 2 + h / 2 + 2)], [-side, -(gap / 2 + h / 2 + 2)], [0, -(gap + h + 4)], [0, 14]],
          });
        }
      }
      for (const [, mk] of labelMarkers.current) {
        const el = mk.getElement();
        if (el.style.display === 'none') continue;
        const rich = el.classList.contains('facility-label') || el.classList.contains('flag-label');
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        items.push({
          el,
          prio: rich ? 1 : 3,
          hideable: !rich,
          cands: rich ? [[0, 0]] : [[0, 0], [0, -h], [w * 0.6, 0], [-w * 0.6, 0], [0, h]],
        });
      }
      items.sort((a, b) => a.prio - b.prio);
      for (const it of items) {
        // subtract the offset as currently rendered (mid-transition included)
        const [cx, cy] = (getComputedStyle(it.el).translate || '0px 0px')
          .split(' ')
          .map((v) => parseFloat(v) || 0);
        const base = shifted(pad(it.el.getBoundingClientRect(), 2), -cx, -(cy ?? 0));
        const prevX = Number(it.el.dataset.ox ?? 0);
        const prevY = Number(it.el.dataset.oy ?? 0);
        // hysteresis: keep the current slot while it's still free
        const ordered: [number, number][] = [
          ...it.cands.filter(([dx, dy]) => dx === prevX && dy === prevY),
          ...it.cands.filter(([dx, dy]) => dx !== prevX || dy !== prevY),
        ];
        let chosen: [number, number] | null = null;
        for (const [dx, dy] of ordered) {
          const b = shifted(base, dx, dy);
          if (!placed.some((p) => overlaps(p, b))) {
            chosen = [dx, dy];
            break;
          }
        }
        if (!chosen && !it.hideable) chosen = it.cands[0];
        if (chosen) {
          placed.push(shifted(base, chosen[0], chosen[1]));
          it.el.dataset.ox = String(chosen[0]);
          it.el.dataset.oy = String(chosen[1]);
          it.el.style.translate = `${chosen[0]}px ${chosen[1]}px`;
          it.el.classList.remove('declutter-hidden');
        } else {
          it.el.classList.add('declutter-hidden');
        }
      }
    };

    let layoutQueued = false;
    const scheduleLayout = () => {
      if (layoutQueued) return;
      layoutQueued = true;
      requestAnimationFrame(() => {
        layoutQueued = false;
        layoutOverlays();
      });
    };

    const syncMarkers = () => {
      const st = useStore.getState();
      const sel = st.selection;
      const seenU = new Set<string>();
      for (const u of st.scenario.units) {
        seenU.add(u.id);
        let mk = unitMarkers.current.get(u.id);
        if (!mk) {
          const el = document.createElement('div');
          el.className = 'mk';
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onUnitClick(u.id);
          });
          // body lies flat on the ground and turns with the map, so it stays
          // locked to its position under any camera pitch/bearing
          mk = new maplibregl.Marker({
            element: el,
            draggable: false,
            pitchAlignment: 'map',
            rotationAlignment: 'map',
          })
            .setLngLat([u.lng, u.lat])
            .addTo(map);
          mk.on('drag', () => tagMarkers.current.get(u.id)?.setLngLat(mk!.getLngLat()));
          mk.on('dragend', () => {
            const ll = mk!.getLngLat();
            const s = useStore.getState();
            s.updateUnit(u.id, { lat: ll.lat, lng: ll.lng, arrowId: undefined });
          });
          unitMarkers.current.set(u.id, mk);
          // upright name tag + status badges anchored at the same point
          const tagEl = document.createElement('div');
          tagEl.className = 'mk-tag';
          tagEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onUnitClick(u.id);
          });
          tagMarkers.current.set(
            u.id,
            new maplibregl.Marker({ element: tagEl }).setLngLat([u.lng, u.lat]).addTo(map),
          );
        }
        const el = mk.getElement();
        const tagMk = tagMarkers.current.get(u.id)!;
        const tagEl = tagMk.getElement();
        const color = factionColor(u.factionId);
        const img = u.rosterId
          ? st.unitLibrary.find((e) => e.id === u.rosterId)?.imageUrl
          : undefined;
        const rosterName = u.rosterId
          ? st.unitLibrary.find((e) => e.id === u.rosterId)?.name
          : undefined;
        const key = silhouetteFor(u, rosterName);
        const destroyed = u.destroyedAt !== undefined && st.time >= u.destroyedAt;
        const air = u.type === 'air';
        const symbols = st.iconStyle === 'symbols';
        const sig = `${key}|${color}|${destroyed}|${u.name}|${img ?? ''}|${st.iconStyle}`;
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          const sz = `${Math.round((air ? 70 : 58) * silhouetteScale(key))}px`;
          for (const e of [el, tagEl]) {
            e.style.setProperty('--fc', color);
            e.style.setProperty('--sz', sz);
          }
          if (symbols) {
            // standard affiliation frame + type symbol, upright on screen
            const aff = factionAffiliation(
              st.scenario.factions.find((f) => f.id === u.factionId),
              st.scenario.factions,
            );
            const fill = destroyed ? '#b9b9b4' : APP6_FILL[aff];
            el.innerHTML = `<div class="mk-box stk sym-box"><div class="fx-rings"></div><div class="stk-rot">${unitSymbolSvg(u.type, aff, fill)}${
              destroyed ? '<svg class="sym-kill" viewBox="0 0 48 40"><path d="M6 4 L42 36 M42 4 L6 36"/></svg>' : ''
            }</div></div>`;
          } else {
            el.innerHTML = `<div class="mk-box stk${air ? ' air' : ''}"><div class="fx-rings"></div>${
              air ? `<div class="stk-shadow">${shadowSvg(key)}</div>` : ''
            }<div class="stk-rot">${silhouetteSvg(key, color, destroyed)}</div></div>`;
          }
          mk.setPitchAlignment(symbols ? 'viewport' : 'map');
          mk.setRotationAlignment(symbols ? 'viewport' : 'map');
          tagEl.innerHTML = `${
            img ? `<img class="mk-img" src="${img}" alt="" />` : ''
          }<div class="mk-status"></div><div class="mk-gap"><span class="mk-count" hidden></span></div><div class="mk-name"><span class="mk-label"></span><span class="mk-bars"><i class="ammo" hidden><b></b></i></span></div>`;
          tagEl.querySelector<HTMLElement>('.mk-label')!.textContent = u.name || '';
        }
        const pose = unitPose(u);
        mk.setRotation(symbols ? 0 : pose.bearing);
        tagMk.setLngLat(pose.point);
        el.classList.toggle('destroyed', destroyed);
        tagEl.classList.toggle('destroyed', destroyed);
        // side is exposed for styling (e.g. hostiles glow red in thermal)
        {
          const aff = factionAffiliation(st.scenario.factions.find((f) => f.id === u.factionId), st.scenario.factions);
          for (const k of ['friend', 'hostile', 'neutral', 'unknown']) el.classList.toggle(`aff-${k}`, aff === k);
        }
        // status effects: badges, radio waves, panic shake, damage/ammo states
        const fxNow = destroyed
          ? []
          : activeEffects(st.scenario, st.time).filter((e) => e.fx.unitId === u.id);
        const kinds = new Set(fxNow.map((e) => e.fx.kind));
        const fxSig = fxNow.map((e) => `${e.fx.id}:${e.fx.label ?? ''}`).join('|');
        const statusEl = tagEl.querySelector<HTMLElement>('.mk-status');
        if (statusEl && statusEl.dataset.sig !== fxSig) {
          statusEl.dataset.sig = fxSig;
          statusEl.innerHTML = fxNow
            .map(
              (e) =>
                `<div class="fx-badge fx-${e.fx.kind}" data-fx="${e.fx.id}" style="--fxc:${STATUS_META[e.fx.kind].color}">${statusIconSvg(e.fx.kind)}<span></span></div>`,
            )
            .join('');
          fxNow.forEach((e) => {
            const span = statusEl.querySelector(`[data-fx="${e.fx.id}"] span`);
            if (span) span.textContent = e.fx.label ?? STATUS_META[e.fx.kind].badge;
          });
          const rings = el.querySelector<HTMLElement>('.fx-rings');
          if (rings) {
            rings.innerHTML = kinds.has('radio')
              ? '<i></i><i></i><i></i>'
              : '';
            rings.style.setProperty('--fxc', STATUS_META.radio.color);
          }
        }
        fxNow.forEach((e) => {
          const b = statusEl?.querySelector<HTMLElement>(`[data-fx="${e.fx.id}"]`);
          if (b) b.style.opacity = e.env.toFixed(2);
        });
        el.classList.toggle('fx-panic', kinds.has('panic'));
        el.classList.toggle('fx-wounded', kinds.has('wounded'));
        el.classList.toggle('fx-noammo', kinds.has('noammo'));
        // ammunition bar
        {
          const ammo = unitAmmo(st.scenario, u, st.time);
          const ammoWrap = tagEl.querySelector<HTMLElement>('.mk-bars .ammo');
          if (ammoWrap) {
            // individual people don't get an ammo gauge; it reads as a glitch under their name
            ammoWrap.hidden = ammo === null || u.type === 'infantry';
            const b = ammoWrap.querySelector<HTMLElement>('b');
            if (b && ammo !== null) b.style.width = `${ammo.toFixed(0)}%`;
          }
        }
        mk.setLngLat(unitPose(u).point);
        el.style.display =
          st.time >= u.appearAt && !(u.leavesAt !== undefined && st.time >= u.leavesAt) ? '' : 'none';
        tagEl.style.display = el.style.display;
        tagEl.classList.toggle('selected', sel?.kind === 'unit' && sel.id === u.id);
        el.classList.toggle('selected', sel?.kind === 'unit' && sel.id === u.id);
        el.classList.toggle(
          'mode3d',
          st.use3d && !st.globeMode && !!modelFor(u),
        );
        mk.setDraggable(st.tool === 'select');
      }
      for (const [id, mk] of unitMarkers.current) {
        if (!seenU.has(id)) {
          mk.remove();
          unitMarkers.current.delete(id);
          tagMarkers.current.get(id)?.remove();
          tagMarkers.current.delete(id);
        }
      }

      // target reticles over strike aim points shortly before and during impact
      const seenR = new Set<string>();
      for (const x of resolvedStrikes()) {
        if (x.targetStrikeId || weaponKind(x.name) === 'gun') continue; // no target marker for gunfire
        const from = (x.launchAt ?? x.appearAt - 3) - 1.2;
        const to = x.appearAt + 1.4;
        const visible = st.time >= from && st.time <= to;
        if (!visible) continue;
        seenR.add(x.id);
        let mk = reticleMarkers.current.get(x.id);
        if (mk && mk.getElement().dataset.look !== st.look) {
          mk.remove();
          reticleMarkers.current.delete(x.id);
          mk = undefined;
        }
        if (!mk) {
          const el = document.createElement('div');
          el.className = 'reticle';
          el.dataset.look = st.look;
          el.innerHTML = st.look === 'briefing'
            ? `<svg viewBox="0 0 100 100" class="reticle-brief"><path d="M20 38 V20 H38 M62 20 H80 V38 M80 62 V80 H62 M38 80 H20 V62" fill="none" stroke="#b3261e" stroke-width="4"/><path d="M50 42 V58 M42 50 H58" stroke="#b3261e" stroke-width="3"/></svg>`
            : `<svg viewBox="0 0 100 100"><g fill="none" stroke-linecap="round"><circle cx="50" cy="50" r="30" stroke="#fff" stroke-width="15"/><path d="M50 4 V32 M50 68 V96 M4 50 H32 M68 50 H96" stroke="#fff" stroke-width="15"/><circle cx="50" cy="50" r="30" stroke="#e0302a" stroke-width="7"/><path d="M50 4 V32 M50 68 V96 M4 50 H32 M68 50 H96" stroke="#e0302a" stroke-width="7"/></g></svg>`;
          mk = new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat([x.lng, x.lat]).addTo(map);
          reticleMarkers.current.set(x.id, mk);
        }
        mk.setLngLat([x.lng, x.lat]);
        const el = mk.getElement();
        el.style.setProperty('--rs', `calc(${Math.round(34 + x.size * 18)}px * var(--zs, 1))`);
        el.classList.toggle('hit', st.time >= x.appearAt);
      }
      for (const [id, mk] of reticleMarkers.current) {
        if (!seenR.has(id)) {
          mk.remove();
          reticleMarkers.current.delete(id);
        }
      }

      const seenL = new Set<string>();
      for (const l of st.scenario.labels) {
        seenL.add(l.id);
        let mk = labelMarkers.current.get(l.id);
        if (!mk) {
          const el = document.createElement('div');
          el.className = 'map-label';
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            useStore.getState().setSelection({ kind: 'label', id: l.id });
          });
          mk = new maplibregl.Marker({ element: el, draggable: false })
            .setLngLat([l.lng, l.lat])
            .addTo(map);
          mk.on('dragend', () => {
            const ll = mk!.getLngLat();
            useStore.getState().updateLabel(l.id, { lat: ll.lat, lng: ll.lng });
          });
          labelMarkers.current.set(l.id, mk);
        }
        const el = mk.getElement();
        const sig = `${l.text}|${l.size}|${l.color}|${l.flag ?? ''}|${l.facility ?? ''}`;
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          el.classList.toggle('flag-label', !!l.flag);
          el.classList.toggle('facility-label', !!l.facility && !l.flag);
          if (l.facility && !l.flag) {
            el.innerHTML = `<div class="facility-sticker" style="--fac:${FACILITY_META[l.facility].color}">${facilityIconSvg(l.facility)}</div>${
              l.text ? '<span class="facility-caption"></span>' : ''
            }`;
            const cap = el.querySelector('.facility-caption');
            if (cap) cap.textContent = l.text;
            el.style.fontSize = `${l.size}px`;
            el.style.color = '';
          } else if (l.flag) {
            const code = l.flag.toLowerCase().replace(/[^a-z-]/g, '');
            el.innerHTML = `<img class="flag-sticker" src="https://flagcdn.com/w160/${code}.png" alt="" />${
              l.text ? `<span class="flag-caption"></span>` : ''
            }`;
            const cap = el.querySelector('.flag-caption');
            if (cap) cap.textContent = l.text;
            el.style.fontSize = `${l.size}px`;
            el.style.color = '';
          } else {
            el.textContent = l.text;
            el.style.fontSize = `${l.size}px`;
            el.style.color = l.color;
          }
        }
        mk.setLngLat([l.lng, l.lat]);
        el.style.display = st.time >= l.appearAt ? '' : 'none';
        el.classList.toggle('selected', sel?.kind === 'label' && sel.id === l.id);
        mk.setDraggable(st.tool === 'select');
      }
      for (const [id, mk] of labelMarkers.current) {
        if (!seenL.has(id)) {
          mk.remove();
          labelMarkers.current.delete(id);
        }
      }
      scheduleLayout();
    };

    const losCache = new Map<string, [number, number][]>();

    const syncAll = () => {
      if (!map.getSource('arrows')) return;
      const st = useStore.getState();
      syncGeo();
      syncDraft();
      syncMarkers();
      const draw = st.tool === 'arrow' || st.tool === 'territory';
      if (draw && map.doubleClickZoom.isEnabled()) map.doubleClickZoom.disable();
      if (!draw && !map.doubleClickZoom.isEnabled()) map.doubleClickZoom.enable();
      map.getCanvas().style.cursor =
        st.tool === 'select' ? '' : st.tool === 'erase' ? 'cell' : 'crosshair';
      const proj = st.globeMode ? 'globe' : 'mercator';
      if (proj !== lastProjection.current) {
        lastProjection.current = proj;
        map.setProjection({ type: proj } as never);
        try {
          map.setTerrain(null); // flat ground keeps markers and 3D effects registered
        } catch {
          /* terrain unsupported */
        }
      }
      // Presentation mode: camera follows keyframes, map interaction locked
      const lock = st.playing || st.cameraLock;
      if (lock !== interactionLocked.current) {
        interactionLocked.current = lock;
        const handlers = [
          map.dragPan,
          map.scrollZoom,
          map.boxZoom,
          map.dragRotate,
          map.keyboard,
          map.touchZoomRotate,
        ];
        handlers.forEach((h) => (lock ? h.disable() : h.enable()));
      }
      if (lock && st.scenario.keyframes.length > 0) {
        const pose = interpolateCamera(st.scenario.keyframes, st.time, (id) => {
          const u = st.scenario.units.find((x) => x.id === id);
          return u ? unitPose(u) : null;
        });
        // camera shake from recent heavy detonations near the view center
        let shake = 0;
        if (st.playing) {
          for (const x of st.scenario.strikes) {
            const age = st.time - x.appearAt;
            if (age < 0 || age > 0.7) continue;
            const kind = weaponKind(x.name);
            if (kind === 'gun') continue;
            const dKm = Math.hypot(
              (x.lng - pose.lng) * 111 * Math.cos((pose.lat * Math.PI) / 180),
              (x.lat - pose.lat) * 111,
            );
            const near = Math.max(0, 1 - dKm / 6);
            shake += x.size * (kind === 'bomb' ? 1.6 : 1) * near * (1 - age / 0.7) ** 2;
          }
          shake = Math.min(shake, 2.2);
        }
        const jitter = (k: number) => Math.sin(st.time * (47 + k * 13) + k) * shake;
        const mPerDeg = 111320;
        map.jumpTo({
          center: [
            pose.lng + (jitter(1) * 9) / (mPerDeg * Math.cos((pose.lat * Math.PI) / 180)) * Math.pow(2, 13 - pose.zoom),
            pose.lat + (jitter(2) * 9) / mPerDeg * Math.pow(2, 13 - pose.zoom),
          ],
          zoom: pose.zoom,
          pitch: pose.pitch + jitter(3) * 0.35,
          bearing: pose.bearing + jitter(4) * 0.25,
        });
      }
      if (map.getLayer('territory-watermark')) {
        const vis = st.look === 'briefing' ? 'none' : 'visible';
        if (map.getLayoutProperty('territory-watermark', 'visibility') !== vis) {
          map.setLayoutProperty('territory-watermark', 'visibility', vis);
        }
      }
      if (st.use3d) map.triggerRepaint();
    };

    map.on('load', () => {
      map.addImage('arrowhead', makeArrowheadImage(), { sdf: true });
      map.addImage('city-square', makeCitySquareImage(), { pixelRatio: 2 });

      // Atmosphere: horizon haze for pitched cinematic shots
      const m = map as unknown as {
        setFog?: (f: Record<string, unknown>) => void;
        setSky?: (s: Record<string, unknown>) => void;
      };
      try {
        m.setFog?.({
          range: [1.5, 12],
          color: '#d8cdb2',
          'high-color': '#9fb6c8',
          'space-color': '#0b1420',
          'horizon-blend': 0.12,
        });
        m.setSky?.({
          'sky-color': '#8fb0c8',
          'horizon-color': '#e0d4b4',
          'fog-color': '#d8cdb2',
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.6,
          'fog-ground-blend': 0.4,
        });
      } catch {
        /* projection/sky not supported */
      }

      map.addSource('graticule', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        paint: {
          'line-color': '#2b2418',
          'line-width': ['case', ['get', 'major'], 0.9, 0.5],
          'line-opacity': ['case', ['get', 'major'], 0.08, 0.04],
        },
      });
      let gridKey = '';
      const syncGrid = () => {
        const c = map.getCenter();
        const step = gridStep(map.getZoom());
        const key = `${step}|${Math.floor(c.lng / (step * 10))}|${Math.floor(c.lat / (step * 10))}`;
        if (key === gridKey) return;
        gridKey = key;
        (map.getSource('graticule') as maplibregl.GeoJSONSource).setData(
          buildGraticule(c.lng, c.lat, step),
        );
      };
      syncGrid();
      map.on('moveend', syncGrid);
      map.on('move', syncGrid);

      map.addSource('territories', { type: 'geojson', data: EMPTY_FC });
      map.addSource('territory-labels', { type: 'geojson', data: EMPTY_FC });
      map.addSource('arrows', { type: 'geojson', data: EMPTY_FC });
      map.addSource('arrowheads', { type: 'geojson', data: EMPTY_FC });
      map.addSource('ranges', { type: 'geojson', data: EMPTY_FC });
      map.addSource('fx-links', { type: 'geojson', data: EMPTY_FC });
      map.addSource('night', { type: 'geojson', data: EMPTY_FC });
      map.addSource('fx-los', { type: 'geojson', data: EMPTY_FC });
      map.addSource('fx-ad', { type: 'geojson', data: EMPTY_FC });
      map.addSource('fx-jam', { type: 'geojson', data: EMPTY_FC });
      map.addSource('strikes', { type: 'geojson', data: EMPTY_FC });
      map.addSource('draft', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({
        id: 'ranges-fill',
        type: 'fill',
        source: 'ranges',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.06,
        },
      });
      map.addLayer({
        id: 'ranges-line',
        type: 'line',
        source: 'ranges',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.4,
          'line-opacity': 0.65,
          'line-dasharray': [3, 2.5],
        },
      });
      // four stacked bands (sunset, civil, nautical, astronomical twilight) give
      // a soft terminator; fades out as you zoom in and local lighting takes over
      map.addLayer({
        id: 'night-bands',
        type: 'fill',
        source: 'night',
        paint: {
          'fill-color': '#0a1630',
          'fill-antialias': false,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.14, 5, 0.1, 7, 0],
        },
      });
      map.addLayer({
        id: 'fx-los-shadow',
        type: 'fill',
        source: 'fx-los',
        filter: ['==', ['get', 'part'], 'shadow'],
        paint: { 'fill-color': '#1d232b', 'fill-opacity': 0.05 },
      });
      map.addLayer({
        id: 'fx-los-seen',
        type: 'fill',
        source: 'fx-los',
        filter: ['==', ['get', 'part'], 'seen'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.07 },
      });
      map.addLayer({
        id: 'fx-los-edge',
        type: 'line',
        source: 'fx-los',
        filter: ['!=', ['get', 'part'], 'shadow'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.3,
          'line-opacity': ['case', ['==', ['get', 'part'], 'pending'], 0.35, 0.8],
          'line-dasharray': [1, 1.5],
        },
      });
      map.addLayer({
        id: 'fx-ad-fill',
        type: 'fill',
        source: 'fx-ad',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case', ['get', 'engaged'], ['+', 0.08, ['*', 0.08, ['get', 'pulse']]], 0.05],
        },
      });
      map.addLayer({
        id: 'fx-ad-edge',
        type: 'line',
        source: 'fx-ad',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['geometry-type'], 'LineString'], 1.6, ['case', ['get', 'engaged'], 2.4, 1.6]],
          'line-opacity': ['case', ['get', 'engaged'], ['+', 0.55, ['*', 0.4, ['get', 'pulse']]], 0.7],
          'line-dasharray': ['case', ['==', ['geometry-type'], 'LineString'], ['literal', [2, 2]], ['literal', [4, 2]]],
        },
      });
      map.addLayer({
        id: 'fx-jam-fill',
        type: 'fill',
        source: 'fx-jam',
        filter: ['==', ['get', 'ring'], 0],
        paint: {
          'fill-color': '#b04ce0',
          'fill-opacity': ['*', ['get', 'env'], ['+', 0.1, ['*', 0.06, ['get', 'pulse']]]],
        },
      });
      map.addLayer({
        id: 'fx-jam-edge',
        type: 'line',
        source: 'fx-jam',
        paint: {
          'line-color': '#b04ce0',
          'line-width': ['case', ['==', ['get', 'ring'], 1], 1.4, 2],
          'line-opacity': ['*', ['get', 'env'], ['case', ['==', ['get', 'ring'], 1], 0.7, 0.85]],
          'line-dasharray': [2, 1.5],
        },
      });
      map.addLayer({
        id: 'fx-link-glow',
        type: 'line',
        source: 'fx-links',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 9,
          'line-blur': 6,
          'line-opacity': ['*', 0.55, ['get', 'env']],
        },
      });
      map.addLayer({
        id: 'fx-link-line',
        type: 'line',
        source: 'fx-links',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': ['get', 'env'],
          'line-dasharray': [1, 2],
        },
      });
      map.addLayer({
        id: 'fx-link-packets',
        type: 'circle',
        source: 'fx-links',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'env'],
          'circle-stroke-color': '#1aa6d9',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['get', 'env'],
          'circle-blur': 0.2,
        },
      });
      map.addLayer({
        id: 'strikes-trajectory',
        type: 'line',
        source: 'strikes',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#ff8c3a',
          'line-width': 1.2,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2],
        },
      });
      // blast scorch: soft dark halo + charred core, sized in meters
      const craterPx = (k: number): maplibregl.ExpressionSpecification => [
        'interpolate', ['exponential', 2], ['zoom'],
        8, ['*', ['get', 'sz'], 0.3 * k],
        18, ['*', ['get', 'sz'], 307 * k],
      ];
      map.addLayer({
        id: 'strikes-scorch-halo',
        type: 'circle',
        source: 'strikes',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': craterPx(2.4),
          'circle-color': '#3a2e1c',
          'circle-opacity': 0.28,
          'circle-blur': 1,
          'circle-pitch-alignment': 'map',
        },
      });
      map.addLayer({
        id: 'strikes-scorch',
        type: 'circle',
        source: 'strikes',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': craterPx(1),
          'circle-color': '#1a140c',
          'circle-opacity': 0.6,
          'circle-blur': 0.55,
          'circle-pitch-alignment': 'map',
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], '#ffffff', 'rgba(0,0,0,0)'],
          'circle-stroke-width': 1.5,
        },
      });

      // Territory fill sits under the relief and a water re-cover, so rivers
      // and coastlines stay readable through bold faction color.
      map.addLayer(
        {
          id: 'territory-fill',
          type: 'fill',
          source: 'territories',
          paint: {
            'fill-color': ['get', 'color'],
            // bold when zoomed out, nearly clear up close so ground detail shows
            'fill-opacity': [
              'interpolate', ['linear'], ['zoom'],
              6, ['*', 0.55, ['get', 'alpha']],
              10, ['*', 0.38, ['get', 'alpha']],
              12, ['*', 0.16, ['get', 'alpha']],
              14, ['*', 0.07, ['get', 'alpha']],
            ],
          },
        },
        'hillshade',
      );
      map.addLayer(
        {
          id: 'territory-water-cover',
          type: 'fill',
          source: 'openmaptiles',
          'source-layer': 'water',
          paint: { 'fill-color': '#a3b7ba' },
        },
        'hillshade',
      );
      map.addLayer({
        id: 'territory-outline-glow',
        type: 'line',
        source: 'territories',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 12, 5],
          'line-opacity': ['*', 0.45, ['get', 'alpha']],
          'line-blur': 2,
        },
      });
      map.addLayer({
        id: 'territory-outline',
        type: 'line',
        source: 'territories',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.4,
          'line-opacity': ['*', 0.9, ['get', 'alpha']],
        },
      });
      map.addLayer({
        id: 'territory-watermark',
        type: 'symbol',
        source: 'territory-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['exponential', 1.4], ['zoom'], 4, 26, 8, 52, 12, 110, 15, 160],
          'text-letter-spacing': 0.06,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-pitch-alignment': 'map',
          'text-rotation-alignment': 'map',
          'text-rotate': ['get', 'rotate'],
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            8, ['*', 0.3, ['get', 'alpha']],
            12, ['*', 0.16, ['get', 'alpha']],
            14, ['*', 0.08, ['get', 'alpha']],
          ],
          'text-halo-color': 'rgba(255,255,255,0.55)',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.5,
        },
      });
      map.addLayer({
        id: 'territory-sel',
        type: 'line',
        source: 'territories',
        filter: ['==', ['get', 'selected'], true],
        paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.9 },
      });

      map.addLayer({
        id: 'arrows-sel',
        type: 'line',
        source: 'arrows',
        filter: ['==', ['get', 'selected'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 9, 6, 12, 10, 14, 14, 15],
          'line-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'arrows-casing',
        type: 'line',
        source: 'arrows',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2b2418',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5.5, 6, 9, 10, 10, 14, 11],
          'line-opacity': 0.6,
        },
      });
      map.addLayer({
        id: 'arrows-line',
        type: 'line',
        source: 'arrows',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 6, 10, 7, 14, 7.5],
        },
      });
      map.addLayer({
        id: 'arrows-head-casing',
        type: 'symbol',
        source: 'arrowheads',
        layout: {
          'icon-image': 'arrowhead',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.42, 6, 0.68, 10, 0.78, 14, 0.82],
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-color': '#2b2418', 'icon-opacity': 0.6 },
      });
      map.addLayer({
        id: 'arrows-head',
        type: 'symbol',
        source: 'arrowheads',
        layout: {
          'icon-image': 'arrowhead',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.3, 6, 0.5, 10, 0.6, 14, 0.64],
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-color': ['get', 'color'] },
      });

      map.addLayer({
        id: 'draft-fill',
        type: 'fill',
        source: 'draft',
        filter: ['==', ['get', 'draft'], true],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-dasharray': [2, 1.5],
        },
      });
      map.addLayer({
        id: 'draft-points',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      // ---- 3D unit models (three.js custom layer, mercator mode only) ----
      const scene = new THREE.Scene();
      const camera3d = new THREE.Camera();
      let renderer3d: THREE.WebGLRenderer | null = null;
      const unit3d = new Map<
        string,
        { obj: THREE.Group; shadow: THREE.Mesh; sig: string }
      >();
      const strikeFx = new Map<string, THREE.Mesh>();
      const particles = new ParticleSystem();
      particles.addTo(scene);
      // full-screen color grade drawn after the map but before 3D effects, so
      // night darkens terrain while fire and tracers stay bright
      const gradeMat = new THREE.ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform vec3 uTint; void main(){ gl_FragColor = vec4(uTint, 1.0); }',
        uniforms: { uTint: { value: new THREE.Color(1, 1, 1) } },
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
      });
      const gradeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeMat);
      gradeQuad.frustumCulled = false;
      gradeQuad.renderOrder = -10;
      scene.add(gradeQuad);
      const hazeMat = new THREE.ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform vec4 uHaze; void main(){ gl_FragColor = uHaze; }',
        uniforms: { uHaze: { value: new THREE.Vector4(0.8, 0.74, 0.62, 0) } },
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const hazeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hazeMat);
      hazeQuad.frustumCulled = false;
      hazeQuad.renderOrder = -9;
      scene.add(hazeQuad);
      const missileFx = new Map<
        string,
        { dart: THREE.Group; trail: THREE.Line; trailPts: number }
      >();
      /** Seconds a fire trail lingers after impact. */
      const TRAIL_LINGER = 8;
      scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a97a8, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(60, 140, 90);
      scene.add(sun);

      const shadowGeo = new THREE.CircleGeometry(0.55, 24);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x1a1408,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const ringGeo = new THREE.RingGeometry(0.8, 1, 40);

      map.addLayer({
        id: 'units-3d',
        type: 'custom',
        renderingMode: '3d',
        onAdd: (_m, gl) => {
          renderer3d = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl as WebGLRenderingContext,
            antialias: true,
          });
          renderer3d.autoClear = false;
        },
        render: (_gl, args) => {
          const st = useStore.getState();
          let isGlobe = false;
          try {
            isGlobe =
              (map.getProjection() as { type?: string } | undefined)?.type ===
              'globe';
          } catch {
            /* older API */
          }
          if (!renderer3d || !st.use3d || isGlobe) return;

          const matrix =
            (args as { mainMatrix?: number[] }).mainMatrix ??
            (
              args as {
                defaultProjectionData?: { mainMatrix?: number[] };
              }
            ).defaultProjectionData?.mainMatrix;
          if (!matrix) return;

          const s = Math.pow(2, map.getZoom()) * 0.00012;
          const seen = new Set<string>();
          for (const u of st.scenario.units) {
            if (st.time < u.appearAt) continue;
            const model = modelFor(u);
            if (!model) continue; // no GLB — stays a 2D marker
            seen.add(u.id);
            let rec = unit3d.get(u.id);
            if (!rec || rec.sig !== model.sig) {
              if (rec) {
                scene.remove(rec.obj);
                scene.remove(rec.shadow);
              }
              const obj = model.obj.clone();
              const shadow = new THREE.Mesh(shadowGeo, shadowMat);
              scene.add(obj, shadow);
              rec = { obj, shadow, sig: model.sig };
              unit3d.set(u.id, rec);
            }
            const pose = unitPose(u);
            const mc = merc(pose.point[0], pose.point[1]);
            const alt = u.type === 'air' ? s * 0.45 : 0;
            rec.obj.matrixAutoUpdate = false;
            rec.obj.matrix
              .makeTranslation(mc.x, mc.y, mc.z + alt)
              .scale(new THREE.Vector3(s, -s, s))
              .multiply(
                new THREE.Matrix4().makeRotationZ(
                  THREE.MathUtils.degToRad(90 - pose.bearing),
                ),
              )
              .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            rec.obj.visible = true;
            // contact shadow: flat on the ground, no heading rotation
            rec.shadow.matrixAutoUpdate = false;
            rec.shadow.matrix
              .makeTranslation(mc.x, mc.y, mc.z + s * 0.01)
              .scale(new THREE.Vector3(s, -s, s))
              .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            rec.shadow.visible = u.type !== 'air';
          }
          for (const [id, rec] of unit3d) {
            if (!seen.has(id)) {
              scene.remove(rec.obj);
              scene.remove(rec.shadow);
              unit3d.delete(id);
            }
          }

          {
            const env = st.scenario.environment;
            const center = map.getCenter();
            const light = env
              ? lightingFromSun(sunElevation(utcInstant(env, st.time, st.duration), [center.lng, center.lat]))
              : { dark: 0, warm: 0 };
            // zoomed out, the geographic terminator layer shows day/night instead
            const localWeight = clamp01((map.getZoom() - 4) / 3);
            light.warm *= localWeight;
            const dark = light.dark * 0.52 * localWeight;
            // multiply tint: neutral by day, warm at golden hour, deep blue at night
            const tint = new THREE.Color(1, 1, 1)
              .lerp(new THREE.Color(1, 0.86, 0.68), light.warm * (1 - light.dark))
              .lerp(new THREE.Color(0.28, 0.36, 0.58), dark);
            gradeMat.uniforms.uTint.value.copy(tint);
            gradeQuad.visible = dark > 0.01 || light.warm > 0.01;
            const haze = env?.haze ?? 0;
            hazeMat.uniforms.uHaze.value.set(0.82 - dark * 0.5, 0.76 - dark * 0.45, 0.64 - dark * 0.3, haze * 0.32);
            hazeQuad.visible = haze > 0.01;
            // flames glow additively once it's dark enough to read
            const additive = dark > 0.3;
            if ((particles.fire.mat.blending === THREE.AdditiveBlending) !== additive) {
              particles.fire.mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
              particles.fire.mat.needsUpdate = true;
            }
            const w = windVector(env);
            particles.wx = w.x;
            particles.wy = w.y;
            map.getContainer().style.setProperty('--night', dark.toFixed(3));
          }
          particles.begin();
          // Effects are sized in meters but stretched with zoom so a standard
          // blast stays ~60px — in proportion to the oversized unit stickers.
          const fxScale = (() => {
            const c = map.getCenter();
            const mRef = maplibregl.MercatorCoordinate.fromLngLat(c).meterInMercatorCoordinateUnits();
            const mercPerPx = 1 / (512 * Math.pow(2, map.getZoom()));
            return Math.min(6, Math.max(1, (45 * mercPerPx) / (70 * mRef)));
          })();

          // ---- weapons in flight: missiles, bombs, shells, gunfire (incl. interceptors) ----
          const flying = new Set<string>();
          const arcFor = (x: Strike) => {
            const from = x.fromUnitId
              ? st.scenario.units.find((u) => u.id === x.fromUnitId)
              : undefined;
            if (!from) return null;
            const src = unitPose(from, x.launchAt ?? x.appearAt - 3).point;
            const kind = weaponKind(x.name);
            // aircraft release from altitude
            // aircraft icons sit on the ground plane, so release just above them
            const a = merc(src[0], src[1], from.type === 'air' ? 60 : 0);
            let b: { x: number; y: number; z: number } = merc(x.lng, x.lat);
            if (x.targetStrikeId) {
              const tgt = st.scenario.strikes.find(
                (s2) => s2.id === x.targetStrikeId,
              );
              // aim at the target's mid-air position at intercept time
              const hit =
                tgt && !tgt.targetStrikeId
                  ? interceptPos(tgt, x.appearAt)
                  : null;
              if (hit) b = hit;
            }
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const lofted = from.type !== 'air';
            // keep lofted arcs on screen: cap apex height (~1.2 km, stylized)
            const apexCap = maplibregl.MercatorCoordinate.fromLngLat({ lng: x.lng, lat: x.lat }).meterInMercatorCoordinateUnits() * 1200;
            const apex =
              kind === 'gun'
                ? 0
                : kind === 'bomb'
                  ? dist * 0.08
                  : lofted
                    ? Math.min(dist * (x.targetStrikeId ? 0.18 : 0.22), apexCap)
                    : dist * 0.12;
            return { a, b, apex, kind, launchAt: x.launchAt ?? x.appearAt - 3 };
          };
          const arcPos = (
            arc: NonNullable<ReturnType<typeof arcFor>>,
            f: number,
          ) => ({
            x: arc.a.x + (arc.b.x - arc.a.x) * f,
            y: arc.a.y + (arc.b.y - arc.a.y) * f,
            z:
              arc.a.z +
              (arc.b.z - arc.a.z) * f +
              4 * arc.apex * f * (1 - f),
          });
          const interceptPos = (tgt: Strike, atTime: number) => {
            const arc = arcFor(tgt);
            if (!arc) return null;
            const f = (atTime - arc.launchAt) / (tgt.appearAt - arc.launchAt);
            if (f <= 0 || f >= 1) return null;
            return arcPos(arc, f);
          };
          for (const x of expandStrikes(resolvedStrikes())) {
            const killer = interceptorFor(st, x);
            if (killer && st.time >= killer.appearAt) continue; // shot down
            const arc = arcFor(x);
            if (!arc) continue;
            const f = (st.time - arc.launchAt) / (x.appearAt - arc.launchAt);
            if (f <= 0 || f >= 1) continue;
            const mAt = maplibregl.MercatorCoordinate.fromLngLat({ lng: x.lng, lat: x.lat }).meterInMercatorCoordinateUnits() * fxScale;
            const kindScale = arc.kind === 'gun' ? Math.min(1, x.size * 3) : 1;
            particles.projectile(x.id, arc.kind, (ff) => arcPos(arc, ff), f, mAt * kindScale);
            if (arc.kind === 'gun') continue; // tracers are particles only
            flying.add(x.id);
            let fx = missileFx.get(x.id);
            if (!fx) {
              const dart = getMissileModel().clone();
              const trailGeo = new THREE.BufferGeometry();
              trailGeo.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(64 * 3), 3),
              );
              const trail = new THREE.Line(
                trailGeo,
                new THREE.LineBasicMaterial({
                  color: x.targetStrikeId ? 0x9ad4ff : arc.kind === 'shell' ? 0xffb45a : 0xd8d0c0,
                  transparent: true,
                  opacity: arc.kind === 'bomb' ? 0 : arc.kind === 'shell' ? 0.75 : 0.35,
                }),
              );
              trail.frustumCulled = false;
              scene.add(dart, trail);
              fx = { dart, trail, trailPts: 0 };
              missileFx.set(x.id, fx);
            }
            fx.dart.visible = arc.kind !== 'shell'; // shells: glowing round + arc trail only
            const p = arcPos(arc, f);
            const vx = arc.b.x - arc.a.x;
            const vy = arc.b.y - arc.a.y;
            const vz = arc.b.z - arc.a.z + 4 * arc.apex * (1 - 2 * f);
            const yaw = Math.atan2(-vy, vx);
            const pitch = Math.atan2(vz, Math.hypot(vx, vy));
            fx.dart.matrixAutoUpdate = false;
            fx.dart.matrix
              .makeTranslation(p.x, p.y, p.z)
              .scale(new THREE.Vector3(s, -s, s))
              .multiply(new THREE.Matrix4().makeRotationZ(yaw))
              .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
              .multiply(new THREE.Matrix4().makeRotationZ(pitch));
            // smoke trail: sample the arc up to f
            const pos = fx.trail.geometry.getAttribute('position');
            const n = Math.min(64, Math.max(2, Math.floor(f * 64)));
            for (let i = 0; i < n; i++) {
              const pp = arcPos(arc, (i / (n - 1)) * f);
              pos.setXYZ(i, pp.x, pp.y, pp.z);
            }
            pos.needsUpdate = true;
            fx.trail.geometry.setDrawRange(0, n);
          }
          // ---- fire trails: faint full-arc ribbons tinted by the shooter's faction ----
          for (const x of expandStrikes(resolvedStrikes())) {
            if (x.id.includes('#')) continue; // one trail per salvo keeps it readable
            const arc = arcFor(x);
            if (!arc) continue;
            const f = (st.time - arc.launchAt) / (x.appearAt - arc.launchAt);
            const after = st.time - x.appearAt;
            if (f <= 0 || after > TRAIL_LINGER) continue;
            const killer = interceptorFor(st, x);
            const cut =
              killer && st.time >= killer.appearAt
                ? (killer.appearAt - arc.launchAt) / (x.appearAt - arc.launchAt)
                : 1;
            const shooter = st.scenario.units.find((u) => u.id === x.fromUnitId);
            const c = new THREE.Color(shooter ? factionColor(shooter.factionId) : '#555555');
            const base = arc.kind === 'gun' ? 0.45 : 0.6;
            // hold full strength a few seconds after impact, then fade out
            const hold = 3;
            const alpha = base * Math.min(1, Math.max(0, 1 - (after - hold) / (TRAIL_LINGER - hold)));
            const mTrail =
              maplibregl.MercatorCoordinate.fromLngLat({ lng: x.lng, lat: x.lat }).meterInMercatorCoordinateUnits() *
              fxScale *
              (arc.kind === 'gun' ? Math.min(1, x.size * 3) : 1);
            particles.trail(x.id, (ff) => arcPos(arc, ff), Math.min(1, f, cut), mTrail, c.r, c.g, c.b, alpha);
          }

          for (const [id, fx] of missileFx) {
            if (!flying.has(id)) {
              scene.remove(fx.dart);
              scene.remove(fx.trail);
              fx.trail.geometry.dispose();
              missileFx.delete(id);
            }
          }

          // ---- particles: explosions, muzzle blasts, wrecks, dust ----
          const meters = (lng: number, lat: number) =>
            maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }).meterInMercatorCoordinateUnits() * fxScale;
          const rounds = expandStrikes(resolvedStrikes());
          const activeRings = new Set<string>();
          for (const x of rounds) {
            const m = meters(x.lng, x.lat);
            // launch blast at the firing unit (ground launchers only)
            const from = x.fromUnitId
              ? st.scenario.units.find((u) => u.id === x.fromUnitId)
              : undefined;
            if (from && from.type !== 'air' && x.launchAt !== undefined && weaponKind(x.name) !== 'gun') {
              const lp = unitPose(from).point;
              particles.muzzle(x.id, merc(lp[0], lp[1]), m, st.time - x.launchAt);
            }
            if (interceptorFor(st, x)) continue; // killed mid-air, no ground blast
            const age = st.time - x.appearAt;
            if (age < 0 || age > 14) continue;
            let bp: { x: number; y: number; z: number } = merc(x.lng, x.lat);
            if (x.targetStrikeId) {
              const tgt = st.scenario.strikes.find((s2) => s2.id === x.targetStrikeId);
              const hit = tgt ? interceptPos(tgt, x.appearAt) : null;
              if (hit) bp = hit;
            }
            particles.explosion(x.id, bp, m, x.size, age, !!x.targetStrikeId, weaponKind(x.name));
            // shock ring on the ground
            if (age > 0.8 || weaponKind(x.name) === 'gun') continue;
            activeRings.add(x.id);
            let ring = strikeFx.get(x.id);
            if (!ring) {
              ring = new THREE.Mesh(
                ringGeo,
                new THREE.MeshBasicMaterial({
                  color: 0xffe2b0,
                  transparent: true,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                }),
              );
              scene.add(ring);
              strikeFx.set(x.id, ring);
            }
            const life = age / 0.8;
            const rScale = m * x.size * (40 + life * 260);
            ring.matrixAutoUpdate = false;
            ring.matrix
              .makeTranslation(bp.x, bp.y, bp.z + m * 2)
              .scale(new THREE.Vector3(rScale, -rScale, rScale))
              .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - life) * (1 - life);
          }
          for (const [id, ring] of strikeFx) {
            if (!activeRings.has(id)) {
              scene.remove(ring);
              (ring.material as THREE.Material).dispose();
              strikeFx.delete(id);
            }
          }
          for (const u of st.scenario.units) {
            if (st.time < u.appearAt || (u.leavesAt !== undefined && st.time >= u.leavesAt)) continue;
            const pose = unitPose(u);
            const m = meters(pose.point[0], pose.point[1]);
            if (u.destroyedAt !== undefined && st.time >= u.destroyedAt) {
              // only vehicles and equipment burn; fallen personnel are just marked
              if (u.type !== 'infantry') {
                particles.wreck(u.id, merc(pose.point[0], pose.point[1]), m, st.time - u.destroyedAt, st.time, u.type !== 'air');
              }
              continue;
            }
            const hurt = (st.scenario.effects ?? []).find(
              (fx) => fx.unitId === u.id && fx.kind === 'wounded' && st.time >= fx.start && st.time <= fx.start + fx.duration,
            );
            if (hurt) particles.smolder(u.id, merc(pose.point[0], pose.point[1]), m, st.time - hurt.start, st.time);
            if (u.type === 'air' || u.type === 'naval' || !u.arrowId) continue;
            const arrow = st.scenario.arrows.find((a) => a.id === u.arrowId);
            if (!arrow) continue;
            const prog = (st.time - arrow.appearAt) / arrow.duration;
            if (prog <= 0 || prog >= 1) continue;
            const path = arrowPath(arrow);
            const trail = [];
            for (let k = 1; k <= 7; k++) {
              const pt = pointAlongPath(path, clamp01((st.time - k * 0.35 - arrow.appearAt) / arrow.duration)).point;
              trail.push(merc(pt[0], pt[1]));
            }
            // dust stays subtle: only mildly exaggerated
            particles.dust(u.id, trail, (m / fxScale) * Math.min(fxScale, 1.8), u.type === 'armor');
          }
          particles.commit(map.getCanvas().height / 2);

          camera3d.projectionMatrix = new THREE.Matrix4().fromArray(
            matrix as number[],
          );
          renderer3d.resetState();
          renderer3d.render(scene, camera3d);
        },
      } as maplibregl.CustomLayerInterface);

      syncAll();
    });

    useStore.getState().setMapApi({
      getCamera: () => {
        const c = map.getCenter();
        return {
          lng: c.lng,
          lat: c.lat,
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        };
      },
      flyTo: (pose) => {
        map.flyTo({
          center: [pose.lng, pose.lat],
          zoom: pose.zoom,
          pitch: pose.pitch,
          bearing: pose.bearing,
          duration: 800,
        });
      },
      warmup: async () => {
        // Sweep the whole camera path so every tile is cached before recording
        const st = useStore.getState();
        const saved = {
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        };
        const waitIdle = () =>
          new Promise<void>((res) => {
            if (map.areTilesLoaded()) {
              // one more frame so newly parsed tiles render
              setTimeout(res, 60);
              return;
            }
            const to = setTimeout(res, 500); // cap per pose
            map.once('idle', () => {
              clearTimeout(to);
              res();
            });
          });
        const kfs = st.scenario.keyframes;
        if (kfs.length === 0) {
          await waitIdle();
          return;
        }
        for (let t = 0; t <= st.duration; t += 0.5) {
          const pose = interpolateCamera(kfs, t, (id) => {
            const u = st.scenario.units.find((x) => x.id === id);
            return u ? unitPose(u) : null;
          });
          map.jumpTo({
            center: [pose.lng, pose.lat],
            zoom: pose.zoom,
            pitch: pose.pitch,
            bearing: pose.bearing,
          });
          await waitIdle();
        }
        map.jumpTo(saved);
      },
    });

    map.on('click', (e) => {
      const st = useStore.getState();
      const { lng, lat } = e.lngLat;
      switch (st.tool) {
        case 'unit':
          st.addUnit(lat, lng);
          break;
        case 'label':
          st.addLabel(lat, lng);
          break;
        case 'strike':
          st.addStrike(lat, lng);
          break;
        case 'arrow':
        case 'territory':
          st.addDraftPoint([lng, lat]);
          break;
        case 'erase':
          st.eraseAt(lat, lng);
          break;
        case 'select': {
          const p = e.point;
          const feats = map.queryRenderedFeatures(
            [
              [p.x - 6, p.y - 6],
              [p.x + 6, p.y + 6],
            ],
            {
              layers: [
                'territory-fill',
                'arrows-line',
                'arrows-casing',
                'arrows-head',
                'strikes-scorch',
              ].filter((l) => map.getLayer(l)),
            },
          );
          if (feats.length && feats[0].properties?.oid) {
            st.setSelection({
              kind: feats[0].properties.kind,
              id: feats[0].properties.oid,
            });
          } else {
            st.setSelection(null);
          }
          break;
        }
      }
    });

    map.on('dblclick', (e) => {
      const st = useStore.getState();
      if (st.tool === 'arrow' || st.tool === 'territory') {
        e.preventDefault();
        st.finishDraft();
      }
    });

    map.on('mousemove', (e) => {
      const st = useStore.getState();
      if (st.draft.length) {
        hoverPt.current = [e.lngLat.lng, e.lngLat.lat];
        syncDraft();
      } else if (hoverPt.current) {
        hoverPt.current = null;
      }
    });

    map.on('move', () => scheduleLayout());
    const unsubElev = onElevationLoaded(() => syncAll());
    const unsub = useStore.subscribe(syncAll);
    return () => {
      unsub();
      unsubElev();
      useStore.getState().setMapApi(null);
      map.remove();
      mapRef.current = null;
      unitMarkers.current.clear();
      labelMarkers.current.clear();
      reticleMarkers.current.clear();
      tagMarkers.current.clear();
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
}
