import { useRef } from 'react';
import {
  FileText,
  Shapes,
  Box,
  Download,
  FilePlus,
  Globe2,
  Map as MapIcon,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';

export default function TopBar() {
  const name = useStore((s) => s.scenario.name);
  const setScenarioName = useStore((s) => s.setScenarioName);
  const exportScenario = useStore((s) => s.exportScenario);
  const importScenario = useStore((s) => s.importScenario);
  const newScenario = useStore((s) => s.newScenario);
  const loadDemo = useStore((s) => s.loadDemo);
  const globeMode = useStore((s) => s.globeMode);
  const setGlobeMode = useStore((s) => s.setGlobeMode);
  const use3d = useStore((s) => s.use3d);
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const iconStyle = useStore((s) => s.iconStyle);
  const setIconStyle = useStore((s) => s.setIconStyle);
  const setUse3d = useStore((s) => s.setUse3d);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    const blob = new Blob([exportScenario()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File) => {
    file.text().then((txt) => {
      if (!importScenario(txt)) alert('Could not import: invalid scenario file.');
    });
  };

  return (
    <div className="panel topbar">
      <div className="brand">
        <MapIcon size={16} />
        <span>Conflict Sandbox</span>
      </div>
      <input
        className="scenario-name"
        value={name}
        onChange={(e) => setScenarioName(e.target.value)}
        title="Scenario name"
      />
      <div className="topbar-actions">
        <button
          className="top-btn"
          onClick={() => setIconStyle(iconStyle === 'symbols' ? 'illustrated' : 'symbols')}
          title="Switch unit icons between illustrations and military symbols"
        >
          <Shapes size={14} />
          {iconStyle === 'symbols' ? 'Symbols' : 'Icons'}
        </button>
        <button
          className={`top-btn ${look === 'briefing' ? 'active' : ''}`}
          onClick={() => setLook(look === 'briefing' ? 'explainer' : 'briefing')}
          title="Switch between explainer and military briefing presentation"
        >
          <FileText size={14} />
          {look === 'briefing' ? 'Briefing' : 'Explainer'}
        </button>
        <button
          className={`top-btn ${use3d ? 'active' : ''}`}
          onClick={() => setUse3d(!use3d)}
          title="Toggle 3D unit models (flat mode)"
        >
          <Box size={14} />
          {use3d ? '3D' : '2D'}
        </button>
        <button
          className={`top-btn ${globeMode ? 'active' : ''}`}
          onClick={() => setGlobeMode(!globeMode)}
          title="Toggle globe projection"
        >
          <Globe2 size={14} />
          {globeMode ? 'Globe' : 'Flat'}
        </button>
        <button className="top-btn" onClick={newScenario} title="New scenario">
          <FilePlus size={14} />
          New
        </button>
        <button onClick={loadDemo} title="Load the Battle of Khasham demo">
          Demo
        </button>
        <button className="top-btn" onClick={doExport} title="Export scenario JSON">
          <Download size={14} />
          Export
        </button>
        <button
          className="top-btn"
          onClick={() => fileRef.current?.click()}
          title="Import scenario JSON"
        >
          <Upload size={14} />
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
