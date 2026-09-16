import { useState } from 'react';
import { ArrowRight, Check, ClipboardCopy, ExternalLink, FileText, PenLine, Share2, Sparkles, X } from 'lucide-react';
import { useStore } from '../store';
import { llmPrompt, validateScenarioJson } from '../scenarioValidation';
import { realismWarnings } from '../realism';
import { iconFallbacks } from '../iconCatalog';
import { DEMOS } from '../demos';
import type { RosterEntry, Scenario } from '../types';

const STEPS = ['Describe', 'Copy prompt', 'Paste reply', 'Review & publish'] as const;

/**
 * "Create a Brief": the guided path from an idea to a published article.
 * Describe the event, copy a ready-made prompt into an AI chat assistant,
 * paste its JSON reply back, then review and share.
 */
export default function CreateBrief({ onClose, onShare }: { onClose: () => void; onShare: () => void }) {
  const importScenario = useStore((s) => s.importScenario);
  const newScenario = useStore((s) => s.newScenario);
  const empty = useStore((s) => s.scenario.units.length === 0 && s.scenario.keyframes.length === 0);
  const [path, setPath] = useState<'choose' | 'ai'>('choose');
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prompt = llmPrompt(description);
  const site = `${window.location.origin}${import.meta.env.BASE_URL}`;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  };

  const load = async () => {
    setBusy(true);
    // assistants often wrap JSON in a ```json fence; accept that
    const json = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const result = await validateScenarioJson(json);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!importScenario(json)) {
      setErrors(['The reply validated but could not be loaded (it needs at least one faction).']);
      return;
    }
    const doc = JSON.parse(json) as { scenario?: Scenario; roster?: RosterEntry[] } & Scenario;
    setWarnings([...iconFallbacks(doc.scenario ?? doc, doc.roster), ...realismWarnings(doc.scenario ?? doc)]);
    setErrors([]);
    setStep(3);
  };

  const fixRequest = (lines: string[], kind: string) =>
    `Your scenario JSON has ${kind}. Fix these and resend the whole document:\n${lines.join('\n')}`;

  return (
    <div className="share-backdrop create-backdrop" onClick={onClose}>
      <div className="panel create-brief" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="create-title">
        <div className="create-head">
          <div>
            <h2 id="create-title">
              <Sparkles size={18} /> Create a Brief
            </h2>
            <p>Turn a real event into an illustrated article with animated map scenes — built by hand or drafted with an AI assistant.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        {path === 'choose' ? (
          <section className="create-body">
            <h3>How do you want to build it?</h3>
            <div className="create-paths">
              <div className="create-path">
                <h4>
                  <PenLine size={15} /> Manually
                </h4>
                <p>
                  Place units, routes and keyframes on the map yourself, then write the article by hand. No AI
                  assistant needed.
                </p>
                <div className="create-actions">
                  <button className="top-btn primary" onClick={onClose}>
                    Start building <ArrowRight size={14} />
                  </button>
                  {!empty && (
                    <button
                      className="top-btn"
                      onClick={() => {
                        newScenario();
                        onClose();
                      }}
                      title="Clear the current brief and start with a blank canvas"
                    >
                      New blank brief
                    </button>
                  )}
                </div>
              </div>
              <div className="create-path">
                <h4>
                  <Sparkles size={15} /> AI-assisted
                </h4>
                <p>
                  Describe the event, copy a ready-made prompt into ChatGPT, Claude or Gemini, then paste the JSON
                  reply back here.
                </p>
                <div className="create-actions">
                  <button className="top-btn" onClick={() => setPath('ai')}>
                    Describe the event <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
        <ol className="create-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}>
              <button onClick={() => setStep(i)} disabled={i === 3 && step < 3}>
                <span>{i < step ? <Check size={12} /> : i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="create-body">
            <h3>What happened?</h3>
            <p>
              Describe the event in a few sentences: where and when, who was involved, what forces took part, and the key
              moments you want the map to show. The more specific you are, the better the first draft.
            </p>
            <textarea
              className="create-text"
              rows={6}
              value={description}
              placeholder="e.g. The Battle of Khasham, eastern Syria, night of 7–8 February 2018. A pro-government column attacked the Conoco gas plant held by US special operators and the SDF; US aircraft and artillery broke the attack over about four hours. Focus on the advance, the air response and the aftermath."
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="create-examples">
              <span>See finished examples:</span>
              {DEMOS.map((d) => (
                <a key={d.id} href={`${site}?demo=${d.id}`} target="_blank" rel="noreferrer">
                  {d.name} <ExternalLink size={11} />
                </a>
              ))}
            </div>
            <div className="create-actions">
              <button className="top-btn" onClick={() => setPath('choose')}>
                Back
              </button>
              <button className="top-btn primary" onClick={() => setStep(1)}>
                Next: get your prompt <ArrowRight size={14} />
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="create-body">
            <h3>Copy the prompt into your AI assistant</h3>
            <ol className="create-howto">
              <li>Copy the prompt below. It points the assistant at the OpenBrief format guide and includes your description.</li>
              <li>
                Open ChatGPT, Claude, Gemini or another assistant in a new tab and paste it in. Assistants that can browse
                the web will follow the guide links most reliably.
              </li>
              <li>Wait for a single JSON document in reply, then copy the whole reply.</li>
            </ol>
            <textarea className="create-text mono" rows={9} readOnly value={prompt} onFocus={(e) => e.target.select()} />
            <div className="create-actions">
              <button className="top-btn" onClick={() => setStep(0)}>
                Back
              </button>
              <a className="top-btn" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Open ChatGPT <ExternalLink size={13} />
              </a>
              <button className="top-btn primary" onClick={() => copy('prompt', prompt)}>
                {copied === 'prompt' ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {copied === 'prompt' ? 'Copied' : 'Copy prompt'}
              </button>
              <button className="top-btn" onClick={() => setStep(2)}>
                I have a reply <ArrowRight size={14} />
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="create-body">
            <h3>Paste the assistant’s reply</h3>
            <p>
              Paste the JSON exactly as the assistant wrote it. OpenBrief checks it against the format; if something is
              wrong you get a ready-made message to send back to the assistant.
            </p>
            <textarea
              className="create-text mono"
              rows={9}
              value={reply}
              spellCheck={false}
              placeholder='{"format": "conflict-sandbox-scenario", ...}'
              onChange={(e) => {
                setReply(e.target.value);
                setErrors([]);
              }}
            />
            {errors.length > 0 && (
              <div className="import-errors" role="alert">
                <div className="import-errors-head">
                  <strong>
                    {errors.length} problem{errors.length === 1 ? '' : 's'}: send this back to the assistant
                  </strong>
                  <button className="top-btn" onClick={() => copy('errors', fixRequest(errors, 'validation errors'))}>
                    {copied === 'errors' ? <Check size={14} /> : <ClipboardCopy size={14} />}
                    {copied === 'errors' ? 'Copied' : 'Copy fix request'}
                  </button>
                </div>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="create-actions">
              <button className="top-btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="top-btn primary" disabled={!reply.trim() || busy} onClick={load}>
                {busy ? 'Checking…' : 'Check & load'} <ArrowRight size={14} />
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="create-body">
            <h3>Your brief is loaded. Now make it right.</h3>
            <ol className="create-howto">
              <li>
                <b>Check the facts.</b> AI drafts get dates, positions, units and sources wrong. Verify every claim and
                source before you publish, and mark anything approximate.
              </li>
              <li>
                <b>Watch it play.</b> Press play under the map. Drag units and routes, retime events on the timeline, and
                edit captions in the transcript.
              </li>
              <li>
                <b>Read the article.</b> Use <em>Article</em> in the top bar to see what readers get: prose with the map
                scenes embedded.
              </li>
              <li>
                <b>Iterate with the assistant.</b> Ask it for changes (“add a scene for the counterattack”), then paste
                the new reply here again.
              </li>
              <li>
                <b>Publish.</b> <em>Share</em> gives you a view link or embed code for your own website.
              </li>
            </ol>
            {warnings.length > 0 && (
              <div className="import-errors" role="status">
                <div className="import-errors-head">
                  <strong>{warnings.length} thing{warnings.length === 1 ? '' : 's'} to fix</strong>
                  <button className="top-btn" onClick={() => copy('warn', fixRequest(warnings, 'problems (missing icons or realism issues)'))}>
                    {copied === 'warn' ? <Check size={14} /> : <ClipboardCopy size={14} />}
                    {copied === 'warn' ? 'Copied' : 'Copy fix request'}
                  </button>
                </div>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="create-actions">
              <button className="top-btn" onClick={() => setStep(2)}>
                Paste a revision
              </button>
              <button
                className="top-btn"
                onClick={() => {
                  onClose();
                  useStore.getState().setArticlePreview(true);
                }}
              >
                <FileText size={14} /> Preview article
              </button>
              <button
                className="top-btn"
                onClick={() => {
                  onClose();
                  onShare();
                }}
              >
                <Share2 size={14} /> Share
              </button>
              <button className="top-btn primary" onClick={onClose}>
                Start editing
              </button>
            </div>
          </section>
        )}
          </>
        )}
      </div>
    </div>
  );
}
