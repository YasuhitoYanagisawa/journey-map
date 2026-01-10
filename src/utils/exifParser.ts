import exifr from 'exifr';
import { PhotoLocation } from '@/types/photo';

type ParseMultiplePhotosOptions = {
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

export async function parsePhotoEXIF(file: File): Promise<PhotoLocation | null> {
  try {
    // Use exifr for reliable EXIF parsing (supports GPS, dates, etc.)
    const exifData = await exifr.parse(file, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'latitude', 'longitude'],
    });

    if (!exifData) return null;

    // exifr returns latitude/longitude directly as numbers
    const latitude = exifData.latitude;
    const longitude = exifData.longitude;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    // Get timestamp from EXIF
    const timestamp =
      exifData.DateTimeOriginal ||
      exifData.CreateDate ||
      exifData.ModifyDate ||
      new Date();

    // Use object URL as thumbnail (cheap, avoids base64)
    const thumbnailUrl = URL.createObjectURL(file);

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${file.name}-${Date.now()}`;

    return {
      id,
      filename: file.name,
      latitude,
      longitude,
      timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
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
