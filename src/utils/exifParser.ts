import exifr from 'exifr';
import { PhotoLocation } from '@/types/photo';

export type ParseMultiplePhotosOptions = {
  /** Number of photos to parse in parallel. Lower = smoother UI, higher = faster. */
  concurrency?: number;
  /** Yield to the main thread every N processed photos to keep the UI responsive. */
  yieldEvery?: number;
  /** Progress callback (processed, total). */
  onProgress?: (processed: number, total: number) => void;
  /** Abort parsing (used for cancel). */
  signal?: AbortSignal;
};

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeId(file: File): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return (crypto as Crypto).randomUUID();
    }
  } catch {
    // ignore
  }
  return `${file.name}-${Date.now()}`;
}

export async function parsePhotoEXIF(file: File): Promise<PhotoLocation | null> {
  try {
    // GPS: use the dedicated fast path (recommended by exifr docs)
    const gps = await exifr.gps(file).catch(() => null);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }

    // Timestamp: read only a few common date tags
    const meta = await exifr
      .parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate'])
      .catch(() => null);

    const rawTimestamp =
      meta?.DateTimeOriginal ?? meta?.CreateDate ?? meta?.ModifyDate ?? null;

    const timestamp =
      rawTimestamp instanceof Date
        ? rawTimestamp
        : rawTimestamp
          ? new Date(rawTimestamp)
          : new Date(file.lastModified);

    const thumbnailUrl = URL.createObjectURL(file);

    return {
      id: makeId(file),
      filename: file.name,
      latitude: gps.latitude,
      longitude: gps.longitude,
      timestamp,
      thumbnailUrl,
      originalFile: file,
    };
  } catch (error) {
    console.warn('[EXIF] parse failed:', file.name, error);
    return null;
  }
}

export async function parseMultiplePhotos(
  files: File[],
  options: ParseMultiplePhotosOptions = {}
): Promise<PhotoLocation[]> {
  const total = files.length;
  if (total === 0) return [];

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const yieldEvery = Math.max(1, options.yieldEvery ?? 5);

  let processed = 0;
  options.onProgress?.(0, total);

  const results: Array<PhotoLocation | null | undefined> = new Array(total);
  let index = 0;

  const worker = async () => {
    while (true) {
      if (options.signal?.aborted) return;

      const current = index++;
      if (current >= total) return;

      results[current] = await parsePhotoEXIF(files[current]);
      processed += 1;
      options.onProgress?.(processed, total);

      if (processed % yieldEvery === 0) {
        await yieldToMainThread();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return results.filter((r): r is PhotoLocation => r != null);
}
