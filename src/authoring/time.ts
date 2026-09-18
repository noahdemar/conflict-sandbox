import type { TimeExpr } from './types';

/**
 * Relative time expressions. An author writes when something happens in terms
 * of something else — "two seconds after the missile lands", "when the column
 * finishes its route" — and never has to re-time a document by hand again.
 *
 *   12          twelve seconds
 *   "start"     zero
 *   "end"       the end of the timeline
 *   "u_heli"    when that object starts (appearAt / time / start / launch)
 *   "a_tank.end"  when it ends (route end, impact, effect end)
 *   "s_hit-4"   four seconds before that strike lands
 */

/** When each object starts and ends, in timeline seconds. */
export interface TimeAnchor {
  start: number;
  end: number;
}

export interface ParsedTime {
  /** Absolute seconds, when the expression was just a number */
  literal?: number;
  /** Id of the object (or "start"/"end") the expression hangs off */
  anchor?: string;
  field: 'start' | 'end';
  offset: number;
}

const EXPR = /^\s*([A-Za-z_][\w-]*?)(\.(start|end))?\s*(([+-])\s*(\d+(?:\.\d+)?))?\s*$/;

/**
 * Parse a time expression. Returns null when the text is not a time at all.
 *
 * Ids may contain hyphens ("binladen-heli-2"), so "a-2" is ambiguous: it could
 * be that id, or two seconds before "a". `known` settles it — an id that
 * exists wins, otherwise the trailing offset is split off.
 */
export function parseTimeExpr(v: TimeExpr, known?: ReadonlySet<string>): ParsedTime | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { literal: v, field: 'start', offset: 0 } : null;
  const text = v.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return { literal: Number(text), field: 'start', offset: 0 };
  const whole = /^([A-Za-z_][\w-]*)(\.(start|end))?$/.exec(text);
  if (whole && (whole[1] === 'start' || whole[1] === 'end' || known?.has(whole[1]))) {
    return { anchor: whole[1], field: (whole[3] as 'start' | 'end') ?? 'start', offset: 0 };
  }
  const m = EXPR.exec(text);
  if (!m) return null;
  const offset = m[4] ? Number(`${m[5]}${m[6]}`) : 0;
  return { anchor: m[1], field: (m[3] as 'start' | 'end') ?? 'start', offset };
}

/** Shift a time expression by `delta` seconds, keeping it relative if it was. */
export function offsetExpr(v: TimeExpr, delta: number): TimeExpr {
  if (!delta) return v;
  const parsed = parseTimeExpr(v);
  if (!parsed) return v;
  if (parsed.literal !== undefined) return Number((parsed.literal + delta).toFixed(3));
  const total = Number((parsed.offset + delta).toFixed(3));
  const field = parsed.field === 'end' ? '.end' : '';
  return `${parsed.anchor}${field}${total === 0 ? '' : total > 0 ? `+${total}` : total}`;
}

export type TimeResult =
  | { ok: true; value: number }
  | { ok: false; missing: string }
  | { ok: false; error: string };

/**
 * Evaluate an expression against the anchors resolved so far. `known` is every
 * id in the document, which is how an id with a hyphen is told apart from an
 * offset (see parseTimeExpr).
 */
export function evalTimeExpr(
  v: TimeExpr,
  anchors: Map<string, TimeAnchor>,
  duration?: number,
  known?: ReadonlySet<string>,
): TimeResult {
  const parsed = parseTimeExpr(v, known);
  if (!parsed) return { ok: false, error: `"${String(v)}" is not a time; use seconds or an expression like "s_hit-4"` };
  if (parsed.literal !== undefined) return { ok: true, value: parsed.literal };
  const anchor = parsed.anchor!;
  if (anchor === 'start') return { ok: true, value: parsed.offset };
  if (anchor === 'end') {
    if (duration === undefined) {
      return { ok: false, error: '"end" needs an explicit "duration" on the document' };
    }
    return { ok: true, value: duration + parsed.offset };
  }
  const found = anchors.get(anchor);
  if (!found) return { ok: false, missing: anchor };
  return { ok: true, value: found[parsed.field] + parsed.offset };
}
