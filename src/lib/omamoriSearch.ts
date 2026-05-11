// Distance and search utilities for Omamori datasets

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

type WithLatLng = { lat: number; lng: number; pref?: string };

// Build a prefecture-indexed map for fast pre-filtering
const indexCache = new WeakMap<object[], Map<string, object[]>>();

function getPrefIndex<T extends WithLatLng>(items: T[]): Map<string, T[]> {
  const cached = indexCache.get(items as unknown as object[]);
  if (cached) return cached as Map<string, T[]>;
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = item.pref || "";
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push(item);
  }
  indexCache.set(items as unknown as object[], map as unknown as Map<string, object[]>);
  return map;
}

// Approximate nearby prefectures by bounding box first
export function findNearby<T extends WithLatLng>(
  items: T[],
  lat: number,
  lng: number,
  radiusKm: number,
  limit = 50,
): Array<T & { _distance: number }> {
  // Rough lat/lng degree window
  const latDeg = radiusKm / 111;
  const lngDeg = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDeg;
  const maxLat = lat + latDeg;
  const minLng = lng - lngDeg;
  const maxLng = lng + lngDeg;

  const results: Array<T & { _distance: number }> = [];
  for (const item of items) {
    if (item.lat < minLat || item.lat > maxLat) continue;
    if (item.lng < minLng || item.lng > maxLng) continue;
    const d = haversineKm(lat, lng, item.lat, item.lng);
    if (d <= radiusKm) {
      results.push({ ...item, _distance: d });
    }
  }
  results.sort((a, b) => a._distance - b._distance);
  return results.slice(0, limit);
}

export function fullTextFilter<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  fields: (keyof T)[],
): T[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter((item) => {
    for (const f of fields) {
      const v = item[f];
      if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
      if (Array.isArray(v) && v.some((s) => typeof s === "string" && s.toLowerCase().includes(q))) {
        return true;
      }
    }
    return false;
  });
}

export function getMonthFromDate(date?: string): number | null {
  if (!date) return null;
  const m = date.match(/-(\d{2})-/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 12 ? n : null;
}

// Touch index helper to silence unused warning if needed
export function _warmIndex<T extends WithLatLng>(items: T[]) {
  getPrefIndex(items);
}
