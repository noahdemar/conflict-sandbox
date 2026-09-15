import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FilePlus, Upload } from 'lucide-react';
import { KOKORO_VOICES, onKokoroStatus, type KokoroProgress } from '../narration';
import { useStore } from '../store';
import ImportDialog from './ImportDialog';
import PanelTitle, { useCollapsed } from './PanelTitle';

/** On/off switch with its label; the whole row is clickable. */
function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className="toggle-row" role="switch" aria-checked={on} title={hint} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`toggle-switch ${on ? 'on' : ''}`} aria-hidden>
        <i />
      </span>
    </button>
  );
}

/**
 * Editor settings: file actions, map display switches, and narration. Viewers
 * hear pre-recorded clips only; an editor can switch on generating voice for
 * lines that have no recording, which downloads the local speech model
 * (~90MB, cached).
 */
export default function SettingsPanel() {
  const name = useStore((s) => s.scenario.name);
  const exportScenario = useStore((s) => s.exportScenario);
  const newScenario = useStore((s) => s.newScenario);
  const iconStyle = useStore((s) => s.iconStyle);
  const setIconStyle = useStore((s) => s.setIconStyle);
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const use3d = useStore((s) => s.use3d);
  const setUse3d = useStore((s) => s.setUse3d);
  const globeMode = useStore((s) => s.globeMode);
  const setGlobeMode = useStore((s) => s.setGlobeMode);
  const narration = useStore((s) => s.narration);
  const setNarration = useStore((s) => s.setNarration);
  const hasPack = useStore((s) => !!s.scenario.narrationPack);
  const [model, setModel] = useState<KokoroProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const fold = useCollapsed();
  useEffect(() => onKokoroStatus(setModel), []);

  const doExport = () => {
    const blob = new Blob([exportScenario()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`panel narration-panel settings-panel ${fold.collapsed ? 'collapsed' : ''}`}>
      <PanelTitle label="Settings" collapsed={fold.collapsed} onToggle={fold.toggle} />

      <div className="settings-files">
        <button className="top-btn" onClick={newScenario} title="Start a new, empty brief">
          <FilePlus size={13} /> New
        </button>
        <button className="top-btn" onClick={() => setImporting(true)} title="Paste or choose scenario JSON">
          <Upload size={13} /> Import
        </button>
        <button className="top-btn" onClick={doExport} title="Download this brief as JSON">
          <Download size={13} /> Export
        </button>
      </div>

      <div className="settings-label">Map display</div>
      <Toggle label="Military symbols" hint="Standard unit symbols instead of illustrated icons" on={iconStyle === 'symbols'} onChange={(on) => setIconStyle(on ? 'symbols' : 'illustrated')} />
      <Toggle label="Briefing style" hint="Minimal black-and-white military briefing look" on={look === 'briefing'} onChange={(on) => setLook(on ? 'briefing' : 'explainer')} />
      <Toggle label="3D unit models" on={use3d} onChange={setUse3d} />
      <Toggle label="Globe projection" on={globeMode} onChange={setGlobeMode} />

      <div className="settings-label">Narration</div>
      <p className="narration-note">
        {hasPack
          ? 'Plays recorded narration. Lines without a recording are shown as text.'
          : 'No recorded narration. Captions are shown as text.'}
      </p>
      <Toggle
        label="Generate voice for unrecorded lines"
        hint="While editing only. Downloads a ~90MB speech model once."
        on={narration.allowGeneration}
        onChange={(on) => setNarration({ allowGeneration: on, engine: 'kokoro' })}
      />
      {narration.allowGeneration && (
        <>
          <label className="field">
            <span>Voice</span>
            <select value={narration.voice ?? 'bm_george'} onChange={(e) => setNarration({ voice: e.target.value })}>
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          {model && model.state !== 'idle' && (
            <div className={`tl-kokoro-status ${model.state}`} role="status">
              <div className="kokoro-line">
                <span>{model.message}</span>
                {model.state === 'loading' && model.pct !== null && (
                  <span className="kokoro-num">{model.pct.toFixed(0)}%</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {importing && createPortal(<ImportDialog onClose={() => setImporting(false)} />, document.body)}
    </div>
  );
}
