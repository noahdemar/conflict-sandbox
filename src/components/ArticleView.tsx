import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Move, Pencil, RotateCcw, Video, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';
import { clearShareHash } from '../share';
import { fetchWikiImage } from '../wiki';
import type { ArticleBlock, Scenario } from '../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Caption sentences grouped into this many per embedded scene when no article is authored. */
const AUTO_SCENE_LINES = 3;

const sentence = (t: string) => {
  const s = t.trim().replace(/\s*[\u2014\u2013]\s*/g, ', ');
  return /[.!?"”]$/.test(s) ? s : `${s}.`;
};

/** Article built from captions: a paragraph, then the scene it describes, repeated. */
export function autoArticle(s: Scenario): ArticleBlock[] {
  const lines = [...s.keyframes]
    .filter((k) => k.caption?.trim())
    .sort((a, b) => a.time - b.time)
    .filter((k, i, arr) => i === 0 || arr[i - 1].caption !== k.caption);
  const out: ArticleBlock[] = [];
  for (let i = 0; i < lines.length; i += AUTO_SCENE_LINES) {
    const group = lines.slice(i, i + AUTO_SCENE_LINES);
    out.push({ kind: 'text', text: group.map((k) => sentence(k.caption)).join(' ') });
    out.push({ kind: 'scene', from: group[0].id, to: group[group.length - 1].id });
    for (const k of group) {
      if (k.media) out.push({ kind: 'image', src: k.media.src, caption: k.media.caption, credit: k.media.credit });
    }
  }
  return out;
}

/** Timeline window a scene plays: from its first keyframe up to the shot after its last. */
function sceneWindow(s: Scenario, duration: number, b: Extract<ArticleBlock, { kind: 'scene' }>) {
  const sorted = [...s.keyframes].sort((a, c) => a.time - c.time);
  const from = sorted.find((k) => k.id === b.from);
  const to = sorted.find((k) => k.id === (b.to ?? b.from)) ?? from;
  if (!from || !to) return null;
  const next = sorted.find((k) => k.time > to.time);
  return { start: from.time, end: Math.max(from.time + 0.5, next ? next.time : duration) };
}

/** Callout beside the prose; a Wikipedia title supplies the image and credit link. */
function Callout({ b }: { b: Extract<ArticleBlock, { kind: 'callout' }> }) {
  const [wiki, setWiki] = useState<{ imageUrl: string; wikiTitle: string } | null>(null);
  useEffect(() => {
    if (b.image || !b.wikiTitle) return;
    let alive = true;
    void fetchWikiImage(b.wikiTitle).then((r) => alive && setWiki(r));
    return () => {
      alive = false;
    };
  }, [b.image, b.wikiTitle]);
  const src = b.image ? assetUrl(b.image) : wiki?.imageUrl;
  const page = wiki ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.wikiTitle.replace(/ /g, '_'))}` : null;
  return (
    <aside className={`article-callout ${b.side === 'left' ? 'left' : ''}`}>
      {src && <img src={src} alt={b.title} loading="lazy" />}
      <strong>{b.title}</strong>
      <span>{b.text}</span>
      {b.credit ? (
        <small>{b.credit}</small>
      ) : (
        page && (
          <small>
            Image via{' '}
            <a href={page} target="_blank" rel="noreferrer">
              Wikipedia
            </a>
          </small>
        )
      )}
    </aside>
  );
}

const assetUrl = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;

/**
 * Read-only article presentation: headline, prose and sources, with map scenes
 * embedded between paragraphs. The single map is moved over whichever scene is
 * scrolled into the middle of the screen and plays that part of the timeline,
 * then holds; scenes already watched keep a still of their last frame.
 */
export default function ArticleView() {
  const scenario = useStore((s) => s.scenario);
  const duration = useStore((s) => s.duration);
  const viewer = useStore((s) => s.viewer);
  const embed = useStore((s) => s.embed);
  const listen = useStore((s) => s.articleNarration);
  const playing = useStore((s) => s.playing);
  const exploring = useStore((s) => s.exploring);
  const hasRecordings = useStore((s) => !!s.scenario.narrationPack);
  const blocks = useMemo(() => scenario.article ?? autoArticle(scenario), [scenario]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const figures = useRef(new Map<number, HTMLDivElement>());
  const [active, setActive] = useState<number | null>(null);
  const [posters, setPosters] = useState<Record<number, string>>({});
  const [ended, setEnded] = useState<Record<number, boolean>>({});
  const activeRef = useRef<number | null>(null);

  const windows = useMemo(
    () => blocks.map((b) => (b.kind === 'scene' ? sceneWindow(scenario, duration, b) : null)),
    [blocks, scenario, duration],
  );

  const play = (i: number) => {
    const w = windows[i];
    if (!w) return;
    const prev = activeRef.current;
    if (prev !== null && prev !== i) {
      // keep a still of the scene being left so it doesn't go blank
      void useStore.getState().mapApi?.snapshot().then((url) => url && setPosters((p) => ({ ...p, [prev]: url })));
    }
    activeRef.current = i;
    setActive(i);
    // each scene starts on its scripted camera with the map locked for scrolling
    useStore.setState({ exploring: false, cameraOverride: false });
    setEnded((e) => ({ ...e, [i]: false }));
    const st = useStore.getState();
    st.setCameraLock(true);
    st.setTime(w.start);
    // scenes start without the narration prompt; readers opt in with the Listen button
    useStore.setState({ playing: true });
  };

  // a scene starts when it reaches the middle band of the screen
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.block);
          if (i !== activeRef.current) play(i);
        }
      },
      { root, rootMargin: '-38% 0px -38% 0px' },
    );
    figures.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows]);

  // stop at the end of the active scene and hold its last frame
  useEffect(
    () =>
      useStore.subscribe((st) => {
        const i = activeRef.current;
        const w = i !== null ? windows[i] : null;
        if (!w || !st.playing) return;
        if (st.time >= w.end - 0.05) {
          useStore.setState({ playing: false, time: w.end - 0.05 });
          setEnded((e) => ({ ...e, [i!]: true }));
        }
      }),
    [windows],
  );

  // pin the map stage over the active figure as the page scrolls
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>('.map-stage');
    if (!stage) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const i = activeRef.current ?? [...figures.current.keys()][0];
      const el = i !== undefined ? figures.current.get(i) : undefined;
      if (el) {
        const r = el.getBoundingClientRect();
        stage.style.top = `${r.top}px`;
        stage.style.left = `${r.left}px`;
        stage.style.width = `${r.width}px`;
        stage.style.height = `${r.height}px`;
        stage.style.visibility = activeRef.current === null ? 'hidden' : 'visible';
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    const root = scrollRef.current;
    const observer = new ResizeObserver(schedule);
    if (root) observer.observe(root);
    figures.current.forEach((el) => observer.observe(el));
    if (root?.firstElementChild) observer.observe(root.firstElementChild);
    root?.addEventListener('scroll', schedule, { passive: true });
    root?.addEventListener('load', schedule, true);
    window.addEventListener('resize', schedule);
    place();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      root?.removeEventListener('scroll', schedule);
      root?.removeEventListener('load', schedule, true);
      window.removeEventListener('resize', schedule);
      stage.removeAttribute('style');
    };
  }, [active, blocks]);

  // leaving the article: stop playback
  useEffect(
    () => () => {
      useStore.setState({ playing: false, exploring: false, cameraOverride: false });
    },
    [],
  );

  const env = scenario.environment;
  const dateline = env?.date
    ? (() => {
        const [y, m, d] = env.date.split('-').map(Number);
        return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
      })()
    : null;
  const headline = scenario.name.split(/\s+[\u2014\u2013]\s+/)[0];
  let sceneNo = 0;

  const openInEditor = () => {
    const st = useStore.getState();
    if (viewer) {
      // keep a copy in this browser, then drop the read-only mode
      st.importScenario(st.exportScenario());
      st.setViewer(false);
      clearShareHash();
    }
    st.setArticlePreview(false);
    st.setCameraLock(false);
  };

  return (
    <div className="article-scroll" ref={scrollRef}>
      <article className="article">
        <nav className="article-nav">
          {hasRecordings && (
            <button
              className="article-link"
              aria-pressed={listen}
              onClick={() => useStore.setState({ articleNarration: !listen, narration: { ...useStore.getState().narration, enabled: true } })}
              title="Play the recorded narration as each scene runs"
            >
              {listen ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {listen ? 'Narration on' : 'Listen to narration'}
            </button>
          )}
          {!embed && (
            <button className="article-link" onClick={openInEditor}>
              {viewer ? <Pencil size={14} /> : <ArrowLeft size={14} />}
              {viewer ? 'Open in editor' : 'Back to editor'}
            </button>
          )}
        </nav>
        <header className="article-head">
          <h1>{headline}</h1>
          {scenario.subtitle && <p className="article-dek">{scenario.subtitle}</p>}
          {dateline && <p className="article-dateline">Events of {dateline}</p>}
        </header>
        {blocks.map((b, i) => {
          if (b.kind === 'heading') return <h2 key={i}>{b.text}</h2>;
          if (b.kind === 'text') return <p key={i}>{b.text}</p>;
          if (b.kind === 'callout') return <Callout key={i} b={b} />;
          if (b.kind === 'image') {
            return (
              <figure key={i} className="article-figure">
                <img src={assetUrl(b.src)} alt={b.caption ?? ''} loading="lazy" />
                {(b.caption || b.credit) && (
                  <figcaption>
                    {b.caption}
                    {b.credit && <small>{b.credit}</small>}
                  </figcaption>
                )}
              </figure>
            );
          }
          if (!windows[i]) return null;
          sceneNo += 1;
          const isActive = active === i;
          return (
            <figure key={i} className={`article-figure article-scene ${isActive ? 'active' : ''}`}>
              <div
                className="scene-frame"
                data-block={i}
                ref={(el) => {
                  if (el) figures.current.set(i, el);
                  else figures.current.delete(i);
                }}
                onClick={() => play(i)}
                style={posters[i] && !isActive ? { backgroundImage: `url(${posters[i]})` } : undefined}
              >
                {!isActive && !posters[i] && <span className="scene-wait">Scene {sceneNo}</span>}
              </div>
              <figcaption>
                <span>
                  <b>Scene {sceneNo}.</b> {b.caption ?? 'Map reconstruction; plays as you scroll.'}
                </span>
                <span className="scene-actions">
                  {isActive &&
                    (exploring ? (
                      <button
                        className="article-link"
                        onClick={() => useStore.setState({ exploring: false, cameraOverride: false })}
                        title="Return to the scene's own camera"
                      >
                        <Video size={13} />
                        Scene camera
                      </button>
                    ) : (
                      <button
                        className="article-link"
                        onClick={() => useStore.setState({ exploring: true })}
                        title="Unlock the map to drag, zoom and rotate it"
                      >
                        <Move size={13} />
                        Explore map
                      </button>
                    ))}
                  {isActive && !playing && <span>{ended[i] ? 'Scene complete — scroll to continue' : 'Paused'}</span>}
                  {(ended[i] || (!isActive && posters[i]) || (isActive && !playing)) && (
                    <button className="article-link" onClick={() => play(i)}>
                      <RotateCcw size={13} />
                      Replay
                    </button>
                  )}
                </span>
              </figcaption>
            </figure>
          );
        })}
        {!!scenario.sources?.length && (
          <footer className="article-sources">
            <h2>Sources</h2>
            <ul>
              {scenario.sources.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p>Map scenes are reconstructions. Positions, timings and unit counts are simplified for illustration.</p>
          </footer>
        )}
        <p className="article-credit">
          Made with{' '}
          <a href={`${window.location.origin}${import.meta.env.BASE_URL}`} target="_blank" rel="noreferrer">
            OpenBrief
          </a>
        </p>
      </article>
    </div>
  );
}
