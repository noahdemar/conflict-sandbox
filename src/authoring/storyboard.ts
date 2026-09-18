import { roughPosition } from '../realism';
import type { Scenario } from '../types';
import { boxContains, boxForCamera, readSeconds } from './frame';

/**
 * A storyboard: one panel per shot, drawn straight from the scenario data.
 *
 * This is the part of "watch the whole timeline" that can be done without a
 * browser — what each shot frames, who is in it, where the strikes land, and
 * whether the caption fits the time it has. An assistant can look at one SVG
 * instead of scrubbing a film, and a person gets a contact sheet to glance at.
 */

const PANEL_W = 300;
const MAP_H = 165;
const CAPTION_H = 92;
const GAP = 14;
const COLS = 3;

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Break a caption into lines that fit the panel. */
function wrap(text: string, chars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line.length) line = word;
    else if (line.length + 1 + word.length <= chars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[,.;:]?$/, '')}…`;
  }
  return lines;
}

export function storyboardSvg(s: Scenario, duration = s.duration ?? 60): string {
  const shots = [...s.keyframes].sort((a, b) => a.time - b.time);
  const rows = Math.max(1, Math.ceil(shots.length / COLS));
  const width = COLS * PANEL_W + (COLS + 1) * GAP;
  const headerH = 54;
  const panelH = MAP_H + CAPTION_H;
  const height = headerH + rows * (panelH + GAP) + GAP;
  const colorOf = (factionId: string) => s.factions.find((f) => f.id === factionId)?.color ?? '#888';

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#14171a"/>`,
    `<text x="${GAP}" y="26" fill="#f2f4f6" font-size="15" font-weight="600">${escapeXml(s.name)}</text>`,
    `<text x="${GAP}" y="44" fill="#8d979f" font-size="11">${shots.length} shots · ${duration}s${s.subtitle ? ` · ${escapeXml(s.subtitle)}` : ''}</text>`,
  ];

  shots.forEach((k, i) => {
    const x = GAP + (i % COLS) * (PANEL_W + GAP);
    const y = headerH + Math.floor(i / COLS) * (panelH + GAP);
    const box = boxForCamera([k.lng, k.lat], k.zoom, k.pitch);
    const project = (p: [number, number]) => [
      x + ((p[0] - box.west) / (box.east - box.west)) * PANEL_W,
      y + (1 - (p[1] - box.south) / (box.north - box.south)) * MAP_H,
    ];

    const shotLength = (shots[i + 1]?.time ?? duration) - k.time;
    const needed = readSeconds(k.caption);
    const tight = k.narrate !== false && shotLength < needed;

    parts.push(`<g><rect x="${x}" y="${y}" width="${PANEL_W}" height="${panelH}" rx="7" fill="#1b1f23" stroke="#2c3238"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${PANEL_W}" height="${MAP_H}" rx="7" fill="#20262b"/>`);

    // routes first, so units sit on top of them
    for (const arrow of s.arrows) {
      const pts = (arrow.route ?? arrow.points).filter((p) => boxContains(box, p));
      if (pts.length < 2) continue;
      const d = pts.map((p, j) => `${j ? 'L' : 'M'}${project(p).map((v) => v.toFixed(1)).join(' ')}`).join(' ');
      parts.push(`<path d="${d}" fill="none" stroke="${colorOf(arrow.factionId)}" stroke-width="1.5" opacity="0.5"/>`);
    }

    const highlighted = new Set(k.highlightUnitIds ?? []);
    for (const u of s.units) {
      if (u.appearAt > k.time + 0.001) continue;
      if ((u.destroyedAt ?? Infinity) < k.time - 2) continue;
      const p = roughPosition(s, u, k.time);
      if (!boxContains(box, p)) continue;
      const [cx, cy] = project(p);
      const dead = (u.destroyedAt ?? Infinity) <= k.time;
      const r = highlighted.has(u.id) ? 4.5 : 3;
      parts.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${dead ? '#55606a' : colorOf(u.factionId)}"` +
          `${highlighted.has(u.id) ? ' stroke="#fff" stroke-width="1.2"' : ''}><title>${escapeXml(u.name)}</title></circle>`,
      );
    }

    for (const strike of s.strikes) {
      if (Math.abs(strike.appearAt - k.time) > Math.max(2, shotLength)) continue;
      const p: [number, number] = [strike.lng, strike.lat];
      if (!boxContains(box, p)) continue;
      const [cx, cy] = project(p);
      parts.push(
        `<path d="M${(cx - 4).toFixed(1)} ${(cy - 4).toFixed(1)}l8 8M${(cx + 4).toFixed(1)} ${(cy - 4).toFixed(1)}l-8 8" ` +
          `stroke="#ff8a3d" stroke-width="1.8"><title>${escapeXml(strike.name)}</title></path>`,
      );
    }

    // shot label and framing facts
    parts.push(
      `<text x="${x + 8}" y="${y + 16}" fill="#c9d1d9" font-size="10.5" font-weight="600">${escapeXml(k.id)} · ${k.time}s</text>`,
    );
    parts.push(
      `<text x="${x + PANEL_W - 8}" y="${y + 16}" fill="#8d979f" font-size="10" text-anchor="end">` +
        `z${k.zoom.toFixed(1)} · ${k.pitch}° tilt${k.followUnitId ? ' · follow' : ''}${k.sensor && k.sensor !== 'normal' ? ` · ${k.sensor}` : ''}</text>`,
    );

    const captionTop = y + MAP_H + 18;
    wrap(k.caption || '(no caption)', 46, 4).forEach((line, j) => {
      parts.push(`<text x="${x + 8}" y="${captionTop + j * 14}" fill="#e6ebef" font-size="11">${escapeXml(line)}</text>`);
    });

    // read-time bar: how much of the shot the spoken caption uses
    const barY = y + panelH - 16;
    const used = Math.min(1, needed / Math.max(0.1, shotLength));
    parts.push(`<rect x="${x + 8}" y="${barY}" width="${PANEL_W - 16}" height="5" rx="2.5" fill="#2c3238"/>`);
    parts.push(
      `<rect x="${x + 8}" y="${barY}" width="${((PANEL_W - 16) * used).toFixed(1)}" height="5" rx="2.5" fill="${tight ? '#d93a2f' : '#4a9d5b'}"/>`,
    );
    parts.push(
      `<text x="${x + PANEL_W - 8}" y="${barY - 3}" fill="${tight ? '#ff7a6d' : '#8d979f'}" font-size="9.5" text-anchor="end">` +
        `${needed.toFixed(1)}s of ${shotLength.toFixed(1)}s</text>`,
    );
    parts.push('</g>');
  });

  parts.push('</svg>');
  return parts.join('\n');
}
