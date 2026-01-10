/**
 * Japan GeoJSON data loader for administrative boundary visualization
 * Uses simplified GeoJSON data from external sources for efficient loading
 */

import { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

// Cache for loaded GeoJSON data
let prefectureGeoJSON: FeatureCollection | null = null;
let isLoading = false;
let loadPromise: Promise<FeatureCollection | null> | null = null;

// GeoJSON source URLs (simplified versions for performance)
const PREFECTURE_GEOJSON_URL = 'https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson';

/**
 * Load prefecture-level GeoJSON data
 */
export async function loadPrefectureGeoJSON(): Promise<FeatureCollection | null> {
  // Return cached data if available
  if (prefectureGeoJSON) {
    return prefectureGeoJSON;
  }

  // Return existing promise if loading
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  loadPromise = fetchAndProcessGeoJSON();

  try {
    prefectureGeoJSON = await loadPromise;
    return prefectureGeoJSON;
  } finally {
    isLoading = false;
  }
}

async function fetchAndProcessGeoJSON(): Promise<FeatureCollection | null> {
  try {
    const response = await fetch(PREFECTURE_GEOJSON_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch GeoJSON: ${response.status}`);
    }

    const data = await response.json();
    
    // Validate it's a FeatureCollection
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Invalid GeoJSON format');
    }

    return data as FeatureCollection;
  } catch (error) {
    console.error('Error loading prefecture GeoJSON:', error);
    return null;
  }
}

/**
 * Get prefecture name from GeoJSON properties
 * The japan.geojson uses 'nam_ja' or 'name' for prefecture names
 */
export function getPrefectureName(feature: Feature): string | null {
  const props = feature.properties;
  if (!props) return null;
  
  // Try different property names used in various GeoJSON sources
  return props.nam_ja || props.name_ja || props.name || props.NAME || props.nam || null;
}

/**
 * Create a feature collection for specific prefectures with photo counts
 */
export function createPrefectureFeatures(
  geoData: FeatureCollection,
  prefectureCounts: Map<string, { count: number; intensity: number }>
): FeatureCollection<Polygon | MultiPolygon> {
  const matchedFeatures: Feature<Polygon | MultiPolygon>[] = [];

  for (const feature of geoData.features) {
    const prefName = getPrefectureName(feature);
    if (!prefName) continue;

    // Try to match prefecture name (handling variations like 東京都 vs 東京)
    const normalizedName = normalizePrefectureName(prefName);
    
    for (const [countKey, data] of prefectureCounts.entries()) {
      const normalizedCountKey = normalizePrefectureName(countKey);
      
      if (normalizedName === normalizedCountKey || 
          normalizedName.includes(normalizedCountKey) || 
          normalizedCountKey.includes(normalizedName)) {
        
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
          matchedFeatures.push({
            type: 'Feature',
            properties: {
              name: prefName,
              count: data.count,
              intensity: data.intensity,
            },
            geometry: geometry as Polygon | MultiPolygon,
          });
        }
        break;
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: matchedFeatures,
  };
}

/**
 * Normalize prefecture name for matching
 */
function normalizePrefectureName(name: string): string {
  return name
    .replace(/都$/, '')
    .replace(/道$/, '')
    .replace(/府$/, '')
    .replace(/県$/, '')
    .trim();
}

/**
 * Get color for prefecture based on intensity
 */
export function getAdminAreaColor(intensity: number): string {
  // Use HSL color scale from blue (low) through yellow to red (high)
  const hue = 210 - (intensity * 210); // 210 (blue) -> 0 (red)
  const saturation = 70 + (intensity * 15); // 70-85%
  const lightness = 50 + (intensity * 10); // 50-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Check if GeoJSON data is loaded
 */
export function isGeoDataLoaded(): boolean {
  return prefectureGeoJSON !== null;
}

/**
 * Clear cached GeoJSON data
 */
export function clearGeoDataCache(): void {
  prefectureGeoJSON = null;
  loadPromise = null;
}
