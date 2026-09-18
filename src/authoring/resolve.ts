import { PERIODS, eraForPeriod, isPeriod, type Period } from '../eras';
import type { LngLat } from '../geo';
import { MOVE_PROFILE, metersBetween } from '../realism';
import type {
  Arrow,
  Faction,
  Keyframe,
  MapLabel,
  RosterEntry,
  Scenario,
  StatusEffect,
  Strike,
  Territory,
  Unit,
} from '../types';
import { composeKeyframes, frameFor, type ResolvedBeat } from './autoCamera';
import { destination } from './frame';
import { defaultStrikeSize, expandMacro, type PointResolver, type ResolvedPoint } from './macros';
import { evalTimeExpr, type TimeAnchor } from './time';
import type {
  AuthoredArrow,
  AuthoredKeyframe,
  AuthoredLabel,
  AuthoredScenario,
  AuthoredStrike,
  AuthoredTerritory,
  AuthoredUnit,
  AuthoringDocument,
  Beat,
  ContentPack,
  Macro,
  PointRef,
  TimeExpr,
} from './types';

/**
 * Resolution: an authoring document in, a plain scenario out.
 *
 * Positions and times are resolved to a fixed point, because either may be
 * expressed in terms of the other ("1 km east of the bridge", "four seconds
 * before the strike lands"), and macros may place the very things later
 * references point at. Each pass resolves whatever it now can; the loop stops
 * when a pass changes nothing, and anything still unresolved is reported by
 * name so the author knows exactly what to define.
 */

export interface ResolvedFile {
  format: 'conflict-sandbox-scenario';
  version: number;
  exportedAt: string;
  duration: number;
  roster: RosterEntry[];
  scenario: Scenario;
}

export interface ResolveResult {
  /** The plain scenario file, or null when resolution failed */
  file: ResolvedFile | null;
  errors: string[];
  /** Everything that was filled in or adjusted, for the author to review */
  notes: string[];
  /** True when the document used any authoring feature at all */
  usedAuthoring: boolean;
}

export interface ResolveOptions {
  /** Loads a content pack by reference: "modern/nato", or any URL */
  loadPack?: (ref: string) => Promise<ContentPack | null>;
  /** Pull in the packs the document's period declares (default true) */
  includePeriodPacks?: boolean;
}

const MAX_PASSES = 12;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Does this document use anything the resolver has to expand? */
export function hasAuthoringSugar(doc: unknown): boolean {
  if (!isObj(doc)) return false;
  const scenario = isObj(doc.scenario) ? doc.scenario : doc;
  if (Array.isArray(doc.include) || isObj(doc.places)) return true;
  if (!isObj(scenario)) return false;
  if (scenario.keyframes === 'auto' || Array.isArray(scenario.beats) || Array.isArray(scenario.macros)) return true;
  if (isObj(scenario.places) || typeof scenario.period === 'string') return true;
  const lists = ['units', 'arrows', 'strikes', 'labels', 'territories', 'effects', 'keyframes'] as const;
  for (const key of lists) {
    const list = scenario[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!isObj(item)) continue;
      if ('at' in item || 'near' in item || 'via' in item) return true;
      for (const field of ['appearAt', 'destroyedAt', 'leavesAt', 'captureAt', 'launchAt', 'start', 'time']) {
        if (typeof item[field] === 'string') return true;
      }
      if (Array.isArray(item.times) && item.times.some((t) => typeof t === 'string')) return true;
      // a keyframe that leaves the camera to the composer
      if (key === 'keyframes' && (item.lat === undefined || item.zoom === undefined)) return true;
      // a unit or strike with no coordinates at all
      if ((key === 'units' || key === 'strikes' || key === 'labels') && item.lat === undefined) return true;
    }
  }
  return false;
}

/** Longest route time that still looks like movement rather than a teleport. */
function routeDuration(points: LngLat[], type: Unit['type'] = 'infantry'): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += metersBetween(points[i - 1], points[i]);
  const seconds = (m / 1000 / (MOVE_PROFILE[type].kph * 20)) * 3600;
  return Math.max(5, Math.min(40, Math.round(seconds * 10) / 10));
}

