export interface EventItem {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  location_name?: string | null;
  prefecture?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  event_start?: string | null;
  event_end?: string | null;
  visited: boolean;
  visited_at?: string | null;
  visited_photo_id?: string | null;
  source: 'manual' | 'ai';
  highlights?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSearchResult {
  name: string;
  location_name: string;
  prefecture: string;
  city: string;
  description: string;
  highlights: string;
  event_start: string | null;
  event_end: string | null;
  latitude: number | null;
  longitude: number | null;
}
