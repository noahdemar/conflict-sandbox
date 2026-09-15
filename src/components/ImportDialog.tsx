import { useRef, useState } from 'react';
import { Check, Copy, FileUp, X } from 'lucide-react';
import { useStore } from '../store';
import { llmPrompt, validateScenarioJson } from '../scenarioValidation';
import { realismWarnings } from '../realism';
import { iconFallbacks } from '../iconCatalog';
import type { RosterEntry, Scenario } from '../types';

/** Paste or pick scenario JSON, validate it against the schema, and load it. */
export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const importScenario = useStore((s) => s.importScenario);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'prompt' | 'errors' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const site = `${window.location.origin}${import.meta.env.BASE_URL}`;

  const load = async (json: string) => {
    setBusy(true);
    const result = await validateScenarioJson(json);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    // plausibility issues don't block loading, but are shown once first
    if (warnings === null) {
      const doc = JSON.parse(json) as { scenario?: Scenario; roster?: RosterEntry[] } & Scenario;
      const found = [...iconFallbacks(doc.scenario ?? doc, doc.roster), ...realismWarnings(doc.scenario ?? doc)];
      if (found.length) {
        setWarnings(found);
        return;
      }
    }
    if (importScenario(json)) onClose();
    else setErrors(['The document validated but could not be loaded (it needs at least one faction).']);
  };

  const copy = async (what: 'prompt' | 'errors') => {
    const value =
      what === 'prompt'
        ? llmPrompt()
        : `Your scenario JSON failed validation. Fix these and resend the whole document:\n${errors.join('\n')}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="panel share-dialog import-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Import scenario
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="import-llm">
          <div>
            <strong>Make one with an LLM</strong>
            <span>
              Copy the prompt, describe your scenario, then paste the JSON it returns below. Guide:{' '}
              <a href={`${site}llms.txt`} target="_blank" rel="noreferrer">llms.txt</a> · schema:{' '}
              <a href={`${site}schema/scenario.schema.json`} target="_blank" rel="noreferrer">scenario.schema.json</a>
            </span>
          </div>
          <button className="top-btn" onClick={() => copy('prompt')}>
            {copied === 'prompt' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'prompt' ? 'Copied' : 'Copy LLM prompt'}
          </button>
        </div>

        <textarea
          className="import-text"
          placeholder='Paste scenario JSON here: {"format": "conflict-sandbox-scenario", ...}'
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setErrors([]);
            setWarnings(null);
          }}
        />

        {errors.length > 0 && (
          <div className="import-errors" role="alert">
            <div className="import-errors-head">
              <strong>{errors.length} problem{errors.length === 1 ? '' : 's'} found</strong>
              <button className="top-btn" onClick={() => copy('errors')}>
                {copied === 'errors' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'errors' ? 'Copied' : 'Copy for LLM'}
              </button>
            </div>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {errors.length === 0 && warnings && warnings.length > 0 && (
          <div className="import-errors" role="status">
            <div className="import-errors-head">
              <strong>{warnings.length} thing{warnings.length === 1 ? '' : 's'} to check</strong>
              <button className="top-btn" onClick={() => copy('errors')}>
                {copied === 'errors' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'errors' ? 'Copied' : 'Copy for LLM'}
              </button>
            </div>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="import-actions">
          <button className="top-btn" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} />
            Choose file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) f.text().then((t) => {
                setText(t);
                setWarnings(null);
                void load(t);
              });
            }}
          />
          <button className="top-btn active" disabled={!text.trim() || busy} onClick={() => load(text)}>
            {busy ? 'Validating…' : warnings?.length && !errors.length ? 'Load anyway' : 'Validate & load'}
          </button>
        </div>
      </div>
    </div>
  );
}
