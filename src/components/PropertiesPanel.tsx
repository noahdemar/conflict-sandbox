import { Trash2 } from 'lucide-react';
import { strikeLaunchAt } from '../realism';
import { useStore } from '../store';
import { UNIT_TYPE_LABELS } from '../natoSymbols';
import type { SensorView, ShotOverlay, StatusKind, UnitType } from '../types';
import { STATUS_META } from '../statusEffects';
import { FACILITY_META, type FacilityKind } from '../facilities';

const UNIT_TYPES = Object.keys(UNIT_TYPE_LABELS) as UnitType[];

export default function PropertiesPanel() {
  const selection = useStore((s) => s.selection);
  const scenario = useStore((s) => s.scenario);
  const updateUnit = useStore((s) => s.updateUnit);
  const updateArrow = useStore((s) => s.updateArrow);
  const updateTerritory = useStore((s) => s.updateTerritory);
  const updateLabel = useStore((s) => s.updateLabel);
  const updateStrike = useStore((s) => s.updateStrike);
  const updateKeyframe = useStore((s) => s.updateKeyframe);
  const goToKeyframe = useStore((s) => s.goToKeyframe);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const addEffect = useStore((s) => s.addEffect);
  const updateEffect = useStore((s) => s.updateEffect);
  const removeEffect = useStore((s) => s.removeEffect);

  if (!selection) return null;

  const factionSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {scenario.factions.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min = 0,
    step = 1,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );

  let body: React.ReactNode = null;
  let title = '';

  if (selection.kind === 'unit') {
    const u = scenario.units.find((x) => x.id === selection.id);
    if (!u) return null;
    title = 'Unit';
    body = (
      <>
        <label className="field">
          <span>Name</span>
          <input
            value={u.name}
            placeholder="e.g. 3rd Army"
            onChange={(e) => updateUnit(u.id, { name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={u.type}
            onChange={(e) => updateUnit(u.id, { type: e.target.value as UnitType })}
          >
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {UNIT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Faction</span>
          {factionSelect(u.factionId, (v) => updateUnit(u.id, { factionId: v }))}
        </label>
        <label className="field">
          <span>Follows arrow</span>
          <select
            value={u.arrowId ?? ''}
            onChange={(e) =>
              updateUnit(u.id, { arrowId: e.target.value || undefined })
            }
          >
            <option value="">None</option>
            {scenario.arrows.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || 'Arrow'}
              </option>
            ))}
          </select>
        </label>
        {numField('Heading (°)', u.heading ?? 0, (v) =>
          updateUnit(u.id, { heading: v }),
          -360,
          15,
        )}
        {numField('Range (km)', u.rangeKm ?? 0, (v) =>
          updateUnit(u.id, { rangeKm: Math.max(0, v) }),
          0,
          50,
        )}
        {numField('Line of sight (km)', u.sensorKm ?? 0, (v) =>
          updateUnit(u.id, { sensorKm: v > 0 ? v : undefined }),
          0,
          0.5,
        )}
        {numField('Air defense (km)', u.airDefenseKm ?? 0, (v) =>
          updateUnit(u.id, { airDefenseKm: v > 0 ? v : undefined }),
          0,
          0.5,
        )}
        {numField('Appears at (s)', u.appearAt, (v) =>
          updateUnit(u.id, { appearAt: v }),
        )}
        {numField('Destroyed at (s, 0 = never)', u.destroyedAt ?? 0, (v) =>
          updateUnit(u.id, { destroyedAt: v > 0 ? v : undefined }),
        )}
        <div className="fx-section">
          <div className="fx-head">
            <span>Effects</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addEffect(u.id, e.target.value as StatusKind);
              }}
            >
              <option value="">+ Add at playhead…</option>
              {(Object.keys(STATUS_META) as StatusKind[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_META[k].name}
                </option>
              ))}
            </select>
          </div>
          {(scenario.effects ?? [])
            .filter((fx) => fx.unitId === u.id)
            .sort((a, b) => a.start - b.start)
            .map((fx) => (
              <div key={fx.id} className="fx-card" style={{ '--fxc': STATUS_META[fx.kind].color } as React.CSSProperties}>
                <div className="fx-card-top">
                  <span className="fx-kind">{STATUS_META[fx.kind].name}</span>
                  <button className="icon-btn danger" title="Remove effect" onClick={() => removeEffect(fx.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {numField('Start (s)', fx.start, (v) => updateEffect(fx.id, { start: Math.max(0, v) }), 0, 0.5)}
                {numField('Duration (s)', fx.duration, (v) => updateEffect(fx.id, { duration: Math.max(0.5, v) }), 0.5, 0.5)}
                {fx.kind === 'datalink' && (
                  <label className="field">
                    <span>Link to</span>
                    <select
                      value={fx.targetUnitId ?? ''}
                      onChange={(e) => updateEffect(fx.id, { targetUnitId: e.target.value || undefined })}
                    >
                      <option value="">—</option>
                      {scenario.units
                        .filter((o) => o.id !== u.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name || o.type}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {fx.kind === 'jamming' &&
                  numField('Radius (m)', fx.radiusM ?? 2500, (v) => updateEffect(fx.id, { radiusM: Math.max(100, v) }), 100, 250)}
                <label className="field">
                  <span>Label</span>
                  <input
                    value={fx.label ?? ''}
                    placeholder={STATUS_META[fx.kind].badge}
                    onChange={(e) => updateEffect(fx.id, { label: e.target.value || undefined })}
                  />
                </label>
              </div>
            ))}
        </div>
      </>
    );
  } else if (selection.kind === 'arrow') {
    const a = scenario.arrows.find((x) => x.id === selection.id);
    if (!a) return null;
    title = 'Attack arrow';
    body = (
      <>
        <label className="field">
          <span>Name</span>
          <input
            value={a.name}
            onChange={(e) => updateArrow(a.id, { name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Faction</span>
          {factionSelect(a.factionId, (v) => updateArrow(a.id, { factionId: v }))}
        </label>
        {numField('Appears at (s)', a.appearAt, (v) =>
          updateArrow(a.id, { appearAt: v }),
        )}
        {numField('Draw duration (s)', a.duration, (v) =>
          updateArrow(a.id, { duration: Math.max(0.5, v) }),
          0.5,
          0.5,
        )}
        <label className="field field-check">
          <input
            type="checkbox"
            checked={a.followRoads !== false}
            onChange={(e) => updateArrow(a.id, { followRoads: e.target.checked })}
          />
          <span>
            Follow roads
            {a.followRoads !== false && (a.route ? ' · routed' : ' · off-road')}
          </span>
        </label>
      </>
    );
  } else if (selection.kind === 'territory') {
    const t = scenario.territories.find((x) => x.id === selection.id);
    if (!t) return null;
    title = 'Territory';
    body = (
      <>
        <label className="field">
          <span>Name</span>
          <input
            value={t.name}
            onChange={(e) => updateTerritory(t.id, { name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Faction</span>
          {factionSelect(t.factionId, (v) =>
            updateTerritory(t.id, { factionId: v }),
          )}
        </label>
        {numField('Appears at (s)', t.appearAt, (v) =>
          updateTerritory(t.id, { appearAt: v }),
        )}
        {numField('Fade duration (s)', t.duration, (v) =>
          updateTerritory(t.id, { duration: Math.max(0.5, v) }),
          0.5,
          0.5,
        )}
      </>
    );
  } else if (selection.kind === 'label') {
    const l = scenario.labels.find((x) => x.id === selection.id);
    if (!l) return null;
    title = 'Label';
    body = (
      <>
        <label className="field">
          <span>Text</span>
          <input
            value={l.text}
            onChange={(e) => updateLabel(l.id, { text: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Icon</span>
          <select
            value={l.facility ?? ''}
            onChange={(e) =>
              updateLabel(l.id, { facility: (e.target.value || undefined) as FacilityKind | undefined })
            }
          >
            <option value="">Text only</option>
            {(Object.keys(FACILITY_META) as FacilityKind[]).map((k) => (
              <option key={k} value={k}>
                {FACILITY_META[k].name}
              </option>
            ))}
          </select>
        </label>
        {numField('Size (px)', l.size, (v) =>
          updateLabel(l.id, { size: Math.max(8, v) }),
          8,
        )}
        <label className="field">
          <span>Color</span>
          <input
            type="color"
            value={l.color}
            onChange={(e) => updateLabel(l.id, { color: e.target.value })}
          />
        </label>
        {numField('Appears at (s)', l.appearAt, (v) =>
          updateLabel(l.id, { appearAt: v }),
        )}
      </>
    );
  } else if (selection.kind === 'strike') {
    const x = scenario.strikes.find((s2) => s2.id === selection.id);
    if (!x) return null;
    title = 'Strike';
    body = (
      <>
        <label className="field">
          <span>Name</span>
          <input
            value={x.name}
            onChange={(e) => updateStrike(x.id, { name: e.target.value })}
          />
        </label>
        {numField('Size', x.size, (v) =>
          updateStrike(x.id, { size: Math.max(0.2, v) }),
          0.2,
          0.2,
        )}
        <label className="field">
          <span>Launched from</span>
          <select
            value={x.fromUnitId ?? ''}
            onChange={(e) =>
              updateStrike(x.id, {
                fromUnitId: e.target.value || undefined,
              })
            }
          >
            <option value="">Instant (no missile)</option>
            {scenario.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.type}
              </option>
            ))}
          </select>
        </label>
        {x.fromUnitId &&
          numField('Launch at (s)', strikeLaunchAt(useStore.getState().scenario, x), (v) =>
            updateStrike(x.id, { launchAt: Math.max(0, v) }),
            0,
            0.5,
          )}
        {x.fromUnitId && (
          <label className="field">
            <span>Intercept target</span>
            <select
              value={x.targetStrikeId ?? ''}
              onChange={(e) =>
                updateStrike(x.id, {
                  targetStrikeId: e.target.value || undefined,
                })
              }
            >
              <option value="">Ground target</option>
              {scenario.strikes
                .filter((s2) => s2.id !== x.id && s2.fromUnitId)
                .map((s2) => (
                  <option key={s2.id} value={s2.id}>
                    {s2.name} @ {s2.appearAt}s
                  </option>
                ))}
            </select>
          </label>
        )}
        {numField('Detonates at (s)', x.appearAt, (v) =>
          updateStrike(x.id, { appearAt: Math.max(0, v) }),
          0,
          0.5,
        )}
        {numField('Salvo rounds', x.salvo ?? 1, (v) =>
          updateStrike(x.id, { salvo: Math.max(1, Math.round(v)) }),
        )}
      </>
    );
  } else if (selection.kind === 'keyframe') {
    const k = scenario.keyframes.find((x) => x.id === selection.id);
    if (!k) return null;
    title = 'Camera keyframe';
    body = (
      <>
        <label className="field">
          <span>Caption</span>
          <input
            value={k.caption}
            placeholder="Slide title…"
            onChange={(e) => updateKeyframe(k.id, { caption: e.target.value })}
          />
        </label>
        {numField('Time (s)', k.time, (v) =>
          updateKeyframe(k.id, { time: Math.max(0, v) }),
          0,
          0.5,
        )}
        <label className="field">
          <span>Sensor view</span>
          <select
            value={k.sensor ?? 'normal'}
            onChange={(e) => updateKeyframe(k.id, { sensor: e.target.value as SensorView })}
          >
            <option value="normal">Normal</option>
            <option value="nvg">Night vision</option>
            <option value="thermal">Thermal (white-hot)</option>
          </select>
        </label>
        <label className="field">
          <span>Overlay</span>
          <select
            value={k.overlay ?? ''}
            onChange={(e) =>
              updateKeyframe(k.id, { overlay: (e.target.value || undefined) as ShotOverlay | undefined })
            }
          >
            <option value="">None</option>
            <option value="orbat">Order of battle</option>
          </select>
        </label>
        {k.overlay === 'orbat' && (
          <div className="field">
            <span>Order of battle factions</span>
            <div className="key-unit-list">
              {scenario.factions.map((f) => {
                const checked = k.overlayFactionIds?.includes(f.id) ?? false;
                return (
                  <label key={f.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const ids = new Set(k.overlayFactionIds ?? []);
                        if (checked) ids.delete(f.id);
                        else ids.add(f.id);
                        updateKeyframe(k.id, { overlayFactionIds: ids.size ? [...ids] : undefined });
                      }}
                    />
                    <i style={{ background: f.color }} />
                    {f.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {numField('Zoom', k.zoom, (v) =>
          updateKeyframe(k.id, { zoom: Math.min(20, Math.max(0, v)) }),
          0,
          0.5,
        )}
        {numField('Pitch (°)', k.pitch, (v) =>
          updateKeyframe(k.id, { pitch: Math.min(80, Math.max(0, v)) }),
          0,
          5,
        )}
        {numField('Bearing (°)', k.bearing, (v) =>
          updateKeyframe(k.id, { bearing: v }),
          -180,
          15,
        )}
        <div className="field">
          <span>Highlight units</span>
          <div className="key-unit-list">
            {scenario.factions.map((f) => {
              const units = scenario.units.filter((u) => u.factionId === f.id);
              if (!units.length) return null;
              return (
                <div className="key-unit-group" key={f.id}>
                  <b>{f.name}</b>
                  {units.map((u) => {
                    const checked = k.highlightUnitIds?.includes(u.id) ?? false;
                    return (
                      <label key={u.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const ids = new Set(k.highlightUnitIds ?? []);
                            if (checked) ids.delete(u.id);
                            else ids.add(u.id);
                            updateKeyframe(k.id, { highlightUnitIds: ids.size ? [...ids] : undefined });
                          }}
                        />
                        <i style={{ background: scenario.factions.find((f) => f.id === u.factionId)?.color ?? '#888' }} />
                        {u.name || UNIT_TYPE_LABELS[u.type]}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <label className="field">
          <span>Follow unit</span>
          <select
            value={k.followUnitId ?? ''}
            onChange={(e) =>
              updateKeyframe(k.id, {
                followUnitId: e.target.value || undefined,
              })
            }
          >
            <option value="">None</option>
            {scenario.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.type}
              </option>
            ))}
          </select>
        </label>
        {k.followUnitId && (
          <label className="field">
            <span>Follow mode</span>
            <select
              value={k.followMode ?? 'track'}
              onChange={(e) =>
                updateKeyframe(k.id, {
                  followMode: e.target.value as 'track' | 'chase',
                })
              }
            >
              <option value="track">Track (fixed angle)</option>
              <option value="chase">Chase (behind unit)</option>
            </select>
          </label>
        )}
        {numField('Orbit (°/s)', k.orbitSpeed ?? 0, (v) =>
          updateKeyframe(k.id, { orbitSpeed: v || undefined }),
          -360,
          5,
        )}
        <button className="jump-btn" onClick={() => goToKeyframe(k.id)}>
          Jump to view
        </button>
      </>
    );
  }

  return (
    <div className="panel props-panel">
      <div className="panel-title">
        {title}
        <button className="icon-btn danger" onClick={deleteSelection} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
      {body}
    </div>
  );
}
