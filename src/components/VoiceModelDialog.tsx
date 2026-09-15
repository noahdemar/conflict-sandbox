import { Download, Volume2 } from 'lucide-react';
import { preloadKokoro } from '../narration';
import { useStore } from '../store';

/**
 * Shown once when the first spoken caption is authored: the local voice model
 * is a ~90MB one-time download, so we ask before fetching it. The browser's
 * built-in voice is offered as a no-download alternative.
 */
export default function VoiceModelDialog() {
  const pending = useStore((s) => s.voicePromptPending);
  const setNarration = useStore((s) => s.setNarration);
  if (!pending) return null;
  const close = () => useStore.setState({ voicePromptPending: false });
  return (
    <div className="share-backdrop consent-backdrop" role="dialog" aria-modal="true" aria-labelledby="voice-model-title">
      <div className="panel consent-dialog">
        <h2 id="voice-model-title">Voice lines need a speech model</h2>
        <p>
          Captions are read aloud by a natural voice that runs locally in the browser — a one-time ~90MB download,
          cached afterwards. The built-in browser voice works without any download.
        </p>
        <div className="consent-actions">
          <button
            className="top-btn active"
            onClick={() => {
              preloadKokoro();
              close();
            }}
            autoFocus
          >
            <Download size={15} />
            Download voice model
          </button>
          <button
            className="top-btn"
            onClick={() => {
              setNarration({ engine: 'webspeech', voice: null });
              close();
            }}
          >
            <Volume2 size={15} />
            Use browser voice
          </button>
        </div>
        <button className="consent-cancel" onClick={close}>
          Not now
        </button>
      </div>
    </div>
  );
}
