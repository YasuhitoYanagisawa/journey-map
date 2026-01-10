/**
 * Reverse geocode coordinates to get administrative area names using Mapbox API
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
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=region,place,locality,neighborhood&language=ja&access_token=${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const features = data.features || [];

    let prefecture: string | null = null;
    let city: string | null = null;
    let town: string | null = null;

    for (const feature of features) {
      const placeType = feature.place_type?.[0];
      const text = feature.text_ja || feature.text;

      if (placeType === 'region') {
        prefecture = text;
      } else if (placeType === 'place') {
        city = text;
      } else if (placeType === 'locality' || placeType === 'neighborhood') {
        if (!town) town = text;
      }
    }

    // Also check context for additional info
    const context = features[0]?.context || [];
    for (const ctx of context) {
      const id = ctx.id || '';
      const text = ctx.text_ja || ctx.text;

      if (id.startsWith('region.') && !prefecture) {
        prefecture = text;
      } else if (id.startsWith('place.') && !city) {
        city = text;
      } else if ((id.startsWith('locality.') || id.startsWith('neighborhood.')) && !town) {
        town = text;
      }
    }

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
