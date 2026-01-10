/**
 * Japan GeoJSON data loader for administrative boundary visualization
 * Uses simplified GeoJSON data from external sources for efficient loading
 */

import { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

// Cache for loaded GeoJSON data
let prefectureGeoJSON: FeatureCollection | null = null;
let cityGeoJSONCache: Map<string, FeatureCollection> = new Map();
let isLoadingPrefecture = false;
let loadPrefecturePromise: Promise<FeatureCollection | null> | null = null;

// GeoJSON source URLs
const PREFECTURE_GEOJSON_URL = 'https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson';

// Prefecture code mapping for city GeoJSON URLs
const PREFECTURE_CODES: Record<string, string> = {
  '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04', '秋田県': '05',
  '山形県': '06', '福島県': '07', '茨城県': '08', '栃木県': '09', '群馬県': '10',
  '埼玉県': '11', '千葉県': '12', '東京都': '13', '神奈川県': '14', '新潟県': '15',
  '富山県': '16', '石川県': '17', '福井県': '18', '山梨県': '19', '長野県': '20',
  '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24', '滋賀県': '25',
  '京都府': '26', '大阪府': '27', '兵庫県': '28', '奈良県': '29', '和歌山県': '30',
  '鳥取県': '31', '島根県': '32', '岡山県': '33', '広島県': '34', '山口県': '35',
  '徳島県': '36', '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40',
  '佐賀県': '41', '長崎県': '42', '熊本県': '43', '大分県': '44', '宮崎県': '45',
  '鹿児島県': '46', '沖縄県': '47',
  // Short versions
  '北海': '01', '青森': '02', '岩手': '03', '宮城': '04', '秋田': '05',
  '山形': '06', '福島': '07', '茨城': '08', '栃木': '09', '群馬': '10',
  '埼玉': '11', '千葉': '12', '東京': '13', '神奈川': '14', '新潟': '15',
  '富山': '16', '石川': '17', '福井': '18', '山梨': '19', '長野': '20',
  '岐阜': '21', '静岡': '22', '愛知': '23', '三重': '24', '滋賀': '25',
  '京都': '26', '大阪': '27', '兵庫': '28', '奈良': '29', '和歌山': '30',
  '鳥取': '31', '島根': '32', '岡山': '33', '広島': '34', '山口': '35',
  '徳島': '36', '香川': '37', '愛媛': '38', '高知': '39', '福岡': '40',
  '佐賀': '41', '長崎': '42', '熊本': '43', '大分': '44', '宮崎': '45',
  '鹿児島': '46', '沖縄': '47',
};

/**
 * Get prefecture code from name
 */
function getPrefectureCode(prefectureName: string): string | null {
  // Try direct match first
  if (PREFECTURE_CODES[prefectureName]) {
    return PREFECTURE_CODES[prefectureName];
  }
  
  // Try normalized versions
  const normalized = normalizePrefectureName(prefectureName);
  for (const [key, code] of Object.entries(PREFECTURE_CODES)) {
    if (normalizePrefectureName(key) === normalized) {
      return code;
    }
  }
  
  return null;
}

/**
 * Load prefecture-level GeoJSON data
 */
export async function loadPrefectureGeoJSON(): Promise<FeatureCollection | null> {
  if (prefectureGeoJSON) {
    return prefectureGeoJSON;
  }

  if (isLoadingPrefecture && loadPrefecturePromise) {
    return loadPrefecturePromise;
  }

  isLoadingPrefecture = true;
  loadPrefecturePromise = fetchGeoJSON(PREFECTURE_GEOJSON_URL);

  try {
    prefectureGeoJSON = await loadPrefecturePromise;
    return prefectureGeoJSON;
  } finally {
    isLoadingPrefecture = false;
  }
}

/**
 * Load city-level GeoJSON data for specific prefectures
 */
export async function loadCityGeoJSON(prefectureNames: string[]): Promise<FeatureCollection | null> {
  const features: Feature[] = [];
  const fetchPromises: Promise<void>[] = [];

  for (const prefName of prefectureNames) {
    const code = getPrefectureCode(prefName);
    if (!code) continue;

    // Check cache
    if (cityGeoJSONCache.has(code)) {
      const cached = cityGeoJSONCache.get(code)!;
      features.push(...cached.features);
      continue;
    }

    // Fetch from GitHub
    const url = `https://raw.githubusercontent.com/niiyz/JapanCityGeoJson/master/geojson/prefectures/${code}.json`;
    
    fetchPromises.push(
      fetchGeoJSON(url).then(data => {
        if (data) {
          cityGeoJSONCache.set(code, data);
          features.push(...data.features);
        }
      }).catch(err => {
        console.warn(`Failed to load city GeoJSON for ${prefName}:`, err);
      })
    );
  }

  await Promise.all(fetchPromises);

  if (features.length === 0) {
    return null;
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function fetchGeoJSON(url: string): Promise<FeatureCollection | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GeoJSON: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Invalid GeoJSON format');
    }

    return data as FeatureCollection;
  } catch (error) {
    console.error('Error loading GeoJSON:', error);
    return null;
  }
}

/**
 * Get prefecture name from GeoJSON properties
 */
export function getPrefectureName(feature: Feature): string | null {
  const props = feature.properties;
  if (!props) return null;
  
  return props.nam_ja || props.name_ja || props.name || props.NAME || props.nam || null;
}

/**
 * Get city name from GeoJSON properties (niiyz/JapanCityGeoJson format)
 */
export function getCityName(feature: Feature): string | null {
  const props = feature.properties;
  if (!props) return null;
  
  // niiyz format uses 'name' for city name
  return props.name || props.N03_004 || props.N03_003 || null;
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
 * Create a feature collection for specific cities with photo counts
 */
export function createCityFeatures(
  geoData: FeatureCollection,
  cityCounts: Map<string, { count: number; intensity: number }>
): FeatureCollection<Polygon | MultiPolygon> {
  const matchedFeatures: Feature<Polygon | MultiPolygon>[] = [];
  const matched = new Set<string>();

  for (const feature of geoData.features) {
    const cityName = getCityName(feature);
    if (!cityName) continue;

    const normalizedCityName = normalizeCityName(cityName);
    
    for (const [countKey, data] of cityCounts.entries()) {
      if (matched.has(countKey)) continue;
      
      const normalizedCountKey = normalizeCityName(countKey);
      
      // Match city names (handle variations like 中野区 vs 中野)
      if (normalizedCityName === normalizedCountKey || 
          normalizedCityName.includes(normalizedCountKey) || 
          normalizedCountKey.includes(normalizedCityName)) {
        
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
          matchedFeatures.push({
            type: 'Feature',
            properties: {
              name: cityName,
              matchedName: countKey,
              count: data.count,
              intensity: data.intensity,
            },
            geometry: geometry as Polygon | MultiPolygon,
          });
          matched.add(countKey);
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
 * Normalize city name for matching
 */
function normalizeCityName(name: string): string {
  return name
    .replace(/市$/, '')
    .replace(/区$/, '')
    .replace(/町$/, '')
    .replace(/村$/, '')
    .replace(/郡$/, '')
    .trim();
}

/**
 * Get color for admin area based on intensity
 */
export function getAdminAreaColor(intensity: number): string {
  const hue = 210 - (intensity * 210);
  const saturation = 70 + (intensity * 15);
  const lightness = 50 + (intensity * 10);
  
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
  cityGeoJSONCache.clear();
  loadPrefecturePromise = null;
}
