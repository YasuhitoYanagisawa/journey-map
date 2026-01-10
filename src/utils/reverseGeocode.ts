/**
 * Reverse geocode coordinates to get administrative area names using Mapbox API
 * Optimized for Japanese administrative divisions
 */

interface GeocodingResult {
  prefecture: string | null;
  city: string | null;
  town: string | null;
}

const MAPBOX_TOKEN_KEY = 'phototrail_mapbox_token';

/**
 * Get the Mapbox token from localStorage
 */
function getMapboxToken(): string | null {
  return localStorage.getItem(MAPBOX_TOKEN_KEY);
}

/**
 * Reverse geocode a single coordinate
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodingResult> {
  const token = getMapboxToken();
  if (!token) {
    console.warn('Mapbox token not found');
    return { prefecture: null, city: null, town: null };
  }

  try {
    // Include district type for Japanese wards (区)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=region,district,place,locality,neighborhood&language=ja&access_token=${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const features = data.features || [];

    let prefecture: string | null = null;
    let city: string | null = null;
    let town: string | null = null;

    // Debug: Log API response for understanding structure
    console.log('Geocode features:', features.map((f: any) => ({
      type: f.place_type,
      text: f.text_ja || f.text,
      id: f.id
    })));

    // First pass: collect all admin levels
    let regionName: string | null = null;
    let placeName: string | null = null;
    let districtName: string | null = null;
    let localityName: string | null = null;
    let neighborhoodName: string | null = null;

    for (const feature of features) {
      const placeType = feature.place_type?.[0];
      const text = feature.text_ja || feature.text;

      if (placeType === 'region') {
        regionName = text;
      } else if (placeType === 'district') {
        districtName = text;
      } else if (placeType === 'place') {
        placeName = text;
      } else if (placeType === 'locality') {
        localityName = text;
      } else if (placeType === 'neighborhood') {
        neighborhoodName = text;
      }
    }

    // Also check context for additional info
    const context = features[0]?.context || [];
    for (const ctx of context) {
      const id = ctx.id || '';
      const text = ctx.text_ja || ctx.text;

      if (id.startsWith('region.') && !regionName) {
        regionName = text;
      } else if (id.startsWith('district.') && !districtName) {
        districtName = text;
      } else if (id.startsWith('place.') && !placeName) {
        placeName = text;
      } else if (id.startsWith('locality.') && !localityName) {
        localityName = text;
      } else if (id.startsWith('neighborhood.') && !neighborhoodName) {
        neighborhoodName = text;
      }
    }

    // Assign prefecture
    prefecture = regionName;

    // Special handling for Tokyo 23 wards and other designated cities:
    // - If locality ends with 区, it's a ward (use as city)
    // - If place is same as region (both 東京都), skip place and use locality as city
    if (localityName && localityName.endsWith('区')) {
      // This is a ward (ku) - treat as city level
      city = localityName;
      town = neighborhoodName;
    } else if (districtName && districtName.endsWith('区')) {
      // District is a ward
      city = districtName;
      town = localityName || neighborhoodName;
    } else if (placeName && placeName !== regionName) {
      // Normal city/town
      city = placeName;
      town = localityName || neighborhoodName;
    } else if (placeName === regionName && localityName) {
      // place is same as region (e.g., both 東京都), use locality as city
      city = localityName;
      town = neighborhoodName;
    } else {
      // Fallback
      city = placeName || districtName || localityName;
      town = neighborhoodName;
    }

    console.log('Parsed result:', { prefecture, city, town });

    return { prefecture, city, town };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return { prefecture: null, city: null, town: null };
  }
}

/**
 * Batch reverse geocode multiple coordinates with rate limiting
 */
export async function batchReverseGeocode(
  coordinates: Array<{ latitude: number; longitude: number }>,
  onProgress?: (completed: number, total: number) => void
): Promise<GeocodingResult[]> {
  const results: GeocodingResult[] = [];
  const total = coordinates.length;

  for (let i = 0; i < coordinates.length; i++) {
    const coord = coordinates[i];
    const result = await reverseGeocode(coord.latitude, coord.longitude);
    results.push(result);
    
    onProgress?.(i + 1, total);

    // Rate limit: 10 requests per second max for Mapbox free tier
    if (i < coordinates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  return results;
}
