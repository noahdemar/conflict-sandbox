import { Plus, Trash2 } from 'lucide-react';
import PanelTitle, { useCollapsed } from './PanelTitle';
import { useStore } from '../store';

/** Quick-pick colors applied to the active faction. */
const SWATCHES = [
  '#2f6fd0',
  '#d03a2f',
  '#2f8f5b',
  '#8a5bd0',
  '#d08a2f',
  '#2fb3d0',
  '#c94f8a',
  '#5a5a5a',
];

export default function FactionPanel() {
  const factions = useStore((s) => s.scenario.factions);
  const activeFactionId = useStore((s) => s.activeFactionId);
  const setActiveFaction = useStore((s) => s.setActiveFaction);
  const updateFaction = useStore((s) => s.updateFaction);
  const addFaction = useStore((s) => s.addFaction);
  const removeFaction = useStore((s) => s.removeFaction);

  const fold = useCollapsed();
  return (
    <div className={`panel faction-panel ${fold.collapsed ? 'collapsed' : ''}`}>
      <PanelTitle
        label="Factions"
        collapsed={fold.collapsed}
        onToggle={fold.toggle}
        actions={
          <button className="icon-btn" onClick={addFaction} title="Add faction">
            <Plus size={14} />
          </button>
        }
      />
      <div className="faction-swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            title={`Set active faction to ${c}`}
            onClick={() => updateFaction(activeFactionId, { color: c })}
          />
        ))}
      </div>
      {factions.map((f) => (
        <div
          key={f.id}
          className={`faction-row ${f.id === activeFactionId ? 'active' : ''}`}
          onClick={() => setActiveFaction(f.id)}
        >
          <input
            type="color"
            value={f.color}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateFaction(f.id, { color: e.target.value })}
          />
          <input
            className="faction-name"
            value={f.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateFaction(f.id, { name: e.target.value })}
          />
          {factions.length > 1 && (
            <button
              className="icon-btn danger"
              title="Delete faction and its objects"
              onClick={(e) => {
                e.stopPropagation();
                removeFaction(f.id);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
