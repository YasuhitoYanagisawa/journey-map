import EXIF from 'exif-js';
import { PhotoLocation } from '@/types/photo';

function convertDMSToDD(degrees: number, minutes: number, seconds: number, direction: string): number {
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'S' || direction === 'W') {
    dd = dd * -1;
  }
  return dd;
}

function getGPSCoordinates(exifData: any): { latitude: number; longitude: number } | null {
  const latData = exifData.GPSLatitude;
  const lonData = exifData.GPSLongitude;
  const latRef = exifData.GPSLatitudeRef;
  const lonRef = exifData.GPSLongitudeRef;

  if (!latData || !lonData || !latRef || !lonRef) {
    return null;
  }

  const latitude = convertDMSToDD(
    latData[0],
    latData[1],
    latData[2],
    latRef
  );

  const longitude = convertDMSToDD(
    lonData[0],
    lonData[1],
    lonData[2],
    lonRef
  );

  return { latitude, longitude };
}

function getTimestamp(exifData: any): Date {
  const dateTimeOriginal = exifData.DateTimeOriginal;
  if (dateTimeOriginal) {
    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const parts = dateTimeOriginal.split(' ');
    const dateParts = parts[0].split(':');
    const timeParts = parts[1]?.split(':') || ['00', '00', '00'];
    return new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      parseInt(timeParts[0]),
      parseInt(timeParts[1]),
      parseInt(timeParts[2])
    );
  }
  return new Date();
}

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

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function parsePhotoEXIF(file: File): Promise<PhotoLocation | null> {
  try {
    const buffer = await readFileAsArrayBuffer(file);

    // Fast path: parse EXIF directly from JPEG binary (no Image decode / no base64 DataURL)
    const exifData = EXIF.readFromBinaryFile(buffer);
    if (!exifData) return null;

    const coords = getGPSCoordinates(exifData);
    if (!coords) return null;

    const timestamp = getTimestamp(exifData);
    // Use object URL as thumbnail (cheap, avoids base64)
    const thumbnailUrl = URL.createObjectURL(file);

    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${file.name}-${Date.now()}`;

    return {
      id,
      filename: file.name,
      latitude: coords.latitude,
      longitude: coords.longitude,
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

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 8));
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

