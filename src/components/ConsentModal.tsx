import { MessageSquareText, Volume2 } from 'lucide-react';
import { useStore } from '../store';

/** Asks once how narration should be presented before a narrated scenario plays. */
export default function ConsentModal() {
  const pending = useStore((s) => s.consentPending);
  const resolve = useStore((s) => s.resolveConsent);
  const cancel = () => useStore.setState({ consentPending: false });
  if (!pending) return null;
  return (
    <div className="share-backdrop consent-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="panel consent-dialog">
        <h2 id="consent-title">This scenario is narrated</h2>
        <p>
          Captions can be played as recorded narration while the scenario plays. You can change this later in the
          transcript pane, globally or per line.
        </p>
        <div className="consent-actions">
          <button className="top-btn active" onClick={() => resolve('voice')} autoFocus>
            <Volume2 size={15} />
            Play with voice
          </button>
          <button className="top-btn" onClick={() => resolve('text')}>
            <MessageSquareText size={15} />
            Text only
          </button>
        </div>
        <button className="consent-cancel" onClick={cancel}>
          Not now
        </button>
      </div>
    </div>
  );
}