export async function resolveAuthoring(input: unknown, opts: ResolveOptions = {}): Promise<ResolveResult> {
  const errors: string[] = [];
  const notes: string[] = [];
  const usedAuthoring = hasAuthoringSugar(input);

  if (!isObj(input)) return { file: null, errors: ['The document is not a JSON object.'], notes, usedAuthoring };
  const doc = input as unknown as AuthoringDocument;
  const wrapped = isObj((input as Record<string, unknown>).scenario);
  const scenario = (wrapped ? doc.scenario : (input as unknown as AuthoredScenario)) as AuthoredScenario | undefined;
  if (!scenario || !isObj(scenario)) {
    return { file: null, errors: ['No scenario found in the document.'], notes, usedAuthoring };
  }

  const period: Period | undefined = isPeriod(scenario.period) ? scenario.period : undefined;
  if (scenario.period !== undefined && !period) {
    errors.push(`/scenario/period "${String(scenario.period)}" is not a known period (${Object.keys(PERIODS).join(', ')})`);
  }

  // ---- content packs -------------------------------------------------------
  const packRefs = [
    ...(opts.includePeriodPacks === false || !period ? [] : PERIODS[period].packs),
    ...(doc.include ?? []),
  ];
  const packs: ContentPack[] = [];
  for (const ref of [...new Set(packRefs)]) {
    if (!opts.loadPack) continue;
    try {
      const pack = await opts.loadPack(ref);
      if (pack) packs.push(pack);
      else if (doc.include?.includes(ref)) errors.push(`/include "${ref}" could not be loaded`);
    } catch (e) {
      if (doc.include?.includes(ref)) errors.push(`/include "${ref}" could not be loaded: ${(e as Error).message}`);
    }
  }
  for (const pack of packs) {
    if (period && pack.period !== period) {
      notes.push(`Pack "${pack.id}" is ${PERIODS[pack.period]?.label ?? pack.period} content in a ${PERIODS[period].label} scenario.`);
    }
  }

  // ---- places --------------------------------------------------------------
  const places = new Map<string, LngLat>();
  for (const pack of packs) for (const [k, v] of Object.entries(pack.places ?? {})) places.set(k, v);
  for (const [k, v] of Object.entries(doc.places ?? {})) places.set(k, v);
  for (const [k, v] of Object.entries(scenario.places ?? {})) places.set(k, v);

  // ---- working copies ------------------------------------------------------
  const units: AuthoredUnit[] = (scenario.units ?? []).map((u) => ({ ...u }));
  const arrows: AuthoredArrow[] = (scenario.arrows ?? []).map((a) => ({ ...a }));
  const strikes: AuthoredStrike[] = (scenario.strikes ?? []).map((x) => ({ ...x }));
  const labels: AuthoredLabel[] = (scenario.labels ?? []).map((l) => ({ ...l }));
  const territories: AuthoredTerritory[] = (scenario.territories ?? []).map((t) => ({ ...t }));
  const effects = (scenario.effects ?? []).map((e) => ({ ...e }));
  const macros: Macro[] = [...(scenario.macros ?? [])];
  const authoredKeyframes: AuthoredKeyframe[] = Array.isArray(scenario.keyframes)
    ? scenario.keyframes.map((k) => ({ ...k }))
    : [];
  const authoredBeats: Beat[] = scenario.beats ?? [];

  const factions: Faction[] = scenario.factions?.length
    ? scenario.factions
    : packs.flatMap((p) => p.factions ?? []);
  if (!factions.length) errors.push('/scenario/factions needs at least one faction');

  // ---- positions and macros ------------------------------------------------
  const placed = new Map<string, LngLat>();
  const unitIds = new Set<string>();

  const lookup = (id: string): ResolvedPoint | null => {
    const bare = id.replace(/\.(start|end)$/, '');
    const suffix = id.endsWith('.end') ? 'end' : id.endsWith('.start') ? 'start' : null;
    const arrow = arrows.find((a) => a.id === bare);
    if (arrow?.points?.length) {
      const pts = arrow.points;
      return { point: suffix === 'end' ? pts[pts.length - 1] : pts[0] };
    }
    const p = placed.get(bare);
    if (p) return { point: p, ...(unitIds.has(bare) ? { unitId: bare } : {}) };
    const place = places.get(id) ?? places.get(bare);
    return place ? { point: place } : null;
  };

  const resolvePoint: PointResolver = (ref: PointRef): ResolvedPoint | null => {
    if (Array.isArray(ref)) return { point: [ref[0], ref[1]] };
    if (typeof ref === 'string') return lookup(ref);
    if (isObj(ref) && typeof ref.of === 'string') {
      const anchor = lookup(ref.of);
      if (!anchor) return null;
      return { point: destination(anchor.point, ref.bearingDeg ?? 0, ref.km ?? 0.5) };
    }
    return null;
  };

  const placeable = [
    ...units.map((u) => ({ kind: 'unit' as const, item: u as AuthoredUnit & { lat?: number; lng?: number } })),
    ...strikes.map((x) => ({ kind: 'strike' as const, item: x as AuthoredStrike & { lat?: number; lng?: number } })),
    ...labels.map((l) => ({ kind: 'label' as const, item: l as AuthoredLabel & { lat?: number; lng?: number } })),
  ];
  const pendingPoints = new Set(placeable.map((p) => p.item.id));
  const pendingRings = new Set([...arrows, ...territories].filter((a) => !a.points?.length).map((a) => a.id));
  const pendingMacros = new Set(macros.map((m) => m.id));
  const macroById = new Map(macros.map((m) => [m.id, m]));
  const pointFailures = new Map<string, string>();

  for (let pass = 0; pass < MAX_PASSES && (pendingPoints.size || pendingRings.size || pendingMacros.size); pass++) {
    let progress = false;

    for (const { item } of placeable) {
      if (!pendingPoints.has(item.id)) continue;
      if (typeof item.lat === 'number' && typeof item.lng === 'number') {
        placed.set(item.id, [item.lng, item.lat]);
        if (units.some((u) => u.id === item.id)) unitIds.add(item.id);
        pendingPoints.delete(item.id);
        progress = true;
        continue;
      }
      const ref: PointRef | null = item.near ? item.near : item.at ? item.at : null;
      if (!ref) {
        pointFailures.set(item.id, 'has no lat/lng, "at" or "near"');
        pendingPoints.delete(item.id);
        continue;
      }
      const found = resolvePoint(ref);
      if (!found) {
        pointFailures.set(item.id, `cannot place: "${typeof ref === 'string' ? ref : ref.of}" is not a place or a placed object`);
        continue;
      }
      pointFailures.delete(item.id);
      item.lat = Number(found.point[1].toFixed(6));
      item.lng = Number(found.point[0].toFixed(6));
      delete item.at;
      delete item.near;
      placed.set(item.id, [item.lng, item.lat]);
      if (units.some((u) => u.id === item.id)) unitIds.add(item.id);
      pendingPoints.delete(item.id);
      progress = true;
    }

    for (const shape of [...arrows, ...territories]) {
      if (!pendingRings.has(shape.id)) continue;
      const via = (shape as AuthoredArrow).via;
      if (!via?.length) {
        pointFailures.set(shape.id, 'has neither "points" nor "via"');
        pendingRings.delete(shape.id);
        continue;
      }
      const points: [number, number][] = [];
      let missing: string | null = null;
      for (const ref of via) {
        const found = resolvePoint(ref);
        if (!found) {
          missing = typeof ref === 'string' ? ref : isObj(ref) ? String(ref.of) : JSON.stringify(ref);
          break;
        }
        points.push([Number(found.point[0].toFixed(6)), Number(found.point[1].toFixed(6))]);
      }
      if (missing) {
        pointFailures.set(shape.id, `cannot build its path: "${missing}" is not a place or a placed object`);
        continue;
      }
      pointFailures.delete(shape.id);
      shape.points = points;
      delete (shape as AuthoredArrow).via;
      pendingRings.delete(shape.id);
      progress = true;
    }

    for (const id of [...pendingMacros]) {
      const macro = macroById.get(id)!;
      const result = expandMacro(macro, resolvePoint);
      if (!result.ok) {
        if ('error' in result) {
          errors.push(`/scenario/macros "${id}": ${result.error}`);
          pendingMacros.delete(id);
        } else {
          pointFailures.set(id, `cannot expand: "${result.pending}" is not a place or a placed object`);
        }
        continue;
      }
      pointFailures.delete(id);
      for (const u of result.out.units) {
        units.push(u);
        placeable.push({ kind: 'unit', item: u });
        pendingPoints.add(u.id);
      }
      for (const a of result.out.arrows) arrows.push(a);
      for (const x of result.out.strikes) {
        strikes.push(x);
        placeable.push({ kind: 'strike', item: x });
        pendingPoints.add(x.id);
      }
      pendingMacros.delete(id);
      notes.push(
        `Macro "${id}" expanded into ${result.out.units.length} units, ${result.out.arrows.length} routes and ${result.out.strikes.length} strikes.`,
      );
      progress = true;
    }

    if (!progress) break;
  }

  for (const id of [...pendingPoints, ...pendingRings, ...pendingMacros]) {
    errors.push(`"${id}" ${pointFailures.get(id) ?? 'could not be placed'}`);
  }

  // a keyframe may name where to look instead of giving coordinates; one that
  // says nothing is framed later by the composer
  for (const k of authoredKeyframes) {
    const ref: PointRef | undefined = k.near ?? k.at;
    if (!ref) continue;
    const found = resolvePoint(ref);
    if (!found) {
      errors.push(`/keyframes/${k.id} looks at "${typeof ref === 'string' ? ref : ref.of}", which is not a place or a placed object`);
      continue;
    }
    k.lng = k.lng ?? Number(found.point[0].toFixed(6));
    k.lat = k.lat ?? Number(found.point[1].toFixed(6));
    delete k.at;
    delete k.near;
  }

  // ---- times ---------------------------------------------------------------
  let duration = typeof doc.duration === 'number' && doc.duration > 0 ? doc.duration : scenario.duration;
  const anchors = new Map<string, TimeAnchor>();
  const timeFailures = new Map<string, string>();
  // every id in the document, so "u_heli-2" (an id) is told apart from
  // "s_hit-2" (two seconds before a strike)
  const knownIds = new Set<string>([
    ...units.map((u) => u.id),
    ...arrows.map((a) => a.id),
    ...strikes.map((x) => x.id),
    ...labels.map((l) => l.id),
    ...territories.map((t) => t.id),
    ...effects.map((e) => e.id),
    ...authoredKeyframes.map((k) => k.id),
    ...authoredBeats.map((b, i) => b.id ?? `beat_${i + 1}`),
  ]);

  /** Resolve one expression, recording why it could not be resolved yet. */
  const at = (owner: string, path: string, v: TimeExpr | undefined, fallback?: number): number | undefined | 'pending' => {
    if (v === undefined) return fallback;
    const result = evalTimeExpr(v, anchors, duration, knownIds);
    if (result.ok) return result.value;
    if ('missing' in result) {
      timeFailures.set(owner, `${path} refers to "${result.missing}", which is not an id in this scenario`);
      return 'pending';
    }
    errors.push(`${path} ${result.error}`);
    return fallback;
  };

  interface Timed {
    id: string;
    resolve: () => TimeAnchor | 'pending';
  }

  const beats: ResolvedBeat[] = [];

  const timed: Timed[] = [
    ...units.map((u) => ({
      id: u.id,
      resolve: (): TimeAnchor | 'pending' => {
        const appear = at(u.id, `/units/${u.id}/appearAt`, u.appearAt, 0);
        if (appear === 'pending') return 'pending';
        // an object's own later times may hang off its start ("u_tank+20")
        anchors.set(u.id, { start: appear ?? 0, end: appear ?? 0 });
        const destroyed = at(u.id, `/units/${u.id}/destroyedAt`, u.destroyedAt);
        const leaves = at(u.id, `/units/${u.id}/leavesAt`, u.leavesAt);
        const capture = at(u.id, `/units/${u.id}/captureAt`, u.captureAt);
        if (destroyed === 'pending' || leaves === 'pending' || capture === 'pending') return 'pending';
        u.appearAt = appear ?? 0;
        // absent stays absent: writing undefined would add empty keys to the
        // plain scenario the editor then round-trips
        if (destroyed === undefined) delete u.destroyedAt;
        else u.destroyedAt = destroyed;
        if (leaves === undefined) delete u.leavesAt;
        else u.leavesAt = leaves;
        if (capture === undefined) delete u.captureAt;
        else u.captureAt = capture;
        return { start: u.appearAt as number, end: (destroyed ?? leaves ?? u.appearAt) as number };
      },
    })),
    ...arrows.map((a) => ({
      id: a.id,
      resolve: (): TimeAnchor | 'pending' => {
        const appear = at(a.id, `/arrows/${a.id}/appearAt`, a.appearAt, 0);
        if (appear === 'pending') return 'pending';
        anchors.set(a.id, { start: appear ?? 0, end: appear ?? 0 });
        const times: number[] = [];
        for (const [i, t] of (a.times ?? []).entries()) {
          const v = at(a.id, `/arrows/${a.id}/times/${i}`, t);
          if (v === 'pending') return 'pending';
          if (v !== undefined) times.push(v);
        }
        const follower = units.find((u) => u.arrowId === a.id);
        const duration_ =
          a.duration ?? (times.length ? times[times.length - 1] - times[0] : routeDuration(a.points ?? [], follower?.type));
        if (a.duration === undefined) {
          notes.push(`Route "${a.name || a.id}" was given a ${duration_}s duration from its length.`);
        }
        a.appearAt = appear ?? 0;
        a.duration = duration_;
        if (times.length) a.times = times;
        return { start: a.appearAt as number, end: (a.appearAt as number) + duration_ };
      },
    })),
    ...strikes.map((x) => ({
      id: x.id,
      resolve: (): TimeAnchor | 'pending' => {
        const impact = at(x.id, `/strikes/${x.id}/appearAt`, x.appearAt);
        if (impact === 'pending') return 'pending';
        if (impact === undefined) {
          errors.push(`/strikes/${x.id}/appearAt is required (the time the strike lands)`);
          return { start: 0, end: 0 };
        }
        // "launchAt": "s_hit-8" is the natural way to write a flight time
        anchors.set(x.id, { start: impact, end: impact });
        const launch = at(x.id, `/strikes/${x.id}/launchAt`, x.launchAt);
        if (launch === 'pending') return 'pending';
        x.appearAt = impact;
        if (launch === undefined) delete x.launchAt;
        else x.launchAt = launch;
        if (x.size === undefined) x.size = defaultStrikeSize(x.name);
        // a strike's time is when it lands: "s_hit-4" is four seconds before impact
        return { start: impact, end: impact };
      },
    })),
    ...labels.map((l) => ({
      id: l.id,
      resolve: (): TimeAnchor | 'pending' => {
        const appear = at(l.id, `/labels/${l.id}/appearAt`, l.appearAt, 0);
        if (appear === 'pending') return 'pending';
        l.appearAt = appear ?? 0;
        if (l.size === undefined) l.size = 12;
        if (l.color === undefined) l.color = '#1c1f22';
        return { start: l.appearAt as number, end: l.appearAt as number };
      },
    })),
    ...territories.map((t) => ({
      id: t.id,
      resolve: (): TimeAnchor | 'pending' => {
        const appear = at(t.id, `/territories/${t.id}/appearAt`, t.appearAt, 0);
        if (appear === 'pending') return 'pending';
        t.appearAt = appear ?? 0;
        if (t.duration === undefined) t.duration = 2;
        return { start: t.appearAt as number, end: (t.appearAt as number) + (t.duration as number) };
      },
    })),
    ...effects.map((e) => ({
      id: e.id,
      resolve: (): TimeAnchor | 'pending' => {
        const start = at(e.id, `/effects/${e.id}/start`, e.start, 0);
        if (start === 'pending') return 'pending';
        e.start = start ?? 0;
        return { start: e.start as number, end: (e.start as number) + e.duration };
      },
    })),
    ...authoredKeyframes.map((k) => ({
      id: k.id,
      resolve: (): TimeAnchor | 'pending' => {
        const time = at(k.id, `/keyframes/${k.id}/time`, k.time, 0);
        if (time === 'pending') return 'pending';
        k.time = time ?? 0;
        return { start: k.time as number, end: k.time as number };
      },
    })),
    ...authoredBeats.map((b: Beat, i: number) => ({
      id: b.id ?? `beat_${i + 1}`,
      resolve: (): TimeAnchor | 'pending' => {
        const time = at(b.id ?? `beat_${i + 1}`, `/scenario/beats/${i}/at`, b.at);
        if (time === 'pending') return 'pending';
        return { start: time ?? 0, end: time ?? 0 };
      },
    })),
  ];

  const pendingTimes = new Set(timed.map((t) => t.id));
  for (let pass = 0; pass < MAX_PASSES && pendingTimes.size; pass++) {
    let progress = false;
    for (const entry of timed) {
      if (!pendingTimes.has(entry.id)) continue;
      const result = entry.resolve();
      if (result === 'pending') continue;
      timeFailures.delete(entry.id);
      anchors.set(entry.id, result);
      pendingTimes.delete(entry.id);
      progress = true;
    }
    if (!progress) break;
  }
  for (const id of pendingTimes) {
    errors.push(timeFailures.get(id) ?? `"${id}" has a time that could not be resolved (check for a circular reference)`);
  }

  // beats carry their resolved times into the composer
  authoredBeats.forEach((b, i) => {
    const anchor = anchors.get(b.id ?? `beat_${i + 1}`);
    beats.push({ ...b, at: b.at === undefined ? undefined : anchor?.start });
  });

  if (errors.length) return { file: null, errors, notes, usedAuthoring };

  // ---- the plain scenario --------------------------------------------------
  const plainUnits = units as unknown as Unit[];
  const plainArrows = arrows as unknown as Arrow[];
  const plainStrikes = strikes as unknown as Strike[];
  const plainLabels = labels as unknown as MapLabel[];
  const plainTerritories = territories as unknown as Territory[];
  const plainEffects = effects as unknown as StatusEffect[];

  const base: Scenario = {
    name: scenario.name ?? 'Untitled scenario',
    factions,
    units: plainUnits,
    arrows: plainArrows,
    territories: plainTerritories,
    labels: plainLabels,
    strikes: plainStrikes,
    keyframes: [],
    effects: plainEffects,
    environment: scenario.environment,
    narrationPack: scenario.narrationPack,
    subtitle: scenario.subtitle,
    sources: scenario.sources,
    article: scenario.article,
    era: scenario.era ?? (period ? eraForPeriod(period) : undefined),
    period,
    aerial: scenario.aerial,
  };

  // ---- the camera ----------------------------------------------------------
  const auto = scenario.keyframes === 'auto' || (!authoredKeyframes.length && beats.length > 0);
  if (auto) {
    const composed = composeKeyframes(base, beats, duration);
    base.keyframes = composed.keyframes;
    duration = composed.duration;
    notes.push(...composed.notes);
  } else {
    base.keyframes = authoredKeyframes.map((k, i) => completeKeyframe(base, k, i, notes));
  }

  if (duration === undefined) {
    const last = Math.max(
      0,
      ...base.keyframes.map((k) => k.time),
      ...plainUnits.map((u) => u.destroyedAt ?? u.appearAt),
      ...plainStrikes.map((x) => x.appearAt),
      ...plainArrows.map((a) => a.appearAt + a.duration),
    );
    duration = Math.max(10, Math.round((last + 3) * 10) / 10);
    notes.push(`Duration set to ${duration}s from the last event in the scenario.`);
  }
  base.duration = duration;

  // roster: what the document brought, plus the pack entries its units use
  const usedRoster = new Set(plainUnits.map((u) => u.rosterId).filter(Boolean) as string[]);
  const roster: RosterEntry[] = [...(doc.roster ?? [])];
  for (const pack of packs) {
    for (const entry of pack.roster ?? []) {
      if (usedRoster.has(entry.id) && !roster.some((r) => r.id === entry.id)) roster.push(entry);
    }
  }

  return {
    file: {
      format: 'conflict-sandbox-scenario',
      version: 1,
      exportedAt: new Date().toISOString(),
      duration,
      roster,
      scenario: base,
    },
    errors,
    notes,
    usedAuthoring,
  };
}

/** Fill in whatever camera fields a partially written keyframe left out. */
function completeKeyframe(s: Scenario, k: AuthoredKeyframe, index: number, notes: string[]): Keyframe {
  const time = (k.time as number) ?? 0;
  const needsFraming = k.lat === undefined || k.lng === undefined || k.zoom === undefined;
  const focus = k.highlightUnitIds ?? (k.followUnitId ? [k.followUnitId] : undefined);
  const pose = needsFraming ? frameFor(s, focus, time, index === 0 ? 'establish' : 'action') : null;
  if (pose) {
    notes.push(`Keyframe "${k.id}" was framed automatically${focus?.length ? ` on ${focus.join(', ')}` : ''}.`);
  }
  const { at: _at, near: _near, ...rest } = k;
  return {
    ...(rest as unknown as Keyframe),
    time,
    lng: k.lng ?? pose?.lng ?? 0,
    lat: k.lat ?? pose?.lat ?? 0,
    zoom: k.zoom ?? pose?.zoom ?? 12,
    pitch: k.pitch ?? pose?.pitch ?? 45,
    bearing: k.bearing ?? pose?.bearing ?? 0,
    caption: k.caption ?? '',
  };
}
