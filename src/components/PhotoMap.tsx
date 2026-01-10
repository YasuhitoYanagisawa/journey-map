import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { PhotoLocation, ViewMode } from '@/types/photo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Key } from 'lucide-react';

interface PhotoMapProps {
  photos: PhotoLocation[];
  viewMode: ViewMode;
}

const PhotoMap = ({ photos, viewMode }: PhotoMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isTokenSet, setIsTokenSet] = useState(false);

  const handleSetToken = () => {
    if (mapboxToken.trim()) {
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
      center: photos.length > 0 
        ? [photos[0].longitude, photos[0].latitude]
        : [139.6917, 35.6895], // Tokyo default
      zoom: 12,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    return () => {
      map.current?.remove();
    };
  }, [isTokenSet, mapboxToken]);

  // Update markers/visualization
  useEffect(() => {
    if (!map.current || !isTokenSet || photos.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Remove existing layers
    if (map.current.getSource('photos')) {
      if (map.current.getLayer('photo-heat')) {
        map.current.removeLayer('photo-heat');
      }
      if (map.current.getLayer('photo-route')) {
        map.current.removeLayer('photo-route');
      }
      map.current.removeSource('photos');
    }

    if (map.current.getSource('route')) {
      if (map.current.getLayer('route-line')) {
        map.current.removeLayer('route-line');
      }
      map.current.removeSource('route');
    }

    // Fit bounds to photos
    if (photos.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      photos.forEach(photo => {
        bounds.extend([photo.longitude, photo.latitude]);
      });
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    }

    const sortedPhotos = [...photos].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (viewMode === 'markers') {
      // Add photo markers
      sortedPhotos.forEach((photo, index) => {
        const el = document.createElement('div');
        el.className = 'photo-marker';
        el.style.cssText = `
          width: 48px;
          height: 48px;
          border-radius: 8px;
          border: 3px solid hsl(24 95% 53%);
          background-image: url(${photo.thumbnailUrl});
          background-size: cover;
          background-position: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: transform 0.2s;
        `;
        el.onmouseenter = () => el.style.transform = 'scale(1.15)';
        el.onmouseleave = () => el.style.transform = 'scale(1)';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; color: #333;">
            <img src="${photo.thumbnailUrl}" style="width: 150px; height: 100px; object-fit: cover; border-radius: 4px;" />
            <p style="margin-top: 8px; font-size: 12px; font-weight: 500;">${photo.filename}</p>
            <p style="margin-top: 4px; font-size: 11px; color: #666;">
              ${photo.timestamp.toLocaleString('ja-JP')}
            </p>
            <p style="margin-top: 2px; font-size: 11px; color: #888;">
              #${index + 1} / ${photos.length}
            </p>
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([photo.longitude, photo.latitude])
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current.push(marker);
      });
    } else if (viewMode === 'heatmap') {
      // Add heatmap layer
      map.current.addSource('photos', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: photos.map(photo => ({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [photo.longitude, photo.latitude]
            }
          }))
        }
      });

      map.current.addLayer({
        id: 'photo-heat',
        type: 'heatmap',
        source: 'photos',
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.2, 'hsl(210, 60%, 50%)',
            0.4, 'hsl(180, 70%, 50%)',
            0.6, 'hsl(60, 80%, 55%)',
            0.8, 'hsl(36, 100%, 50%)',
            1, 'hsl(0, 80%, 55%)'
          ],
          'heatmap-radius': 40,
          'heatmap-opacity': 0.8
        }
      });
    } else if (viewMode === 'route') {
      // Add route line
      const coordinates = sortedPhotos.map(photo => [photo.longitude, photo.latitude]);

      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'hsl(24, 95%, 53%)',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // Add start/end markers
      if (sortedPhotos.length > 0) {
        const startEl = document.createElement('div');
        startEl.innerHTML = `
          <div style="
            width: 24px; height: 24px;
            background: hsl(120, 60%, 45%);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>
        `;
        new mapboxgl.Marker(startEl)
          .setLngLat([sortedPhotos[0].longitude, sortedPhotos[0].latitude])
          .addTo(map.current);
        markersRef.current.push(new mapboxgl.Marker(startEl));

        if (sortedPhotos.length > 1) {
          const endEl = document.createElement('div');
          endEl.innerHTML = `
            <div style="
              width: 24px; height: 24px;
              background: hsl(0, 70%, 50%);
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            "></div>
          `;
          const lastPhoto = sortedPhotos[sortedPhotos.length - 1];
          new mapboxgl.Marker(endEl)
            .setLngLat([lastPhoto.longitude, lastPhoto.latitude])
            .addTo(map.current);
          markersRef.current.push(new mapboxgl.Marker(endEl));
        }
      }
    }
  }, [photos, viewMode, isTokenSet]);

  if (!isTokenSet) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex items-center justify-center bg-card rounded-xl border border-border"
      >
        <div className="max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-primary/10 rounded-full mb-2">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Mapbox APIキー</h3>
            <p className="text-sm text-muted-foreground">
              地図を表示するには、Mapboxのパブリックトークンが必要です。
              <a 
                href="https://mapbox.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline ml-1"
              >
                mapbox.com
              </a>
              で無料アカウントを作成し、ダッシュボードからトークンをコピーしてください。
            </p>
          </div>
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="pk.eyJ1Ijoi..."
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              className="font-mono text-sm"
            />
            <Button 
              onClick={handleSetToken}
              className="w-full"
              disabled={!mapboxToken.trim()}
            >
              地図を表示
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="map-container w-full h-full min-h-[500px]">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};

export default PhotoMap;
