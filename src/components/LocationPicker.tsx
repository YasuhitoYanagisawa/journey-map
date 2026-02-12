import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number) => void;
  onCancel: () => void;
  initialCenter?: [number, number];
}

const LocationPicker = ({ onLocationSelect, onCancel, initialCenter = [139.7671, 35.6812] }: LocationPickerProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const getMapboxToken = () => localStorage.getItem('phototrail_mapbox_token') || '';

  useEffect(() => {
    const token = getMapboxToken();
    if (!token || !mapContainer.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: 10,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      setSelectedLocation({ lat, lng });

      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#ef4444' })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      map.remove();
    };
  }, [initialCenter]);

  const handleSearch = useCallback(async () => {
    const token = getMapboxToken();
    if (!searchQuery.trim() || !token) return;

    setSearching(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token}&country=jp&language=ja&limit=1`
      );
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
        setSelectedLocation({ lat, lng });

        if (markerRef.current) {
          markerRef.current.setLngLat([lng, lat]);
        } else if (mapRef.current) {
          markerRef.current = new mapboxgl.Marker({ color: '#ef4444' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        }
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="場所を検索（例：浅草寺）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <div
        ref={mapContainer}
        className="w-full h-48 rounded-lg overflow-hidden border border-border"
      />

      {selectedLocation && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3 text-red-500" />
          {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
        </p>
      )}

      <p className="text-xs text-muted-foreground">マップをタップして位置を設定してください</p>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!selectedLocation}
          onClick={() => selectedLocation && onLocationSelect(selectedLocation.lat, selectedLocation.lng)}
        >
          <MapPin className="w-3 h-3 mr-1" />
          この位置を設定
        </Button>
      </div>
    </div>
  );
};

export default LocationPicker;
