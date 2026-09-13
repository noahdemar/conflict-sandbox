import { recordStream } from './audio';

/**
 * Records the map canvas (+ app audio bus) to a WebM file.
 * Start when playback begins, stop when it ends → downloads the file.
 */

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

export function isRecording() {
  return recorder?.state === 'recording';
}

export function startRecording(canvas: HTMLCanvasElement, name: string) {
  if (isRecording()) return;
  const video = canvas.captureStream(60);
  const audio = recordStream();
  const tracks = [...video.getVideoTracks(), ...audio.getAudioTracks()];
  const stream = new MediaStream(tracks);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';
  chunks = [];
  recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12_000_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    recorder = null;
  };
  recorder.start(250);
}

export function stopRecording() {
  if (recorder?.state === 'recording') recorder.stop();
}
