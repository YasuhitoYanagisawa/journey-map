import { openDB, type IDBPDatabase } from "idb";

export type Festival = {
  name: string;
  desc?: string;
  schedule?: string;
  date?: string;
  venue?: string;
  pref: string;
  city?: string;
  lat: number;
  lng: number;
  station?: string;
  tags?: string[];
  url?: string;
};

export type Shelter = {
  name: string;
  pref: string;
  addr: string;
  type: string;
  cap: number;
  eq: 0 | 1;
  ts: 0 | 1;
  fl: 0 | 1;
  vo: 0 | 1;
  lat: number;
  lng: number;
};

export type Hospital = {
  name: string;
  pref: string;
  addr: string;
  type: string;
  beds: number | null;
  dept: number;
  em: 0 | 1;
  lat: number;
  lng: number;
};

export type DatasetName = "festivals" | "shelters" | "hospitals";

const DB_NAME = "omamori";
const DB_VERSION = 1;
const META_STORE = "meta";

const STORAGE_BASE =
  "https://vjklymicopqhwyohegwq.supabase.co/storage/v1/object/public/omamori-data";

const SOURCES: Record<DatasetName, { url: string; gzipped: boolean }> = {
  festivals: { url: `${STORAGE_BASE}/festivals.json.gz`, gzipped: true },
  shelters: { url: `${STORAGE_BASE}/shelters.json.gz`, gzipped: true },
  hospitals: { url: `${STORAGE_BASE}/medical.json.gz`, gzipped: true },
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("festivals")) db.createObjectStore("festivals");
        if (!db.objectStoreNames.contains("shelters")) db.createObjectStore("shelters");
        if (!db.objectStoreNames.contains("hospitals")) db.createObjectStore("hospitals");
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      },
    });
  }
  return dbPromise;
}

// In-memory cache (avoid re-fetching from IDB on every search)
const memCache: Partial<Record<DatasetName, unknown[]>> = {};

export async function getDataset<T = unknown>(name: DatasetName): Promise<T[] | null> {
  if (memCache[name]) return memCache[name] as T[];
  const db = await getDB();
  const data = (await db.get(name, "all")) as T[] | undefined;
  if (data) {
    memCache[name] = data as unknown[];
    return data;
  }
  return null;
}

export async function isDatasetCached(name: DatasetName): Promise<boolean> {
  const db = await getDB();
  const meta = await db.get(META_STORE, name);
  return !!meta;
}

export type LoadProgress = {
  loaded: number;
  total: number;
  phase: "downloading" | "decompressing" | "parsing" | "saving" | "done";
};

async function streamWithProgress(
  url: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<{ body: ReadableStream<Uint8Array>; total: number }> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const total = Number(res.headers.get("Content-Length") || 0);
  let loaded = 0;
  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      loaded += value.byteLength;
      onProgress?.({ loaded, total, phase: "downloading" });
      controller.enqueue(value);
    },
  });
  return { body: stream, total };
}

export async function loadDataset<T = unknown>(
  name: DatasetName,
  onProgress?: (p: LoadProgress) => void,
): Promise<T[]> {
  const cached = await getDataset<T>(name);
  if (cached) return cached;

  const src = SOURCES[name];
  const { body } = await streamWithProgress(src.url, onProgress);

  let textStream: ReadableStream<Uint8Array> = body;
  if (src.gzipped && typeof DecompressionStream !== "undefined") {
    onProgress?.({ loaded: 0, total: 0, phase: "decompressing" });
    textStream = body.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }

  // Read full text
  const reader = textStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalBytes += value.byteLength;
  }
  const merged = new Uint8Array(totalBytes);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  onProgress?.({ loaded: totalBytes, total: totalBytes, phase: "parsing" });
  const text = new TextDecoder().decode(merged);
  const data = JSON.parse(text) as T[];

  onProgress?.({ loaded: totalBytes, total: totalBytes, phase: "saving" });
  const db = await getDB();
  const tx = db.transaction([name, META_STORE], "readwrite");
  await tx.objectStore(name).put(data, "all");
  await tx
    .objectStore(META_STORE)
    .put({ count: data.length, downloadedAt: Date.now() }, name);
  await tx.done;

  memCache[name] = data as unknown[];
  onProgress?.({ loaded: totalBytes, total: totalBytes, phase: "done" });
  return data;
}

export async function clearDataset(name: DatasetName) {
  const db = await getDB();
  const tx = db.transaction([name, META_STORE], "readwrite");
  await tx.objectStore(name).delete("all");
  await tx.objectStore(META_STORE).delete(name);
  await tx.done;
  delete memCache[name];
}
