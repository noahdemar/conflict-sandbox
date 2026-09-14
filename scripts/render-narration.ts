/**
 * Pre-render demo caption narration with Kokoro "George" so the demos play
 * recorded audio instead of downloading and running the voice model.
 *
 *   npx tsx scripts/render-narration.ts            # all demos
 *   npx tsx scripts/render-narration.ts khasham    # one demo
 *
 * Writes public/narration/<demoId>/<keyframeId>.mp3 and manifest.json.
 * Re-running skips lines whose caption text hasn't changed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KokoroTTS } from 'kokoro-js';
import { DEMOS } from '../src/demos';

const VOICE = 'bm_george';
const only = process.argv[2];

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });

for (const demo of DEMOS) {
  if (only && demo.id !== only) continue;
  const dir = join('public', 'narration', demo.id);
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const prev = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { voice: string; items: Record<string, { text: string; file: string }> })
    : null;
  const items: Record<string, { text: string; file: string }> = {};
  const keyframes = demo.scenario().keyframes.filter((k) => k.caption.trim());
  // identical captions on consecutive shots share one recording
  const byText = new Map<string, string>();
  for (const k of keyframes) {
    const file = `${k.id}.mp3`;
    const shared = byText.get(k.caption);
    if (shared) {
      items[k.id] = { text: k.caption, file: shared };
      continue;
    }
    const unchanged = prev?.voice === VOICE && prev.items[k.id]?.text === k.caption && existsSync(join(dir, file));
    if (!unchanged) {
      const audio = await tts.generate(k.caption, { voice: VOICE });
      const wav = join(dir, `${k.id}.wav`);
      await audio.save(wav);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', join(dir, file)]);
      rmSync(wav);
      console.log(`${demo.id}/${file}  ${k.caption.slice(0, 70)}`);
    }
    items[k.id] = { text: k.caption, file };
    byText.set(k.caption, file);
  }
  writeFileSync(manifestPath, JSON.stringify({ voice: VOICE, items }, null, 2) + '\n');
  console.log(`${demo.id}: ${Object.keys(items).length} lines`);
}

// the ONNX runtime can abort while tearing down threads; exit explicitly once files are written
process.exit(0);
