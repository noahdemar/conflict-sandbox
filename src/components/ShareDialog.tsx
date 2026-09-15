import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useStore } from '../store';
import { buildShareLink, embedSnippet, type ShareMode } from '../share';

/** Builds view/edit links and an iframe embed snippet that carry the whole scenario in the URL. */
export default function ShareDialog({ onClose }: { onClose: () => void }) {
  const exportScenario = useStore((s) => s.exportScenario);
  const name = useStore((s) => s.scenario.name);
  const [links, setLinks] = useState<Record<ShareMode | 'embed', string> | null>(null);
  const [copied, setCopied] = useState<ShareMode | 'embed' | null>(null);

  useEffect(() => {
    const json = exportScenario();
    Promise.all([buildShareLink(json, 'view'), buildShareLink(json, 'edit'), buildShareLink(json, 'view', true)]).then(
      ([view, edit, embedSrc]) => setLinks({ view, edit, embed: embedSnippet(embedSrc, name) }),
    );
  }, [exportScenario, name]);

  const copy = async (mode: ShareMode | 'embed') => {
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

  const row = (mode: ShareMode | 'embed', title: string, note: string) => (
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
          Share or embed
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
        {row('view', 'View link', 'Opens the article: text with embedded map scenes')}
        {row('edit', 'Edit link', 'Loads a copy into the recipient’s editor')}
        {row('embed', 'Embed code', 'Paste into another website to show the article in an iframe')}
        <p className="share-note">
          The scenario travels inside the link itself ({kb} KB); nothing is uploaded.
          {isLocal &&
            ' This app is running on localhost, so links only open on this computer until the app is hosted.'}
        </p>
      </div>
    </div>
  );
}
