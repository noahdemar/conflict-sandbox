import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCopy, Check, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';

/**
 * After an import, the editor becomes the fixer: this walks the author through
 * everything the check found, one at a time, selecting the object and putting
 * it on screen so the fix is a drag or a field away rather than a hunt through
 * JSON. The same list copies out as a message to send back to an assistant.
 */
export default function ReviewBar() {
  const review = useStore((s) => s.review);
  const at = useStore((s) => s.reviewAt);
  const goTo = useStore((s) => s.goToReview);
  const dismiss = useStore((s) => s.dismissReview);
  const viewer = useStore((s) => s.viewer);
  const [copied, setCopied] = useState(false);

  if (!review.length || viewer) return null;
  const issue = review[at] ?? review[0];
  const errors = review.filter((i) => i.severity === 'error').length;

  const copy = async () => {
    const lines = review.map((i) => `${i.path} ${i.message}${i.fix ? ` — ${i.fix}` : ''}`);
    try {
      await navigator.clipboard.writeText(
        `The scenario loaded, but these need fixing. Send back the whole corrected document:\n${lines.join('\n')}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className={`review-bar sev-${issue.severity}`} role="status">
      <span className="review-count">
        {issue.severity === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
        {at + 1} / {review.length}
        {errors > 0 && <em>{errors} blocking</em>}
      </span>
      <div className="review-body">
        <strong>{issue.message}</strong>
        {issue.fix && <span>{issue.fix}</span>}
      </div>
      <div className="review-actions">
        <button className="icon-btn" title="Previous" onClick={() => goTo(at - 1)} disabled={at === 0}>
          <ChevronLeft size={14} />
        </button>
        <button
          className="top-btn"
          title={issue.selection ? 'Select it and put it on screen' : 'This one has no object to select'}
          onClick={() => goTo(at)}
          disabled={!issue.selection}
        >
          Show me
        </button>
        <button className="icon-btn" title="Next" onClick={() => goTo(at + 1)} disabled={at >= review.length - 1}>
          <ChevronRight size={14} />
        </button>
        <button className="top-btn" title="Copy the whole list as a fix request" onClick={copy}>
          {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
          {copied ? 'Copied' : 'Copy list'}
        </button>
        <button className="icon-btn" title="Dismiss" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
