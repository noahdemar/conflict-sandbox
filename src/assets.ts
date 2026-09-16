/**
 * Files people upload for their own units: icon images and 3D models.
 *
 * Uploads are kept in this browser (IndexedDB), not on a server, and are
 * referenced as "asset:<id>". Icons are redrawn through a canvas into PNG, so
 * an uploaded SVG cannot carry scripts into anyone's page. Models are stored
 * as-is and only ever loaded by the three.js GLTF loader.
 */

const DB_NAME = 'openbrief-assets';
const STORE = 'assets';

export interface StoredAsset {
  id: string;
  kind: 'icon' | 'model';
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

/** Largest upload accepted, per file. */
export const MAX_ASSET_MB = { icon: 4, model: 40 };

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const isAssetRef = (ref?: string): ref is string => !!ref && ref.startsWith('asset:');
const idOf = (ref: string) => ref.slice('asset:'.length);

/** Object URLs for assets already loaded, so lookups during rendering are synchronous. */
const urls = new Map<string, string>();

/**
 * Redraw an uploaded image into a square PNG. This both normalizes the size
 * and drops anything active an SVG might contain.
 */
function rasterize(file: File, size = 256): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d')!;
      // fit the image inside the square, keeping its proportions
      const scale = Math.min(size / (img.width || 1), size / (img.height || 1));
      const w = (img.width || size) * scale;
      const h = (img.height || size) * scale;
      g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not read image'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('not a readable image'));
    };
    img.src = src;
  });
}

/** Store an uploaded file and return its "asset:<id>" reference. */
export async function saveAsset(file: File, kind: StoredAsset['kind']): Promise<string> {
  const limit = MAX_ASSET_MB[kind] * 1024 * 1024;
  if (file.size > limit) throw new Error(`${file.name} is larger than ${MAX_ASSET_MB[kind]} MB`);
  if (kind === 'model' && !/\.(glb|gltf)$/i.test(file.name)) throw new Error('3D models must be .glb or .gltf files');
  const blob = kind === 'icon' ? await rasterize(file) : file;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const asset: StoredAsset = { id, kind, name: file.name, type: blob.type || file.type, size: blob.size, blob };
  await tx('readwrite', (s) => s.put(asset));
  urls.set(id, URL.createObjectURL(blob));
  return `asset:${id}`;
}

/** Load every stored asset into memory once, so `assetUrl` works while rendering. */
export async function preloadAssets(): Promise<void> {
  try {
    const all = await tx<StoredAsset[]>('readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>);
    for (const a of all) if (!urls.has(a.id)) urls.set(a.id, URL.createObjectURL(a.blob));
  } catch {
    /* private browsing or storage blocked: uploads simply aren't available */
  }
}

/** Resolve a reference to something an <img> or the model loader can use. */
export function assetUrl(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (!isAssetRef(ref)) return ref;
  return urls.get(idOf(ref));
}

export async function listAssets(): Promise<StoredAsset[]> {
  try {
    return await tx<StoredAsset[]>('readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>);
  } catch {
    return [];
  }
}

export async function deleteAsset(ref: string): Promise<void> {
  if (!isAssetRef(ref)) return;
  const id = idOf(ref);
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}
