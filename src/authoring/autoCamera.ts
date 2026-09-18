import type { LngLat } from '../geo';
import { bearingBetween } from '../geo';
import { roughPosition } from '../realism';
import type { Keyframe, Scenario, Unit } from '../types';
import { bboxOf, centerOf, padBox, readSeconds, zoomForBox } from './frame';
import type { Beat, ShotKind } from './types';

/**
 * The camera composer. Authors write beats — what happens, who matters — and
 * this works out where to put the camera, how wide to frame it, which way to
 * face and how long the shot must run for its caption to be read aloud.
 *
 * Every value it produces is an ordinary keyframe, so an author can take the
 * output, change one shot by hand, and keep the rest.
 */

/** A beat whose time has already been resolved to seconds (or left open). */
export interface ResolvedBeat extends Omit<Beat, 'at'> {
  at?: number;
}

/** How each kind of shot is framed. */
const SHOT_STYLE: Record<ShotKind, { pitch: number; pad: number; minZoom: number; maxZoom: number }> = {
  establish: { pitch: 15, pad: 2.4, minZoom: 6, maxZoom: 13.5 },
  approach: { pitch: 45, pad: 1.9, minZoom: 9, maxZoom: 15 },
  action: { pitch: 55, pad: 1.45, minZoom: 11, maxZoom: 16.5 },
  detail: { pitch: 60, pad: 1.15, minZoom: 12, maxZoom: 17 },
  aftermath: { pitch: 25, pad: 2.1, minZoom: 8, maxZoom: 14.5 },
};

/** Shortest shot worth cutting to, and the longest we will hold on one frame. */
const MIN_SHOT = 2.5;
const MAX_SHOT = 14;

/** Where anything referenced by a beat is at a given time. */
export function positionOf(s: Scenario, id: string, at: number): LngLat | null {
  const u = s.units.find((x) => x.id === id);
  if (u) return roughPosition(s, u, at);
  const strike = s.strikes.find((x) => x.id === id);
  if (strike) {
    const target = strike.targetUnitId ? s.units.find((x) => x.id === strike.targetUnitId) : undefined;
    return target ? roughPosition(s, target, strike.appearAt) : [strike.lng, strike.lat];
  }
  const label = s.labels.find((x) => x.id === id);
  if (label) return [label.lng, label.lat];
  const arrow = s.arrows.find((x) => x.id === id);
  if (arrow?.points.length) return arrow.points[arrow.points.length - 1];
  const territory = s.territories.find((x) => x.id === id);
  if (territory?.points.length) {
    const box = bboxOf(territory.points);
    return box ? centerOf(box) : null;
  }
  return null;
}

/** Units on stage at a time: appeared, not yet destroyed or departed. */
function liveUnits(s: Scenario, at: number): Unit[] {
  return s.units.filter(
    (u) => u.appearAt <= at + 0.001 && (u.destroyedAt ?? Infinity) >= at - 0.001 && (u.leavesAt ?? Infinity) >= at - 0.001,
  );
}

/** Metres a unit moves either side of a time; drives follow shots and bearing. */
function motionBearing(s: Scenario, id: string, at: number): number | null {
  const u = s.units.find((x) => x.id === id);
  if (!u?.arrowId) return null;
  const before = roughPosition(s, u, Math.max(0, at - 1.5));
  const after = roughPosition(s, u, at + 1.5);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  return moved > 1e-5 ? bearingBetween(before, after) : null;
}

/**
 * The camera pose that frames `focus` (or the whole scene) at a time. Exported
 * because partially written keyframes are completed the same way.
 */
export function frameFor(
  s: Scenario,
  focus: string[] | undefined,
  at: number,
  shot: ShotKind = 'action',
): { lng: number; lat: number; zoom: number; pitch: number; bearing: number } {
  const style = SHOT_STYLE[shot];
  const points = (focus ?? []).map((id) => positionOf(s, id, at)).filter((p): p is LngLat => !!p);
  const fallback = liveUnits(s, at).map((u) => roughPosition(s, u, at));
  const box = bboxOf(points.length ? points : fallback.length ? fallback : s.units.map((u) => [u.lng, u.lat]));
  const center: LngLat = box ? centerOf(box) : [0, 0];
  const zoom = box
    ? Math.max(style.minZoom, Math.min(style.maxZoom, zoomForBox(padBox(box, style.pad))))
    : style.minZoom;
  const moving = (focus ?? []).map((id) => motionBearing(s, id, at)).find((b) => b !== null);
  return {
    lng: Number(center[0].toFixed(6)),
    lat: Number(center[1].toFixed(6)),
    zoom: Number(zoom.toFixed(2)),
    pitch: style.pitch,
    bearing: moving !== null && moving !== undefined ? Number(moving.toFixed(1)) : 0,
  };
}

/** Faction name for a caption, falling back to the id. */
const factionName = (s: Scenario, id: string) => s.factions.find((f) => f.id === id)?.name ?? id;

/**
 * Beats derived from the scenario itself, when the author wrote none. The
 * captions are plainly machine-made on purpose: they describe exactly what the
 * data says and nothing more, and the notes tell the author to rewrite them.
 */
