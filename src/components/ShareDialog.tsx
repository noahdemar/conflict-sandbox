import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useStore } from '../store';
import { buildShareLink, type ShareMode } from '../share';

/** Builds view/edit links that carry the whole scenario in the URL. */
export default function ShareDialog({ onClose }: { onClose: () => void }) {
  const exportScenario = useStore((s) => s.exportScenario);
  const [links, setLinks] = useState<Record<ShareMode, string> | null>(null);
  const [copied, setCopied] = useState<ShareMode | null>(null);

  useEffect(() => {
    const json = exportScenario();
    Promise.all([buildShareLink(json, 'view'), buildShareLink(json, 'edit')]).then(([view, edit]) =>
      setLinks({ view, edit }),
    );
  }, [exportScenario]);

  const copy = async (mode: ShareMode) => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links[mode]);
      setCopied(mode);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: the field stays selectable */
    }
  };

  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);
  const kb = links ? Math.round(links.view.length / 1024) : 0;

  const row = (mode: ShareMode, title: string, note: string) => (
    <div className="share-row">
      <div className="share-row-head">
        <strong>{title}</strong>
        <span>{note}</span>
      </div>
      <div className="share-field">
        <input readOnly value={links?.[mode] ?? 'Building link…'} onFocus={(e) => e.target.select()} />
        <button className="top-btn" disabled={!links} onClick={() => copy(mode)}>
          {copied === mode ? <Check size={14} /> : <Copy size={14} />}
          {copied === mode ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="panel share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Share scenario
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
        {row('view', 'View link', 'Opens a read-only player')}
        {row('edit', 'Edit link', 'Loads a copy into the recipient’s editor')}
        <p className="share-note">
          The scenario travels inside the link itself ({kb} KB) — nothing is uploaded.
          {isLocal &&
            ' This app is running on localhost, so links only open on this computer until the app is hosted.'}
        </p>
      </div>
    </div>
  );
}
