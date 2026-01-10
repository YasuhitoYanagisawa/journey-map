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
  const token = localStorage.getItem(MAPBOX_TOKEN_KEY);
  console.log('Mapbox token check:', token ? `Found (length: ${token.length})` : 'Not found');
  return token;
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
    // Include address type for Japanese 丁目 extraction
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=region,district,place,locality,neighborhood,address&language=ja&access_token=${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const features = data.features || [];

    let prefecture: string | null = null;
    let city: string | null = null;
    let town: string | null = null;

    const toHalfWidthDigits = (s: string) =>
      s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

    const kanjiToNumber = (kanji: string): number | null => {
      const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
      if (!kanji) return null;
      if (kanji === '十') return 10;
      if (!kanji.includes('十')) {
        // Simple digit (一〜九)
        if (kanji.length === 1 && map[kanji] != null) return map[kanji];
        return null;
      }

      const parts = kanji.split('十');
      const tensPart = parts[0];
      const onesPart = parts[1];
      const tens = tensPart ? map[tensPart] : 1;
      if (tens == null) return null;
      const ones = onesPart ? map[onesPart] : 0;
      if (onesPart && ones == null) return null;
      return tens * 10 + ones;
    };

    const normalizeChome = (s: string): string => {
      let x = toHalfWidthDigits(s).replace(/[\s　]/g, '');
      // Convert kanji numerals in "〇丁目" to arabic
      x = x.replace(/([一二三四五六七八九十]+)丁目/g, (m, k) => {
        const n = kanjiToNumber(k);
        return n != null ? `${n}丁目` : m;
      });
      // If there is a 丁目, cut anything after it
      const idx = x.indexOf('丁目');
      if (idx >= 0) x = x.slice(0, idx + 2);
      return x;
    };

    const extractChomeFromAddress = (s: string | null): string | null => {
      if (!s) return null;
      // Simply normalize and cut at 丁目 - the address text field is already clean
      return normalizeChome(s);
    };

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
    let addressName: string | null = null;
    let addressPlaceName: string | null = null;

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
      } else if (placeType === 'address') {
        addressName = text;
        addressPlaceName = feature.place_name_ja || feature.place_name || null;
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
      } else if (id.startsWith('address.') && !addressName) {
        addressName = text;
      }
    }

    // Assign prefecture
    prefecture = regionName;

    // Use addressName (text field) directly - it's already clean like "弥生町3丁目13番"
    const chomeFromAddress = extractChomeFromAddress(addressName);

    // Special handling for Tokyo 23 wards and other designated cities:
    // - If locality ends with 区, it's a ward (use as city)
    // - If place is same as region (both 東京都), skip place and use locality as city
    if (localityName && localityName.endsWith('区')) {
      // This is a ward (ku) - treat as city level
      city = localityName;
      town = neighborhoodName || chomeFromAddress;
    } else if (districtName && districtName.endsWith('区')) {
      // District is a ward
      city = districtName;
      town = neighborhoodName || chomeFromAddress || localityName;
    } else if (placeName && placeName !== regionName) {
      // Normal city/town
      city = placeName;
      town = neighborhoodName || chomeFromAddress || localityName;
    } else if (placeName === regionName && localityName) {
      // place is same as region (e.g., both 東京都), use locality as city
      city = localityName;
      town = neighborhoodName || chomeFromAddress;
    } else {
      // Fallback
      city = placeName || districtName || localityName;
      town = neighborhoodName || chomeFromAddress;
    }

    // Ensure town isn't accidentally the same as city
    if (town && city && town === city) {
      town = null;
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