function beatsFromEvents(s: Scenario): ResolvedBeat[] {
  const beats: ResolvedBeat[] = [];
  const first = Math.min(...s.units.map((u) => u.appearAt), 0);
  beats.push({ at: first, caption: s.name, shot: 'establish', focus: s.units.map((u) => u.id) });

  // units that start moving, grouped by the route they take
  for (const a of s.arrows) {
    const riders = s.units.filter((u) => u.arrowId === a.id);
    if (!riders.length) continue;
    const names = [...new Set(riders.map((u) => u.name))].slice(0, 3).join(', ');
    beats.push({
      at: a.appearAt,
      caption: `${factionName(s, a.factionId)}: ${names} move along ${a.name || 'their route'}.`,
      shot: 'approach',
      focus: riders.map((u) => u.id),
      follow: riders.length === 1 ? riders[0].id : undefined,
    });
  }

  for (const x of s.strikes) {
    const target = x.targetUnitId ? s.units.find((u) => u.id === x.targetUnitId) : undefined;
    beats.push({
      at: x.appearAt,
      caption: target ? `${x.name} hits ${target.name}.` : `${x.name} strikes.`,
      shot: 'action',
      focus: [x.id, ...(x.fromUnitId ? [x.fromUnitId] : []), ...(target ? [target.id] : [])],
    });
  }

  const last = Math.max(0, ...s.units.map((u) => u.destroyedAt ?? 0), ...s.strikes.map((x) => x.appearAt));
  beats.push({
    at: last + 2,
    caption: 'The scene at the end of the action.',
    shot: 'aftermath',
    focus: s.units.map((u) => u.id),
  });

  return beats.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

/**
 * Compose a shot list. Beats with a time are placed there; beats without one
 * follow the previous shot at reading pace. The returned duration always
 * leaves the last caption time to be read.
 */
export function composeKeyframes(
  s: Scenario,
  beats: ResolvedBeat[] | undefined,
  duration?: number,
): { keyframes: Keyframe[]; duration: number; notes: string[] } {
  const notes: string[] = [];
  let list = beats?.length ? [...beats] : beatsFromEvents(s);
  if (!beats?.length) {
    notes.push(
      'Camera and captions were composed from the events in the scenario. Rewrite the captions in your own words before publishing.',
    );
  }
  if (!list.length) return { keyframes: [], duration: duration ?? 30, notes };

  // place beats in time: explicit times are kept, gaps are filled at reading pace
  const timed: { beat: ResolvedBeat; time: number; length: number }[] = [];
  let cursor = 0;
  for (const beat of list) {
    // the caption's reading time plus the half second of slack the guide asks for
    const length = Math.min(MAX_SHOT, Math.max(MIN_SHOT, readSeconds(beat.caption) + 0.5 + (beat.hold ?? 0)));
    const time = beat.at !== undefined ? beat.at : cursor;
    timed.push({ beat, time, length });
    cursor = time + length;
  }
  timed.sort((a, b) => a.time - b.time);

  // an explicit beat that lands before its predecessor's caption can be read
  // is pushed later rather than dropped, and the author is told
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const earliest = prev.time + prev.length;
    if (timed[i].time < earliest - 0.001) {
      if (timed[i].beat.at !== undefined) {
        notes.push(
          `Beat "${timed[i].beat.caption.slice(0, 40)}…" was moved from ${timed[i].time.toFixed(1)}s to ${earliest.toFixed(1)}s so the previous caption can be read.`,
        );
      }
      timed[i].time = earliest;
    }
  }

  const keyframes: Keyframe[] = timed.map(({ beat, time }, i) => {
    const shot = beat.shot ?? (i === 0 ? 'establish' : i === timed.length - 1 ? 'aftermath' : 'action');
    const pose = frameFor(s, beat.focus, time, shot);
    const follow = beat.follow ?? (beat.focus?.length === 1 && motionBearing(s, beat.focus[0], time) !== null ? beat.focus[0] : undefined);
    const highlight = beat.focus?.filter((id) => s.units.some((u) => u.id === id));
    return {
      id: beat.id ?? `k_auto_${i + 1}`,
      time: Number(time.toFixed(2)),
      ...pose,
      caption: beat.caption,
      ...(highlight?.length ? { highlightUnitIds: highlight } : {}),
      ...(follow ? { followUnitId: follow, followMode: 'track' as const } : {}),
      ...(beat.sensor ? { sensor: beat.sensor } : {}),
      ...(beat.overlay ? { overlay: beat.overlay } : {}),
      ...(beat.overlayFactionIds ? { overlayFactionIds: beat.overlayFactionIds } : {}),
      ...(beat.narrate === false ? { narrate: false } : {}),
      ...(beat.media ? { media: beat.media } : {}),
    };
  });

  const lastEnd = timed[timed.length - 1].time + timed[timed.length - 1].length;
  const needed = Number((lastEnd + 1).toFixed(2));
  let total = duration ?? needed;
  if (duration !== undefined && duration < needed) {
    notes.push(
      `Duration raised from ${duration}s to ${needed}s so the last caption finishes inside the timeline.`,
    );
    total = needed;
  }
  return { keyframes, duration: total, notes };
}
