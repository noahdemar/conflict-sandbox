import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Collapsible panel state. Side panels start collapsed so the map stays clear;
 * clicking the title opens them.
 */
export function useCollapsed(initial = true) {
  const [collapsed, setCollapsed] = useState(initial);
  return { collapsed, toggle: () => setCollapsed((c) => !c) };
}

/** Panel title that folds the panel; extra `actions` (e.g. an add button) stay clickable on the right. */
export default function PanelTitle({
  label,
  collapsed,
  onToggle,
  actions,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="panel-title collapsible-title">
      <button className="panel-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        {label}
      </button>
      {!collapsed && actions}
    </div>
  );
}
