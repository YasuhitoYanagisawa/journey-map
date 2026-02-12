import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Key } from 'lucide-react';
import { EventItem } from '@/types/event';

const MAPBOX_TOKEN_KEY = 'phototrail_mapbox_token';

interface EventMapViewProps {
  events: EventItem[];
  selectedEvent?: EventItem | null;
  onEventSelect?: (event: EventItem | null) => void;
}

const EventMapView = ({ events, selectedEvent, onEventSelect }: EventMapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [mapboxToken, setMapboxToken] = useState<string>(() =>
    localStorage.getItem(MAPBOX_TOKEN_KEY) || ''
  );
  const [isTokenSet, setIsTokenSet] = useState(() => {
    const saved = localStorage.getItem(MAPBOX_TOKEN_KEY);
    return saved ? saved.trim().length > 0 : false;
  });

  const handleSetToken = () => {
    if (mapboxToken.trim()) {
      localStorage.setItem(MAPBOX_TOKEN_KEY, mapboxToken.trim());
      setIsTokenSet(true);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !isTokenSet) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [139.6917, 35.6895],
      zoom: 5,
    });

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    return () => {
      map.current?.remove();
    };
  }, [isTokenSet, mapboxToken]);

  // Update markers
  useEffect(() => {
    if (!map.current || !isTokenSet) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (events.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    events.forEach((event) => {
      if (!event.latitude || !event.longitude) return;

      const el = document.createElement('div');
      el.style.cssText = `
        width: 28px; height: 28px;
        background: ${event.visited ? 'hsl(120, 60%, 45%)' : 'hsl(24, 95%, 53%)'};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px;
      `;
      el.innerHTML = event.visited ? '✓' : '🏮';

      const popup = new mapboxgl.Popup({ offset: 25, maxWidth: '250px' })
        .setHTML(`
          <div style="padding: 8px; color: #333;">
            <p style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${event.name}</p>
            ${event.location_name ? `<p style="font-size: 12px; color: #666;">📍 ${event.location_name}</p>` : ''}
            ${event.event_start ? `<p style="font-size: 12px; color: #666;">📅 ${event.event_start}${event.event_end && event.event_end !== event.event_start ? ` 〜 ${event.event_end}` : ''}</p>` : ''}
            ${event.description ? `<p style="font-size: 11px; color: #888; margin-top: 4px;">${event.description}</p>` : ''}
            ${event.visited ? '<p style="font-size: 12px; color: green; margin-top: 4px;">✓ 訪問済み</p>' : '<p style="font-size: 12px; color: orange; margin-top: 4px;">○ 未訪問</p>'}
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([event.longitude, event.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      el.addEventListener('click', () => onEventSelect?.(event));

      markersRef.current.push(marker);
      bounds.extend([event.longitude, event.latitude]);
    });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    }
  }, [events, isTokenSet, onEventSelect]);

  // Fly to selected event
  useEffect(() => {
    if (!map.current || !selectedEvent?.latitude || !selectedEvent?.longitude) return;
    map.current.flyTo({
      center: [selectedEvent.longitude, selectedEvent.latitude],
      zoom: 14,
      duration: 800,
    });
  }, [selectedEvent]);

  if (!isTokenSet) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <Key className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            地図を表示するにはMapbox APIキーが必要です
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Mapbox Access Token"
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetToken()}
              className="text-sm"
            />
            <Button onClick={handleSetToken} size="sm">設定</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className="w-full h-full rounded-lg map-container" />
  );
};

export default EventMapView;
