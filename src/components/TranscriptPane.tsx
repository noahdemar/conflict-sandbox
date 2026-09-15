import { useEffect, useRef } from 'react';
import { MessageSquareText, Volume2, VolumeX, X } from 'lucide-react';
import { useStore } from '../store';

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * Transcript of every caption, sliding in from the right. The current line
 * follows playback; click a line to jump there. Each line can be spoken or
 * text-only, and in the editor its text can be edited in place.
 */
export default function TranscriptPane() {
  const open = useStore((s) => s.transcriptOpen);
  const setOpen = useStore((s) => s.setTranscriptOpen);
  const keyframes = useStore((s) => s.scenario.keyframes);
  const time = useStore((s) => s.time);
  const viewer = useStore((s) => s.viewer);
  const updateKeyframe = useStore((s) => s.updateKeyframe);
  const narration = useStore((s) => s.narration);
  const setNarration = useStore((s) => s.setNarration);
  const listRef = useRef<HTMLOListElement>(null);

  const lines = [...keyframes].filter((k) => k.caption?.trim()).sort((a, b) => a.time - b.time);
  // merge consecutive shots that share a caption into one line
  const merged = lines.filter((k, i) => i === 0 || lines[i - 1].caption !== k.caption);
  let activeId: string | undefined;
  for (const k of merged) if (k.time <= time) activeId = k.id;

  useEffect(() => {
    if (!open || !activeId) return;
    listRef.current?.querySelector(`[data-kf="${activeId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, activeId]);

  const seek = (t: number) => {
    const st = useStore.getState();
    st.setCameraLock(true);
    st.setTime(t);
  };

  // toggling a merged line updates every shot that shares its caption
  const setSpoken = (caption: string, spoken: boolean) => {
    for (const k of keyframes) if (k.caption === caption) updateKeyframe(k.id, { narrate: spoken ? undefined : false });
  };

  return (
    <aside className={`panel transcript-pane ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="panel-title">
        Transcript
        <button className="icon-btn" onClick={() => setOpen(false)} title="Close transcript">
          <X size={14} />
        </button>
      </div>
      <div className="tl-narration transcript-voice">
        <button
          className={`icon-btn ${narration.enabled ? 'narr-on' : ''}`}
          title={narration.enabled ? 'Narration on' : 'Narration off'}
          onClick={() => setNarration({ enabled: !narration.enabled })}
        >
          {narration.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <span className="transcript-voice-note">{narration.enabled ? 'Recorded narration' : 'Text only'}</span>
      </div>
      {merged.length === 0 ? (
        <p className="transcript-empty">No captions yet. Add a camera keyframe with a caption to build the transcript.</p>
      ) : (
        <ol className="transcript-list" ref={listRef}>
          {merged.map((k) => {
            const spoken = k.narrate !== false;
            return (
              <li key={k.id} data-kf={k.id} className={`${k.id === activeId ? 'active' : ''} ${spoken ? '' : 'text-only'}`}>
                <button className="transcript-time" onClick={() => seek(k.time)} title="Jump to this line">
                  {fmt(k.time)}
                </button>
                {viewer ? (
                  <button className="transcript-text" onClick={() => seek(k.time)}>
                    {k.caption}
                  </button>
                ) : (
                  <textarea
                    className="transcript-edit"
                    value={k.caption}
                    rows={2}
                    onFocus={() => seek(k.time)}
                    onChange={(e) => {
                      const prev = k.caption;
                      for (const other of keyframes) if (other.caption === prev) updateKeyframe(other.id, { caption: e.target.value });
                    }}
                  />
                )}
                <button
                  className={`transcript-mode ${spoken ? 'spoken' : ''}`}
                  onClick={() => setSpoken(k.caption, !spoken)}
                  title={spoken ? 'Spoken. Click for text only' : 'Text only. Click to speak this line'}
                  aria-pressed={spoken}
                >
                  {spoken ? <Volume2 size={14} /> : <MessageSquareText size={14} />}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
