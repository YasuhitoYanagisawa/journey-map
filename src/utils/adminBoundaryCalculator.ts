import { PhotoLocation } from '@/types/photo';

export type AdminLevel = 'prefecture' | 'city' | 'town';

export interface AdminAreaCell {
  id: string;
  name: string;
  level: AdminLevel;
  photos: PhotoLocation[];
  count: number;
  intensity: number;
  // For map centering
  centerLat: number;
  centerLng: number;
}

export interface AdminBoundaryStats {
  cells: AdminAreaCell[];
  maxCount: number;
  totalAreas: number;
  level: AdminLevel;
}

interface PhotoWithAdmin extends PhotoLocation {
  prefecture?: string | null;
  city?: string | null;
  town?: string | null;
}

/**
 * Build administrative boundary statistics from photos
 */
export function buildAdminBoundaryStats(
  photos: PhotoWithAdmin[],
  level: AdminLevel
): AdminBoundaryStats {
  if (photos.length === 0) {
    return { cells: [], maxCount: 0, totalAreas: 0, level };
  }

  // Group photos by admin level
  const areaMap = new Map<string, { photos: PhotoLocation[]; centerLat: number; centerLng: number }>();

  for (const photo of photos) {
    let areaName: string | null = null;

    if (level === 'prefecture') {
      areaName = photo.prefecture || null;
    } else if (level === 'city') {
      // Combine prefecture + city for uniqueness
      if (photo.prefecture && photo.city) {
        areaName = `${photo.prefecture} ${photo.city}`;
      } else if (photo.city) {
        areaName = photo.city;
      }
    } else if (level === 'town') {
      // Combine city + town for uniqueness
      if (photo.city && photo.town) {
        areaName = `${photo.city} ${photo.town}`;
      } else if (photo.town) {
        areaName = photo.town;
      }
    }

    if (!areaName) {
      areaName = '不明';
    }

    if (!areaMap.has(areaName)) {
      areaMap.set(areaName, { photos: [], centerLat: 0, centerLng: 0 });
    }
    
    const area = areaMap.get(areaName)!;
    area.photos.push(photo);
    // Update center (average of all photos in area)
    area.centerLat = (area.centerLat * (area.photos.length - 1) + photo.latitude) / area.photos.length;
    area.centerLng = (area.centerLng * (area.photos.length - 1) + photo.longitude) / area.photos.length;
  }

  // Find max count for normalization
  let maxCount = 0;
  for (const area of areaMap.values()) {
    if (area.photos.length > maxCount) {
      maxCount = area.photos.length;
    }
  }

  // Build cells with log-scale intensity
  const cells: AdminAreaCell[] = [];
  for (const [name, { photos: areaPhotos, centerLat, centerLng }] of areaMap.entries()) {
    const count = areaPhotos.length;
    const intensity = maxCount > 0 ? Math.log(count + 1) / Math.log(maxCount + 1) : 0;

    cells.push({
      id: name,
      name,
      level,
      photos: areaPhotos,
      count,
      intensity,
      centerLat,
      centerLng,
    });
  }

  // Sort by count descending
  cells.sort((a, b) => b.count - a.count);

  return {
    cells,
    maxCount,
    totalAreas: cells.length,
    level,
  };
}

/**
 * Get display name for admin level
 */
export function getAdminLevelLabel(level: AdminLevel): string {
  switch (level) {
    case 'prefecture':
      return '都道府県';
    case 'city':
      return '市区町村';
    case 'town':
      return '町丁目';
  }
}
