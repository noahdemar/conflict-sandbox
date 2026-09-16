import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ShareDialog from './ShareDialog';
import CreateBrief from './CreateBrief';
import { DEMOS, type DemoId } from '../demos';
import { FileText, Map as MapIcon, Share2, Sparkles } from 'lucide-react';
import { useStore } from '../store';

/** Opened automatically once per session when the editor starts on an empty scenario. */
let welcomed = false;

export default function TopBar() {
  const name = useStore((s) => s.scenario.name);
  const setScenarioName = useStore((s) => s.setScenarioName);
  const loadDemo = useStore((s) => s.loadDemo);
  const viewer = useStore((s) => s.viewer);
  const empty = useStore((s) => s.scenario.units.length === 0 && s.scenario.keyframes.length === 0);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);

  // the home screen leads with the guided flow when there is nothing to edit yet
  useEffect(() => {
    if (!welcomed && empty && !viewer && !window.location.hash && !new URLSearchParams(window.location.search).has('scenario')) {
      welcomed = true;
      setCreating(true);
    }
  }, [empty, viewer]);

  return (
    <div className="panel topbar">
      <div className="brand">
        <MapIcon size={16} />
        <span>OpenBrief</span>
      </div>
      <input
        className="scenario-name"
        value={name}
        onChange={(e) => setScenarioName(e.target.value)}
        title="Brief name"
      />
      <div className="topbar-actions">
        <button className="top-btn create-btn" onClick={() => setCreating(true)} title="Create a brief: build it manually or draft it with an AI assistant">
          <Sparkles size={14} />
          Create a Brief
        </button>
        <select
          className="demo-select"
          value=""
          title="Open an example brief"
          onChange={(e) => {
            if (e.target.value) loadDemo(e.target.value as DemoId);
          }}
        >
          <option value="">Examples…</option>
          {DEMOS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          className="top-btn"
          onClick={() => useStore.getState().setArticlePreview(true)}
          title="Preview the article that view links open: text with embedded map scenes"
        >
          <FileText size={14} />
          Article
        </button>
        <button className="top-btn" onClick={() => setSharing(true)} title="View link, edit link or embed code">
          <Share2 size={14} />
          Share
        </button>
      </div>
      {/* dialogs render at page level so they sit above the toolbar and side panels */}
      {creating && createPortal(<CreateBrief onClose={() => setCreating(false)} onShare={() => setSharing(true)} />, document.body)}
      {sharing && createPortal(<ShareDialog onClose={() => setSharing(false)} />, document.body)}
    </div>
  );
}
