import { iconFallbacks } from './iconCatalog';
import { lintScenario, type LintFinding } from './lint';
import { realismWarnings, scenarioErrors } from './realism';
import type { RosterEntry, Scenario, Selection } from './types';

/**
 * One report over a resolved scenario, shared by the import dialogs, the
 * ?scenario= player and the command-line check, so an author, an assistant
 * and CI all see the same list in the same order.
 *
 * Errors stop playback. Warnings and findings never do: they are the things
 * worth looking at before publishing.
 */
export interface ReviewIssue {
  /** JSON pointer into the scenario, e.g. "/units/3/lat" */
  path: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  fix?: string;
  /** What to select in the editor to fix it */
  selection?: Selection;
}

export interface ScenarioReport {
  ok: boolean;
  issues: ReviewIssue[];
  /** Counts for a one-line summary */
  counts: { error: number; warn: number; info: number };
}

const KIND_BY_LIST: Record<string, Selection['kind']> = {
  units: 'unit',
  arrows: 'arrow',
  territories: 'territory',
  strikes: 'strike',
  labels: 'label',
  keyframes: 'keyframe',
};

/**
 * The object a JSON pointer refers to, so the editor can select it and fly
 * the camera there. Accepts both "/units/3/lat" and "/units/u_tank/appearAt",
 * which is how the resolver reports problems it found by id.
 */
export function selectionForPath(s: Scenario, path: string): Selection | undefined {
  const m = /^\/?(?:scenario\/)?(units|arrows|territories|strikes|labels|keyframes)\/([^/]+)/.exec(path);
  if (!m) return undefined;
  const kind = KIND_BY_LIST[m[1]];
  const list = (s as unknown as Record<string, { id: string }[]>)[m[1]] ?? [];
  const byIndex = /^\d+$/.test(m[2]) ? list[Number(m[2])] : undefined;
  const item = byIndex ?? list.find((x) => x.id === m[2]);
  return item ? { kind, id: item.id } : undefined;
}

/** Pull any quoted id out of a free-text message, for issues with no path. */
function selectionFromMessage(s: Scenario, message: string): Selection | undefined {
  for (const quoted of message.matchAll(/"([^"]+)"/g)) {
    const id = quoted[1];
    for (const [list, kind] of Object.entries(KIND_BY_LIST)) {
      const items = (s as unknown as Record<string, { id: string; name?: string }[]>)[list] ?? [];
      const found = items.find((x) => x.id === id || x.name === id);
      if (found) return { kind, id: found.id };
    }
  }
  return undefined;
}

/**
 * Everything worth saying about a resolved scenario: reference and timing
 * errors, physical plausibility, unknown icons, and how it reads on screen.
 */
export function reviewScenario(s: Scenario, roster: RosterEntry[] = [], duration = s.duration): ScenarioReport {
  const issues: ReviewIssue[] = [];

  for (const message of scenarioErrors(s, duration)) {
    // scenarioErrors messages start with the path
    const path = message.split(' ')[0];
    issues.push({
      path,
      message,
      severity: 'error',
      selection: selectionForPath(s, path) ?? selectionFromMessage(s, message),
    });
  }
  for (const message of iconFallbacks(s, roster)) {
    issues.push({ path: '/units', message, severity: 'warn', selection: selectionFromMessage(s, message) });
  }
  for (const message of realismWarnings({ ...s, duration })) {
    issues.push({ path: '/strikes', message, severity: 'warn', selection: selectionFromMessage(s, message) });
  }
  for (const f of lintScenario(s, duration)) {
    issues.push({
      path: f.path,
      message: f.message,
      severity: f.severity,
      fix: f.fix,
      selection: selectionForPath(s, f.path) ?? selectionFromMessage(s, f.message),
    });
  }

  const order = { error: 0, warn: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = {
    error: issues.filter((i) => i.severity === 'error').length,
    warn: issues.filter((i) => i.severity === 'warn').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
  return { ok: counts.error === 0, issues, counts };
}

/** One line per issue, for the console and the command line. */
export function reportLines(report: ScenarioReport): string[] {
  return report.issues.map((i) => `${i.severity.toUpperCase()} ${i.path} ${i.message}${i.fix ? ` — ${i.fix}` : ''}`);
}

export type { LintFinding };
