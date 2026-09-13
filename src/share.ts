/**
 * Shareable links: the exported scenario file is compressed and stored in the
 * URL fragment, so no server is involved and the data never leaves the link.
 *   #view=<data>  read-only player
 *   #edit=<data>  loads into the recipient's editor
 */

export type ShareMode = 'view' | 'edit';

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildShareLink(fileJson: string, mode: ShareMode): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(fileJson), new CompressionStream('deflate-raw'));
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `${mode}=${toBase64Url(packed)}`;
  return url.toString();
}

/** Scenario JSON carried by the current URL, if any. */
export async function readShareLink(): Promise<{ mode: ShareMode; json: string } | null> {
  const m = /^#(view|edit)=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    const bytes = await pipe(fromBase64Url(m[2]), new DecompressionStream('deflate-raw'));
    return { mode: m[1] as ShareMode, json: new TextDecoder().decode(bytes) };
  } catch {
    return null;
  }
}

export function clearShareHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
