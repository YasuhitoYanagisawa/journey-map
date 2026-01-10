import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { PhotoLocation, ViewMode } from '@/types/photo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Key } from 'lucide-react';
import { buildPhotoGrid, getGridCellColor, GridStats } from '@/utils/gridCalculator';
import { AdminBoundaryStats } from '@/utils/adminBoundaryCalculator';
import { loadPrefectureGeoJSON, loadCityGeoJSON, createPrefectureFeatures, createCityFeatures, getAdminAreaColor } from '@/utils/japanGeoData';

interface PhotoMapProps {
  photos: PhotoLocation[];
  viewMode: ViewMode;
  onGridStatsChange?: (stats: GridStats | null) => void;
  highlightedCellId?: string | null;
  filteredIndices?: number[] | null;
  adminStats?: AdminBoundaryStats | null;
  highlightedAreaId?: string | null;
}

const MAPBOX_TOKEN_KEY = 'phototrail_mapbox_token';

const PhotoMap = ({ photos, viewMode, onGridStatsChange, highlightedCellId, filteredIndices, adminStats, highlightedAreaId }: PhotoMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  
  // Load token from localStorage on init
  const [mapboxToken, setMapboxToken] = useState<string>(() => {
    return localStorage.getItem(MAPBOX_TOKEN_KEY) || '';
  });
  const [isTokenSet, setIsTokenSet] = useState(() => {
    const saved = localStorage.getItem(MAPBOX_TOKEN_KEY);
    return saved ? saved.trim().length > 0 : false;
  });
  const [mapLoaded, setMapLoaded] = useState(false);

  // Filter photos based on indices
  const displayPhotos = useMemo(() => {
    if (!filteredIndices) return photos;
    return filteredIndices.map(i => photos[i]).filter(Boolean);
  }, [photos, filteredIndices]);

  // Calculate grid stats when in grid mode
  const gridStats = useMemo(() => {
    if (viewMode !== 'grid' || displayPhotos.length === 0) return null;
    return buildPhotoGrid(displayPhotos, 500);
  }, [displayPhotos, viewMode]);

  // Notify parent of grid stats
  useEffect(() => {
    onGridStatsChange?.(gridStats);
  }, [gridStats, onGridStatsChange]);

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
      center: displayPhotos.length > 0 
        ? [displayPhotos[0].longitude, displayPhotos[0].latitude]
        : [139.6917, 35.6895], // Tokyo default
      zoom: 12,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      setMapLoaded(false);
      map.current?.remove();
    };
  }, [isTokenSet, mapboxToken]);

  // Helper to clean up all map layers/sources
  const cleanupMapLayers = useCallback(() => {
    if (!map.current) return;

    // Remove grid layers
    ['grid-fill', 'grid-outline', 'grid-label'].forEach((layerId) => {
      if (map.current!.getLayer(layerId)) {
        map.current!.removeLayer(layerId);
      }
    });
    if (map.current.getSource('grid')) {
      map.current.removeSource('grid');
    }

    // Remove photo layers
    if (map.current.getSource('photos')) {
      if (map.current.getLayer('photo-heat')) {
        map.current.removeLayer('photo-heat');
      }
      if (map.current.getLayer('photo-route')) {
        map.current.removeLayer('photo-route');
      }
      map.current.removeSource('photos');
    }

    // Remove route layers
    if (map.current.getSource('route')) {
      if (map.current.getLayer('route-line')) {
        map.current.removeLayer('route-line');
      }
      map.current.removeSource('route');
    }

    // Remove cluster layers
    if (map.current.getSource('photos-cluster')) {
      ['clusters', 'cluster-count', 'unclustered-point'].forEach((layerId) => {
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
      });
      map.current.removeSource('photos-cluster');
    }

    // Remove admin area layers
    if (map.current.getSource('admin-areas')) {
      ['admin-points', 'admin-labels'].forEach((layerId) => {
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
      });
      map.current.removeSource('admin-areas');
    }

    // Remove admin polygon layers
    if (map.current.getSource('admin-polygons')) {
      ['admin-polygon-fill', 'admin-polygon-outline', 'admin-polygon-labels'].forEach((layerId) => {
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
      });
      map.current.removeSource('admin-polygons');
    }
  }, []);

  // Show popup for a photo
  const showPhotoPopup = useCallback((photo: PhotoLocation, index: number, total: number) => {
    if (!map.current) return;

    // Close existing popup
    if (popupRef.current) {
      popupRef.current.remove();
    }

    popupRef.current = new mapboxgl.Popup({ 
      offset: 25,
      closeButton: true,
      closeOnClick: true,
      maxWidth: '200px'
    })
      .setLngLat([photo.longitude, photo.latitude])
      .setHTML(`
        <div style="padding: 8px; color: #333;">
          <img src="${photo.thumbnailUrl}" style="width: 150px; height: 100px; object-fit: cover; border-radius: 4px;" />
          <p style="margin-top: 8px; font-size: 12px; font-weight: 500;">${photo.filename}</p>
          <p style="margin-top: 4px; font-size: 11px; color: #666;">
            ${photo.timestamp.toLocaleString('ja-JP')}
          </p>
          <p style="margin-top: 2px; font-size: 11px; color: #888;">
            #${index + 1} / ${total}
          </p>
        </div>
      `)
      .addTo(map.current);
  }, []);

  // Update markers/visualization
  useEffect(() => {
    if (!map.current || !isTokenSet || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Close existing popup
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    cleanupMapLayers();

    if (displayPhotos.length === 0) return;

    // Fit bounds to photos
    const bounds = new mapboxgl.LngLatBounds();
    displayPhotos.forEach((photo) => {
      bounds.extend([photo.longitude, photo.latitude]);
    });
    map.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });

    const sortedPhotos = [...displayPhotos].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (viewMode === 'markers') {
      // Use clustering for markers
      const geojsonData = {
        type: 'FeatureCollection' as const,
        features: sortedPhotos.map((photo, index) => ({
          type: 'Feature' as const,
          properties: {
            id: index,
            thumbnailUrl: photo.thumbnailUrl,
            filename: photo.filename,
            timestamp: photo.timestamp.toISOString(),
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [photo.longitude, photo.latitude],
          },
        })),
      };

      map.current.addSource('photos-cluster', {
        type: 'geojson',
        data: geojsonData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'photos-cluster',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            'hsl(24, 95%, 53%)',    // 1-9: orange
            10,
            'hsl(36, 100%, 50%)',   // 10-29: amber
            30,
            'hsl(0, 80%, 55%)',     // 30+: red
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,   // 1-9
            10,
            25,   // 10-29
            30,
            35,   // 30+
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'photos-cluster',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 14,
        },
        paint: {
          'text-color': '#fff',
        },
      });

      // Individual photo points (when not clustered)
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'photos-cluster',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'hsl(24, 95%, 53%)',
          'circle-radius': 12,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      });

      // Click handlers for clusters
      map.current.on('click', 'clusters', (e) => {
        const features = map.current!.queryRenderedFeatures(e.point, {
          layers: ['clusters'],
        });
        const clusterId = features[0].properties?.cluster_id;
        const source = map.current!.getSource('photos-cluster') as mapboxgl.GeoJSONSource;
        
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;

          map.current!.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: zoom,
          });
        });
      });

      // Click handler for individual points
      map.current.on('click', 'unclustered-point', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        if (!props) return;

        const photo = sortedPhotos[props.id];
        if (photo) {
          showPhotoPopup(photo, props.id, sortedPhotos.length);
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

    } else if (viewMode === 'heatmap') {
      // Add heatmap layer
      map.current.addSource('photos', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: displayPhotos.map((photo) => ({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [photo.longitude, photo.latitude],
            },
          })),
        },
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
            0,
            'rgba(0, 0, 0, 0)',
            0.2,
            'hsl(210, 60%, 50%)',
            0.4,
            'hsl(180, 70%, 50%)',
            0.6,
            'hsl(60, 80%, 55%)',
            0.8,
            'hsl(36, 100%, 50%)',
            1,
            'hsl(0, 80%, 55%)',
          ],
          'heatmap-radius': 40,
          'heatmap-opacity': 0.8,
        },
      });
    } else if (viewMode === 'route') {
      // Add route line
      const coordinates = sortedPhotos.map((photo) => [
        photo.longitude,
        photo.latitude,
      ]);

      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        },
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': 'hsl(24, 95%, 53%)',
          'line-width': 4,
          'line-opacity': 0.9,
        },
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
        const startMarker = new mapboxgl.Marker(startEl)
          .setLngLat([sortedPhotos[0].longitude, sortedPhotos[0].latitude])
          .addTo(map.current);
        markersRef.current.push(startMarker);

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
          const endMarker = new mapboxgl.Marker(endEl)
            .setLngLat([lastPhoto.longitude, lastPhoto.latitude])
            .addTo(map.current);
          markersRef.current.push(endMarker);
        }
      }
    } else if (viewMode === 'grid' && gridStats) {
      // Add grid cells as fill polygons
      const features = gridStats.cells.map((cell) => ({
        type: 'Feature' as const,
        properties: {
          id: cell.id,
          count: cell.count,
          intensity: cell.intensity,
          color: getGridCellColor(cell.intensity),
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [cell.bounds.minLng, cell.bounds.minLat],
              [cell.bounds.maxLng, cell.bounds.minLat],
              [cell.bounds.maxLng, cell.bounds.maxLat],
              [cell.bounds.minLng, cell.bounds.maxLat],
              [cell.bounds.minLng, cell.bounds.minLat],
            ],
          ],
        },
      }));

      map.current.addSource('grid', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });

      // Fill layer
      map.current.addLayer({
        id: 'grid-fill',
        type: 'fill',
        source: 'grid',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.55,
        },
      });

      // Outline layer
      map.current.addLayer({
        id: 'grid-outline',
        type: 'line',
        source: 'grid',
        paint: {
          'line-color': '#fff',
          'line-width': 1,
          'line-opacity': 0.4,
        },
      });

      // Label layer (count)
      map.current.addLayer({
        id: 'grid-label',
        type: 'symbol',
        source: 'grid',
        layout: {
          'text-field': ['get', 'count'],
          'text-size': 12,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
      });
    } else if (viewMode === 'admin' && adminStats && adminStats.cells.length > 0) {
      // Load GeoJSON and render polygons for prefecture/city levels
      const renderAdminPolygons = async () => {
        if (!map.current) return;

        // For prefecture level, try to load GeoJSON polygons
        if (adminStats.level === 'prefecture') {
          const geoData = await loadPrefectureGeoJSON();
          
          if (geoData && map.current) {
            const prefectureCounts = new Map<string, { count: number; intensity: number }>();
            adminStats.cells.forEach(cell => {
              prefectureCounts.set(cell.name, { count: cell.count, intensity: cell.intensity });
            });

            const prefectureFeatures = createPrefectureFeatures(geoData, prefectureCounts);

            if (prefectureFeatures.features.length > 0) {
              map.current.addSource('admin-polygons', {
                type: 'geojson',
                data: prefectureFeatures,
              });

              map.current.addLayer({
                id: 'admin-polygon-fill',
                type: 'fill',
                source: 'admin-polygons',
                paint: {
                  'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'intensity'],
                    0, 'hsl(210, 70%, 50%)',
                    0.3, 'hsl(180, 70%, 50%)',
                    0.5, 'hsl(60, 80%, 50%)',
                    0.7, 'hsl(36, 90%, 50%)',
                    1, 'hsl(0, 80%, 50%)',
                  ],
                  'fill-opacity': 0.6,
                },
              });

              map.current.addLayer({
                id: 'admin-polygon-outline',
                type: 'line',
                source: 'admin-polygons',
                paint: {
                  'line-color': '#fff',
                  'line-width': 2,
                  'line-opacity': 0.8,
                },
              });

              map.current.addLayer({
                id: 'admin-polygon-labels',
                type: 'symbol',
                source: 'admin-polygons',
                layout: {
                  'text-field': ['concat', ['get', 'name'], '\n', ['get', 'count'], '枚'],
                  'text-size': 14,
                  'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                },
                paint: {
                  'text-color': '#fff',
                  'text-halo-color': 'rgba(0,0,0,0.8)',
                  'text-halo-width': 2,
                },
              });

              map.current.on('click', 'admin-polygon-fill', (e) => {
                if (!e.features || e.features.length === 0) return;
                const props = e.features[0].properties;
                if (!props) return;

                const area = adminStats.cells.find(c => 
                  c.name === props.name || 
                  c.name.includes(props.name) || 
                  props.name.includes(c.name)
                );
                if (area) {
                  map.current!.flyTo({
                    center: [area.centerLng, area.centerLat],
                    zoom: 8,
                    duration: 800,
                  });
                }
              });

              map.current.on('mouseenter', 'admin-polygon-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'admin-polygon-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });

              return;
            }
          }
        }

        // For city level, load city GeoJSON for relevant prefectures
        if (adminStats.level === 'city') {
          // Get unique prefectures from photos that have city data
          const prefecturesWithPhotos = new Set<string>();
          displayPhotos.forEach(photo => {
            if ((photo as any).prefecture) {
              prefecturesWithPhotos.add((photo as any).prefecture);
            }
          });

          if (prefecturesWithPhotos.size > 0) {
            const geoData = await loadCityGeoJSON(Array.from(prefecturesWithPhotos));
            
            if (geoData && map.current) {
              const cityCounts = new Map<string, { count: number; intensity: number }>();
              adminStats.cells.forEach(cell => {
                cityCounts.set(cell.name, { count: cell.count, intensity: cell.intensity });
              });

              const cityFeatures = createCityFeatures(geoData, cityCounts);

              if (cityFeatures.features.length > 0) {
                map.current.addSource('admin-polygons', {
                  type: 'geojson',
                  data: cityFeatures,
                });

                map.current.addLayer({
                  id: 'admin-polygon-fill',
                  type: 'fill',
                  source: 'admin-polygons',
                  paint: {
                    'fill-color': [
                      'interpolate',
                      ['linear'],
                      ['get', 'intensity'],
                      0, 'hsl(210, 70%, 50%)',
                      0.3, 'hsl(180, 70%, 50%)',
                      0.5, 'hsl(60, 80%, 50%)',
                      0.7, 'hsl(36, 90%, 50%)',
                      1, 'hsl(0, 80%, 50%)',
                    ],
                    'fill-opacity': 0.6,
                  },
                });

                map.current.addLayer({
                  id: 'admin-polygon-outline',
                  type: 'line',
                  source: 'admin-polygons',
                  paint: {
                    'line-color': '#fff',
                    'line-width': 2,
                    'line-opacity': 0.8,
                  },
                });

                map.current.addLayer({
                  id: 'admin-polygon-labels',
                  type: 'symbol',
                  source: 'admin-polygons',
                  layout: {
                    'text-field': ['concat', ['get', 'name'], '\n', ['get', 'count'], '枚'],
                    'text-size': 13,
                    'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                  },
                  paint: {
                    'text-color': '#fff',
                    'text-halo-color': 'rgba(0,0,0,0.8)',
                    'text-halo-width': 2,
                  },
                });

                map.current.on('click', 'admin-polygon-fill', (e) => {
                  if (!e.features || e.features.length === 0) return;
                  const props = e.features[0].properties;
                  if (!props) return;

                  const area = adminStats.cells.find(c => 
                    c.name === props.name || 
                    c.name === props.matchedName ||
                    c.name.includes(props.name) || 
                    props.name.includes(c.name)
                  );
                  if (area) {
                    map.current!.flyTo({
                      center: [area.centerLng, area.centerLat],
                      zoom: 11,
                      duration: 800,
                    });
                  }
                });

                map.current.on('mouseenter', 'admin-polygon-fill', () => {
                  if (map.current) map.current.getCanvas().style.cursor = 'pointer';
                });
                map.current.on('mouseleave', 'admin-polygon-fill', () => {
                  if (map.current) map.current.getCanvas().style.cursor = '';
                });

                return;
              }
            }
          }
        }

        // Fallback: Use circle markers for town level or when GeoJSON fails
        const geojsonData = {
          type: 'FeatureCollection' as const,
          features: adminStats.cells.map((cell, index) => ({
            type: 'Feature' as const,
            properties: {
              id: cell.id,
              name: cell.name,
              count: cell.count,
              intensity: cell.intensity,
              rank: index + 1,
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [cell.centerLng, cell.centerLat],
            },
          })),
        };

        map.current.addSource('admin-areas', {
          type: 'geojson',
          data: geojsonData,
        });

        map.current.addLayer({
          id: 'admin-points',
          type: 'circle',
          source: 'admin-areas',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'count'],
              1, 20,
              10, 35,
              50, 55,
            ],
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'intensity'],
              0, 'hsl(210, 70%, 50%)',
              0.3, 'hsl(180, 70%, 50%)',
              0.5, 'hsl(60, 80%, 50%)',
              0.7, 'hsl(36, 90%, 50%)',
              1, 'hsl(0, 80%, 50%)',
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.75,
          },
        });

        map.current.addLayer({
          id: 'admin-labels',
          type: 'symbol',
          source: 'admin-areas',
          layout: {
            'text-field': ['concat', ['get', 'name'], '\n', ['get', 'count'], '枚'],
            'text-size': 13,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-offset': [0, 0],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#fff',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 2,
          },
        });

        map.current.on('click', 'admin-points', (e) => {
          if (!e.features || e.features.length === 0) return;
          const props = e.features[0].properties;
          if (!props) return;

          const area = adminStats.cells.find(c => c.id === props.id);
          if (area) {
            map.current!.flyTo({
              center: [area.centerLng, area.centerLat],
              zoom: 13,
              duration: 800,
            });
          }
        });

        map.current.on('mouseenter', 'admin-points', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'admin-points', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      };

      renderAdminPolygons();
    }
  }, [displayPhotos, viewMode, isTokenSet, mapLoaded, gridStats, adminStats, cleanupMapLayers, showPhotoPopup]);

  // Highlight cell when clicked from sidebar
  useEffect(() => {
    if (!map.current || !isTokenSet || !mapLoaded || viewMode !== 'grid' || !gridStats) return;

    const cell = gridStats.cells.find((c) => c.id === highlightedCellId);
    if (cell) {
      map.current.flyTo({
        center: [cell.centerLng, cell.centerLat],
        zoom: 15,
        duration: 800,
      });
    }
  }, [highlightedCellId, viewMode, isTokenSet, mapLoaded, gridStats]);

  // Highlight admin area when clicked from sidebar
  useEffect(() => {
    if (!map.current || !isTokenSet || !mapLoaded || viewMode !== 'admin' || !adminStats) return;

    const area = adminStats.cells.find((c) => c.id === highlightedAreaId);
    if (area) {
      map.current.flyTo({
        center: [area.centerLng, area.centerLat],
        zoom: 12,
        duration: 800,
      });
    }
  }, [highlightedAreaId, viewMode, isTokenSet, mapLoaded, adminStats]);

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
