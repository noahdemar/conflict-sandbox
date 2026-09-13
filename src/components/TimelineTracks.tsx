import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { STATUS_META } from '../statusEffects';
import type { Arrow, StatusEffect, Strike, Unit } from '../types';

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  mode: DragMode;
  x0: number;
  /** Applies a time delta (seconds, already snapped) relative to drag start */
  apply: (dt: number) => void;
}

const LANE = 16;

interface BarProps {
  id: string;
  from: number;
  to: number;
  lane: number;
  className: string;
  color: string;
  label: string;
  title: string;
  duration: number;
  selected?: boolean;
  hovered?: boolean;
  onHover: (id: string | null) => void;
  onDrag: (mode: DragMode) => (e: React.PointerEvent) => void;
}

/** A draggable bar with resize handles on both ends (module-level so it isn't remounted mid-drag). */
function Bar(props: BarProps) {
  const clamp = (t: number) => Math.min(props.duration, Math.max(0, t));
  const left = (clamp(props.from) / props.duration) * 100;
  const width = ((clamp(props.to) - clamp(props.from)) / props.duration) * 100;
  return (
    <div
      className={`trk-bar ${props.className} ${props.selected ? 'sel' : ''} ${props.hovered ? 'hover' : ''}`}
      style={{ left: `${left}%`, width: `${width}%`, top: props.lane * LANE + 2, ['--bc' as string]: props.color }}
      title={props.title}
      onPointerDown={props.onDrag('move')}
      onPointerEnter={() => props.onHover(props.id)}
      onPointerLeave={() => props.onHover(null)}
    >
      <i className="trk-handle l" onPointerDown={props.onDrag('start')} />
      <span>{props.label}</span>
      <i className="trk-handle r" onPointerDown={props.onDrag('end')} />
    </div>
  );
}

/**
 * Per-unit timeline tracks. Every bar is draggable: move to shift timing,
 * pull an edge to change start/end. Snaps to 0.1s (hold Shift for 1s).
 */
