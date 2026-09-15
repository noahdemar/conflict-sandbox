import {
  Bomb,
  Eraser,
  MousePointer2,
  Pentagon,
  Spline,
  Sword,
  Type,
} from 'lucide-react';
import { useStore } from '../store';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: typeof Spline; label: string; hint: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', hint: 'Click objects to edit, drag to move' },
  { id: 'unit', icon: Sword, label: 'Unit', hint: 'Click map to place a unit' },
  { id: 'arrow', icon: Spline, label: 'Attack arrow', hint: 'Click waypoints, double-click to finish' },
  { id: 'territory', icon: Pentagon, label: 'Territory', hint: 'Click vertices, double-click to close' },
  { id: 'strike', icon: Bomb, label: 'Strike', hint: 'Click map to place an explosion at the current time' },
  { id: 'label', icon: Type, label: 'Label', hint: 'Click map to place text' },
  { id: 'erase', icon: Eraser, label: 'Erase', hint: 'Click an object to delete it' },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const draft = useStore((s) => s.draft);
  const cancelDraft = useStore((s) => s.cancelDraft);
  const undoDraftPoint = useStore((s) => s.undoDraftPoint);
  const finishDraft = useStore((s) => s.finishDraft);

  return (
    <div className="panel toolbar">
      {TOOLS.map(({ id, icon: Icon, label, hint }) => (
        <button
          key={id}
          className={`tool-btn ${tool === id ? 'active' : ''}`}
          onClick={() => setTool(id)}
          title={`${label}: ${hint}`}
        >
          <Icon size={17} />
          <span>{label}</span>
        </button>
      ))}
      {draft.length > 0 && (
        <div className="draft-actions">
          <span className="draft-count">{draft.length} pts</span>
          <button onClick={undoDraftPoint}>Undo pt</button>
          <button onClick={finishDraft}>Finish</button>
          <button onClick={cancelDraft}>Cancel</button>
        </div>
      )}
    </div>
  );
}
