import { PhotoLocation } from '@/types/photo';

export interface GridCell {
  id: string;
  row: number;
  col: number;
  centerLat: number;
  centerLng: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  photos: PhotoLocation[];
  count: number;
  /** Normalized intensity 0-1 using log scale to prevent saturation */
  intensity: number;
}

export interface GridStats {
  cells: GridCell[];
  maxCount: number;
  totalCells: number;
  cellSizeMeters: number;
}

/**
 * Convert meters to approximate degrees at a given latitude
 */
function metersToDegreesLat(meters: number): number {
  // 1 degree latitude ≈ 111,320 meters
  return meters / 111320;
}

function metersToDegreesLng(meters: number, latitude: number): number {
  // 1 degree longitude ≈ 111,320 * cos(latitude) meters
  const latRad = (latitude * Math.PI) / 180;
  return meters / (111320 * Math.cos(latRad));
}

/**
 * Calculate which grid cell a coordinate falls into
 */
function getGridIndex(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number,
  cellSizeLat: number,
  cellSizeLng: number
): { row: number; col: number } {
  const row = Math.floor((lat - originLat) / cellSizeLat);
  const col = Math.floor((lng - originLng) / cellSizeLng);
  return { row, col };
}

/**
 * Build a 500m grid from photo locations and calculate intensities
 */
export function buildPhotoGrid(
  photos: PhotoLocation[],
  cellSizeMeters: number = 500
): GridStats {
  if (photos.length === 0) {
    return { cells: [], maxCount: 0, totalCells: 0, cellSizeMeters };
  }

  // Find bounding box
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  for (const photo of photos) {
    if (photo.latitude < minLat) minLat = photo.latitude;
    if (photo.latitude > maxLat) maxLat = photo.latitude;
    if (photo.longitude < minLng) minLng = photo.longitude;
    if (photo.longitude > maxLng) maxLng = photo.longitude;
  }

  // Add padding
  const padLat = metersToDegreesLat(cellSizeMeters);
  const centerLat = (minLat + maxLat) / 2;
  const padLng = metersToDegreesLng(cellSizeMeters, centerLat);

  const originLat = minLat - padLat;
  const originLng = minLng - padLng;

  const cellSizeLat = metersToDegreesLat(cellSizeMeters);
  const cellSizeLng = metersToDegreesLng(cellSizeMeters, centerLat);

  // Group photos into cells
  const cellMap = new Map<string, { row: number; col: number; photos: PhotoLocation[] }>();

  for (const photo of photos) {
    const { row, col } = getGridIndex(
      photo.latitude,
      photo.longitude,
      originLat,
      originLng,
      cellSizeLat,
      cellSizeLng
    );
    const key = `${row}:${col}`;
    if (!cellMap.has(key)) {
      cellMap.set(key, { row, col, photos: [] });
    }
    cellMap.get(key)!.photos.push(photo);
  }

  // Find max count for normalization
  let maxCount = 0;
  for (const cell of cellMap.values()) {
    if (cell.photos.length > maxCount) {
      maxCount = cell.photos.length;
    }
  }

  // Build cell array with intensity (log scale to prevent saturation)
  const cells: GridCell[] = [];
  for (const [key, { row, col, photos: cellPhotos }] of cellMap.entries()) {
    const count = cellPhotos.length;

    // Log scale intensity: log(count+1) / log(max+1)
    const intensity =
      maxCount > 0 ? Math.log(count + 1) / Math.log(maxCount + 1) : 0;

    const cellMinLat = originLat + row * cellSizeLat;
    const cellMaxLat = cellMinLat + cellSizeLat;
    const cellMinLng = originLng + col * cellSizeLng;
    const cellMaxLng = cellMinLng + cellSizeLng;

    cells.push({
      id: key,
      row,
      col,
      centerLat: (cellMinLat + cellMaxLat) / 2,
      centerLng: (cellMinLng + cellMaxLng) / 2,
      bounds: {
        minLat: cellMinLat,
        maxLat: cellMaxLat,
        minLng: cellMinLng,
        maxLng: cellMaxLng,
      },
      photos: cellPhotos,
      count,
      intensity,
    });
  }

  // Sort by count descending for ranking
  cells.sort((a, b) => b.count - a.count);

  return {
    cells,
    maxCount,
    totalCells: cells.length,
    cellSizeMeters,
  };
}

/**
 * Get a color for a given intensity (0-1) using a perceptually uniform scale
 */
export function getGridCellColor(intensity: number): string {
  // Blue → Cyan → Green → Yellow → Orange → Red
  const stops = [
    { t: 0.0, h: 210, s: 70, l: 50 },
    { t: 0.25, h: 180, s: 70, l: 50 },
    { t: 0.5, h: 120, s: 60, l: 45 },
    { t: 0.75, h: 45, s: 90, l: 50 },
    { t: 1.0, h: 0, s: 80, l: 50 },
  ];

  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (intensity >= stops[i].t && intensity <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.t - lower.t || 1;
  const localT = (intensity - lower.t) / range;

  const h = lower.h + (upper.h - lower.h) * localT;
  const s = lower.s + (upper.s - lower.s) * localT;
  const l = lower.l + (upper.l - lower.l) * localT;

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