export default function TimelineTracks({ onClose }: { onClose: () => void }) {
  const scenario = useStore((s) => s.scenario);
  const duration = useStore((s) => s.duration);
  const time = useStore((s) => s.time);
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const pct = (t: number) => `${(Math.min(duration, Math.max(0, t)) / duration) * 100}%`;

  const secondsPerPx = () => duration / Math.max(1, areaRef.current?.getBoundingClientRect().width ?? 1);

  const beginDrag = (e: React.PointerEvent, mode: DragMode, apply: (dt: number) => void, select?: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select?.();
    st().setPersistPaused(true);
    drag.current = { mode, x0: e.clientX, apply };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const step = e.shiftKey ? 1 : 0.1;
    const raw = (e.clientX - d.x0) * secondsPerPx();
    d.apply(Math.round(raw / step) * step);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    st().setPersistPaused(false);
  };

  const scrubTo = (e: React.PointerEvent) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    st().setCameraLock(true);
    st().setTime(Math.round(((e.clientX - r.left) / r.width) * duration * 10) / 10);
  };

  const r1 = (v: number) => Math.round(v * 10) / 10;

  // ----- drag handlers, each captures the original values at drag start -----
  const dragUnitLife = (u: Unit, mode: DragMode) => (e: React.PointerEvent) => {
    const a0 = u.appearAt;
    const d0 = u.destroyedAt;
    beginDrag(
      e,
      mode,
      (dt) => {
        if (mode === 'start') {
          const limit = d0 !== undefined ? d0 - 0.5 : duration;
          st().updateUnit(u.id, { appearAt: r1(Math.min(limit, Math.max(0, a0 + dt))) });
        } else if (mode === 'end') {
          const base = d0 ?? duration;
          const v = r1(Math.max(a0 + 0.5, base + dt));
          st().updateUnit(u.id, { destroyedAt: v >= duration ? undefined : v });
        } else {
          const span = (d0 ?? duration) - a0;
          const na = r1(Math.max(0, a0 + dt));
          st().updateUnit(u.id, {
            appearAt: na,
            ...(d0 !== undefined ? { destroyedAt: r1(Math.min(duration, na + span)) } : {}),
          });
        }
      },
      () => st().setSelection({ kind: 'unit', id: u.id }),
    );
  };

  const dragRoute = (a: Arrow, mode: DragMode) => (e: React.PointerEvent) => {
    const s0 = a.appearAt;
    const len0 = a.duration;
    beginDrag(
      e,
      mode,
      (dt) => {
        if (mode === 'end') st().updateArrow(a.id, { duration: r1(Math.max(0.5, len0 + dt)) });
        else if (mode === 'start') {
          const ns = r1(Math.min(s0 + len0 - 0.5, Math.max(0, s0 + dt)));
          st().updateArrow(a.id, { appearAt: ns, duration: r1(len0 - (ns - s0)) });
        } else st().updateArrow(a.id, { appearAt: r1(Math.max(0, s0 + dt)) });
      },
      () => st().setSelection({ kind: 'arrow', id: a.id }),
    );
  };

  const dragStrike = (x: Strike, mode: DragMode) => (e: React.PointerEvent) => {
    const imp0 = x.appearAt;
    const l0 = x.launchAt ?? x.appearAt - 3;
    beginDrag(
      e,
      mode,
      (dt) => {
        if (mode === 'start') st().updateStrike(x.id, { launchAt: r1(Math.min(imp0 - 0.2, Math.max(0, l0 + dt))) });
        else if (mode === 'end') st().updateStrike(x.id, { appearAt: r1(Math.max(l0 + 0.2, imp0 + dt)) });
        else {
          const shift = Math.max(-l0, dt);
          st().updateStrike(x.id, { launchAt: r1(l0 + shift), appearAt: r1(imp0 + shift) });
        }
      },
      () => st().setSelection({ kind: 'strike', id: x.id }),
    );
  };

  const dragEffect = (fx: StatusEffect, mode: DragMode) => (e: React.PointerEvent) => {
    const s0 = fx.start;
    const d0 = fx.duration;
    beginDrag(
      e,
      mode,
      (dt) => {
        if (mode === 'end') st().updateEffect(fx.id, { duration: r1(Math.max(0.5, d0 + dt)) });
        else if (mode === 'start') {
          const ns = r1(Math.min(s0 + d0 - 0.5, Math.max(0, s0 + dt)));
          st().updateEffect(fx.id, { start: ns, duration: r1(d0 - (ns - s0)) });
        } else st().updateEffect(fx.id, { start: r1(Math.max(0, s0 + dt)) });
      },
      () => st().setSelection({ kind: 'unit', id: fx.unitId }),
    );
  };

  const factionColor = (id: string) => scenario.factions.find((f) => f.id === id)?.color ?? '#888';
  const fmt = (t: number) => `${t.toFixed(1)}s`;

  const rows = scenario.factions.map((f) => ({
    faction: f,
    units: scenario.units.filter((u) => u.factionId === f.id),
  }));
  const loose = scenario.strikes.filter((x) => !x.fromUnitId || !scenario.units.some((u) => u.id === x.fromUnitId));

  // ruler ticks every 5s (every 10s for long timelines)
  const tickStep = duration > 120 ? 20 : duration > 60 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, i) => i * tickStep);

  return (
    <div
      className="panel tl-tracks"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="trk-head">
        <div className="trk-head-label">
          Tracks
          <span className="trk-hint">Drag to retime · edges to resize · Shift snaps to 1s</span>
        </div>
        <div className="trk-ruler" ref={areaRef} onPointerDown={scrubTo}>
          {ticks.map((t) => (
            <span key={t} className="trk-tick" style={{ left: pct(t) }}>
              {t}s
            </span>
          ))}
          <div className="trk-playhead" style={{ left: pct(time) }} />
        </div>
        <button className="icon-btn" onClick={onClose} title="Close tracks">
          <X size={14} />
        </button>
      </div>

      <div className="trk-body">
        {rows.map(({ faction, units }) =>
          units.length === 0 ? null : (
            <div key={faction.id} className="trk-group">
              <div className="trk-group-name" style={{ ['--fc' as string]: faction.color }}>
                <i />
                {faction.name}
              </div>
              {units.map((u) => {
                const arrow = u.arrowId ? scenario.arrows.find((a) => a.id === u.arrowId) : undefined;
                const fired = scenario.strikes.filter((x) => x.fromUnitId === u.id);
                const fx = (scenario.effects ?? []).filter((e) => e.unitId === u.id);
                const lanes = 1 + (fired.length ? 1 : 0) + (fx.length ? 1 : 0);
                const strikeLane = 1;
                const fxLane = fired.length ? 2 : 1;
                const selUnit = selection?.kind === 'unit' && selection.id === u.id;
                return (
                  <div key={u.id} className={`trk-row ${selUnit ? 'sel' : ''}`}>
                    <button
                      className="trk-row-name"
                      onClick={() => st().setSelection({ kind: 'unit', id: u.id })}
                      title="Select unit"
                    >
                      {u.name || u.type}
                    </button>
                    <div className="trk-lanes" style={{ height: lanes * LANE + 4 }}>
                      <div className="trk-playhead" style={{ left: pct(time) }} />
                      <Bar
                          duration={duration}
                          hovered={hover === `life-${u.id}`}
                          onHover={setHover}
                        id={`life-${u.id}`}
                        from={u.appearAt}
                        to={u.destroyedAt ?? duration}
                        lane={0}
                        className={`life ${u.destroyedAt !== undefined ? 'dies' : ''}`}
                        color={factionColor(u.factionId)}
                        label=""
                        title={`On map ${fmt(u.appearAt)} → ${u.destroyedAt !== undefined ? `destroyed ${fmt(u.destroyedAt)}` : 'end'}`}
                        selected={selUnit}
                        onDrag={(m) => dragUnitLife(u, m)}
                      />
                      {arrow && (
                        <Bar
                          duration={duration}
                          hovered={hover === `route-${arrow.id}`}
                          onHover={setHover}
                          id={`route-${arrow.id}`}
                          from={arrow.appearAt}
                          to={arrow.appearAt + arrow.duration}
                          lane={0}
                          className="route"
                          color={factionColor(arrow.factionId)}
                          label={u.type === 'air' ? 'flight' : 'move'}
                          title={`${arrow.name || 'Route'} ${fmt(arrow.appearAt)} → ${fmt(arrow.appearAt + arrow.duration)}`}
                          selected={selection?.kind === 'arrow' && selection.id === arrow.id}
                          onDrag={(m) => dragRoute(arrow, m)}
                        />
                      )}
                      {fired.map((x) => {
                        const launch = x.launchAt ?? x.appearAt - 3;
                        return (
                          <Bar
                          duration={duration}
                          hovered={hover === `strike-${x.id}`}
                          onHover={setHover}
                            key={x.id}
                            id={`strike-${x.id}`}
                            from={launch}
                            to={x.appearAt}
                            lane={strikeLane}
                            className="strike"
                            color="#e8590c"
                            label={x.name}
                            title={`${x.name}: launch ${fmt(launch)} → impact ${fmt(x.appearAt)}`}
                            selected={selection?.kind === 'strike' && selection.id === x.id}
                            onDrag={(m) => dragStrike(x, m)}
                          />
                        );
                      })}
                      {fx.map((e) => (
                        <Bar
                          duration={duration}
                          hovered={hover === `fx-${e.id}`}
                          onHover={setHover}
                          key={e.id}
                          id={`fx-${e.id}`}
                          from={e.start}
                          to={e.start + e.duration}
                          lane={fxLane}
                          className="effect"
                          color={STATUS_META[e.kind].color}
                          label={e.label ?? STATUS_META[e.kind].name}
                          title={`${STATUS_META[e.kind].name} ${fmt(e.start)} → ${fmt(e.start + e.duration)}`}
                          onDrag={(m) => dragEffect(e, m)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        )}
        {loose.length > 0 && (
          <div className="trk-group">
            <div className="trk-group-name">Other strikes</div>
            <div className="trk-row">
              <span className="trk-row-name">Unassigned</span>
              <div className="trk-lanes" style={{ height: LANE + 4 }}>
                <div className="trk-playhead" style={{ left: pct(time) }} />
                {loose.map((x) => (
                  <Bar
                          duration={duration}
                          hovered={hover === `strike-${x.id}`}
                          onHover={setHover}
                    key={x.id}
                    id={`strike-${x.id}`}
                    from={x.launchAt ?? x.appearAt - 3}
                    to={x.appearAt}
                    lane={0}
                    className="strike"
                    color="#e8590c"
                    label={x.name}
                    title={`${x.name}: impact ${fmt(x.appearAt)}`}
                    selected={selection?.kind === 'strike' && selection.id === x.id}
                    onDrag={(m) => dragStrike(x, m)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
