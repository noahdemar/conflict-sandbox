import { iconOutOfPeriod, PERIODS, periodOf } from './eras';
import { boxContains, boxForCamera, readSeconds } from './authoring/frame';
import { positionOf } from './authoring/autoCamera';
import { metersBetween, roughPosition } from './realism';
import { expandStrikes } from './particles';
import { isIconKey, resolveIconName } from './silhouettes';
import type { Scenario } from './types';

/**
 * Composition lint: the part of "does it look right" that can be checked
 * without watching the film. Schema and reference problems are errors
 * (realism.ts); physics is a warning (realismWarnings); this is everything
 * about how the scenario *reads* on screen — whether the subject is in frame,
 * whether the caption fits the shot, whether anything important happens where
 * no camera is pointed.
 */

export type LintSeverity = 'error' | 'warn' | 'info';

export interface LintFinding {
  /** JSON pointer into the document, so an editor can jump straight there */
  path: string;
  message: string;
  severity: LintSeverity;
  /** What to do about it */
  fix?: string;
}

// Label crowding is deliberately not checked here: MapView declutters labels
// in screen space at render time, so a static overlap test only produces noise.

/** A cut this far across the map in under a second is disorienting. */
const JUMP_KM = 25;

export function lintScenario(s: Scenario, duration = s.duration): LintFinding[] {
  const out: LintFinding[] = [];
  const keyframes = [...s.keyframes].sort((a, b) => a.time - b.time);
  const end = duration ?? (keyframes.length ? keyframes[keyframes.length - 1].time + 5 : 60);

  // --- shots -----------------------------------------------------------------
  keyframes.forEach((k, i) => {
    const next = keyframes[i + 1];
    const shotLength = (next ? next.time : end) - k.time;
    const needed = readSeconds(k.caption);
    if (!k.caption.trim()) {
      out.push({ path: `/keyframes/${i}/caption`, severity: 'warn', message: `Shot ${k.id} has no caption.`,
        fix: 'Give every shot a line: the article and the narration are built from them.' });
    } else if (k.narrate !== false && shotLength + 0.05 < needed) {
      out.push({
        path: `/keyframes/${i}/time`,
        severity: 'warn',
        message: `Shot ${k.id} runs ${shotLength.toFixed(1)}s but its caption takes about ${needed.toFixed(1)}s to read aloud.`,
        fix: `Move the next keyframe to ${(k.time + needed + 0.5).toFixed(1)}s or later, or shorten the caption.`,
      });
    }

    const box = boxForCamera([k.lng, k.lat], k.zoom, k.pitch);
    for (const id of k.highlightUnitIds ?? []) {
      // satellites are drawn in the sky above their ground track, so being
      // outside the map box says nothing about whether they are visible
      if (s.units.find((u) => u.id === id)?.altitudeKm !== undefined) continue;
      const p = positionOf(s, id, k.time);
      if (p && !boxContains(box, p)) {
        out.push({
          path: `/keyframes/${i}/highlightUnitIds`,
          severity: 'warn',
          message: `Shot ${k.id} highlights "${id}", which is outside the frame at ${k.time}s.`,
          fix: 'Widen the shot (lower zoom) or re-centre it on the highlighted units.',
        });
      }
    }
    if (k.followUnitId) {
      const unit = s.units.find((u) => u.id === k.followUnitId);
      if (unit && unit.appearAt > k.time + 0.001) {
        out.push({
          path: `/keyframes/${i}/followUnitId`,
          severity: 'warn',
          message: `Shot ${k.id} follows "${unit.name}", which does not appear until ${unit.appearAt}s.`,
          fix: 'Start the shot later, or follow something already on stage.',
        });
      }
    }

    if (next) {
      const gap = next.time - k.time;
      const km = metersBetween([k.lng, k.lat], [next.lng, next.lat]) / 1000;
      if (km > JUMP_KM && gap < 1.5) {
        out.push({
          path: `/keyframes/${i + 1}/time`,
          severity: 'info',
          message: `The camera moves ${km.toFixed(0)} km in ${gap.toFixed(1)}s between ${k.id} and ${next.id}.`,
          fix: 'Leave a beat between distant shots, or cut wide first so the viewer keeps their bearings.',
        });
      }
    }
  });

  if (!keyframes.length) {
    out.push({
      path: '/keyframes',
      severity: 'error',
      message: 'The scenario has no camera shots, so there is nothing to play.',
      fix: 'Write beats and set "keyframes": "auto", or add keyframes by hand.',
    });
  }

  // --- events nobody sees ----------------------------------------------------
  const frames = keyframes.map((k, i) => ({
    k,
    i,
    box: boxForCamera([k.lng, k.lat], k.zoom, k.pitch),
    until: keyframes[i + 1]?.time ?? end,
  }));
  const seenAt = (p: [number, number], t: number) =>
    frames.some((f) => t >= f.k.time - 0.001 && t <= f.until + 0.001 && boxContains(f.box, p));

  s.strikes.forEach((x, i) => {
    const p = positionOf(s, x.id, x.appearAt) ?? [x.lng, x.lat];
    if (!seenAt(p as [number, number], x.appearAt)) {
      out.push({
        path: `/strikes/${i}`,
        severity: 'warn',
        message: `"${x.name}" lands at ${x.appearAt}s where no shot is looking.`,
        fix: 'Point a shot at it, or move the strike to a time the camera covers.',
      });
    }
  });

  s.units.forEach((u, i) => {
    if (u.altitudeKm !== undefined) return;
    // a unit counts as seen if any shot frames it while it is on stage
    const ever = frames.some((f) => {
      const t = Math.max(f.k.time, u.appearAt);
      if (t > f.until + 0.001 || u.appearAt > f.until + 0.001) return false;
      if ((u.destroyedAt ?? Infinity) < f.k.time - 0.001 || (u.leavesAt ?? Infinity) < f.k.time - 0.001) return false;
      return boxContains(f.box, roughPosition(s, u, t));
    });
    if (!ever) {
      out.push({
        path: `/units/${i}`,
        severity: 'info',
        message: `"${u.name}" is never inside a shot.`,
        fix: 'Frame it in a shot, or remove it: unseen units still cost drawing time.',
      });
    }
  });

  // --- salvos and the end of the timeline ------------------------------------
  for (const x of expandStrikes(s.strikes, s.units, (u, t) => roughPosition(s, u, t))) {
    if (x.appearAt > end + 0.001) {
      out.push({
        path: '/duration',
        severity: 'warn',
        message: `Part of "${x.name}" lands at ${x.appearAt.toFixed(1)}s, after the timeline ends at ${end}s.`,
        fix: `Raise duration to at least ${Math.ceil(x.appearAt + 1)}s.`,
      });
      break;
    }
  }

  // --- routes that do nothing -----------------------------------------------
  s.arrows.forEach((a, i) => {
    const riders = s.units.filter((u) => u.arrowId === a.id);
    if (!riders.length && a.hideLine) {
      out.push({
        path: `/arrows/${i}`,
        severity: 'info',
        message: `Route "${a.name || a.id}" is hidden and no unit follows it, so it does nothing.`,
        fix: 'Give a unit its arrowId, or delete the route.',
      });
    }
  });

  // --- period consistency ----------------------------------------------------
  const period = periodOf(s);
  const seen = new Set<string>();
  for (const u of s.units) {
    const icon = u.icon && isIconKey(u.icon) ? u.icon : u.icon ? resolveIconName(u.icon) : null;
    if (!icon || seen.has(icon)) continue;
    if (iconOutOfPeriod(icon, period)) {
      seen.add(icon);
      out.push({
        path: `/units/${s.units.indexOf(u)}/icon`,
        severity: 'warn',
        message: `"${u.name}" uses the "${icon}" icon, which does not belong in the ${PERIODS[period].label} period.`,
        fix: `Pick an icon from the ${PERIODS[period].label} set, or change the scenario's "period".`,
      });
    }
  }

  return out;
}

/** Findings as plain lines, for the console and the CLI. */
export function lintLines(findings: LintFinding[]): string[] {
  return findings.map((f) => `${f.severity.toUpperCase()} ${f.path} ${f.message}${f.fix ? ` — ${f.fix}` : ''}`);
}
