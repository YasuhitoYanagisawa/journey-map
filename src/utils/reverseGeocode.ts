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

    // Process features in order of specificity (most specific first)
    for (const feature of features) {
      const placeType = feature.place_type?.[0];
      const text = feature.text_ja || feature.text;

      if (placeType === 'region') {
        // 都道府県 (prefecture)
        prefecture = text;
      } else if (placeType === 'district') {
        // 区 (ward/district) - treat as city for Tokyo special wards
        if (!city) city = text;
      } else if (placeType === 'place') {
        // 市町村 (city/town/village)
        if (!city) city = text;
      } else if (placeType === 'locality') {
        // 地区・町丁目 (locality/neighborhood)
        if (!town) town = text;
      } else if (placeType === 'neighborhood') {
        // 町丁目 (neighborhood)
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
      } else if (id.startsWith('district.') && !city) {
        // District in context = ward/ku
        city = text;
      } else if (id.startsWith('place.') && !city) {
        city = text;
      } else if ((id.startsWith('locality.') || id.startsWith('neighborhood.')) && !town) {
        town = text;
      }
    }

    // Special handling for Tokyo 23 wards:
    // If prefecture is 東京都 and city looks like a ward name (ends with 区),
    // make sure it's in city field, not town
    if (prefecture === '東京都' && town && town.endsWith('区') && !city) {
      city = town;
      town = null;
    }

    // If city is same as prefecture (e.g., both 東京都), try to use district info
    if (city === prefecture && town) {
      // Look for a more specific city/ward in the context
      for (const ctx of context) {
        const id = ctx.id || '';
        const text = ctx.text_ja || ctx.text;
        if ((id.startsWith('district.') || id.startsWith('place.')) && text !== prefecture) {
          city = text;
          break;
        }
      }
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
