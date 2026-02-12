import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, ExternalLink, Loader2, AlertCircle, Navigation, CalendarDays, MapPin, Calendar, Plus, Check } from 'lucide-react';
import { PhotoLocation } from '@/types/photo';
import { EventSearchResult } from '@/types/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import NewsDetailModal from './NewsDetailModal';

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
}

interface NearbyNewsProps {
  photos: PhotoLocation[];
  onAddEvents?: (events: EventSearchResult[]) => Promise<number>;
  isLoggedIn?: boolean;
}

// Module-level guard to prevent re-fetching across remounts  
let globalAutoFetched = false;

const NearbyNews = ({ photos, onAddEvents, isLoggedIn }: NearbyNewsProps) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<EventSearchResult[]>([]);
  const [selectedEventIndices, setSelectedEventIndices] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  
  // Modal state
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Manual input states
  const [manualLocation, setManualLocation] = useState('');
  const [manualDate, setManualDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [currentLocationName, setCurrentLocationName] = useState<string | null>(null);
  
  const hasAutoFetched = useRef(false);
  const isFetchingRef = useRef(false);

  const handleNewsClick = (item: NewsItem) => {
    setSelectedNews(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedNews(null), 200);
  };

  // Get the most common location and earliest date from photos
  const getSearchParamsFromPhotos = useCallback(() => {
    if (photos.length === 0) return null;

    const locationCounts = new Map<string, number>();
    photos.forEach(photo => {
      const location = [photo.prefecture, photo.city].filter(Boolean).join(' ');
      if (location) {
        locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
      }
    });

    let mostCommonLocation = '';
    let maxCount = 0;
    locationCounts.forEach((count, location) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonLocation = location;
      }
    });

    const sortedPhotos = [...photos].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const earliestDate = sortedPhotos[0]?.timestamp;

    if (!mostCommonLocation || !earliestDate) return null;

    return {
      location: mostCommonLocation,
      date: earliestDate.toISOString(),
    };
  }, [photos]);

  // Reverse geocode coordinates to location name
  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja`
      );
      const data = await response.json();
      
      if (data.address) {
        const { state, city, town, village, suburb, county } = data.address;
        const parts = [state, city || county, town || village || suburb].filter(Boolean);
        return parts.join(' ') || null;
      }
      return null;
    } catch (err) {
      console.error('Reverse geocode failed:', err);
      return null;
    }
  };

  // Extract prefecture and city from location string
  const extractPrefectureCity = (location: string) => {
    const parts = location.split(/\s+/);
    const prefecture = parts[0] || '';
    const city = parts[1] || '';
    return { prefecture, city };
  };

  // Get current location
  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError('お使いのブラウザは位置情報をサポートしていません');
      return;
    }

    setIsGettingLocation(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      const locationName = await reverseGeocode(latitude, longitude);
      
      if (locationName) {
        setManualLocation(locationName);
        setCurrentLocationName(locationName);
      } else {
        setError('現在位置の住所を取得できませんでした');
      }
    } catch (err) {
      console.error('Geolocation error:', err);
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('位置情報の許可が必要です');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('位置情報を取得できませんでした');
            break;
          case err.TIMEOUT:
            setError('位置情報の取得がタイムアウトしました');
            break;
        }
      } else {
        setError('位置情報の取得に失敗しました');
      }
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Fetch both news and events in parallel
  const fetchLocalInfo = async (params: { location: string; date: string }) => {
    if (!params.location || !params.date) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    setIsLoading(true);
    setError(null);

    const { prefecture, city } = extractPrefectureCity(params.location);

    try {
      // Fetch news and events in parallel
      const [newsResult, eventsResult] = await Promise.allSettled([
        supabase.functions.invoke('search-news', { body: params }),
        supabase.functions.invoke('search-events', { body: { prefecture, city, period: '今後数ヶ月' } }),
      ]);

      // Process news
      if (newsResult.status === 'fulfilled') {
        const { data, error: fnError } = newsResult.value;
        if (!fnError && data && !data.error) {
          setNews(data.news || []);
        } else {
          console.error('News fetch error:', fnError || data?.error);
        }
      }

      // Process events
      if (eventsResult.status === 'fulfilled') {
        const { data, error: fnError } = eventsResult.value;
        if (!fnError && data && !data.error) {
          const fetchedEvents = data.events || [];
          setEvents(fetchedEvents);
          setSelectedEventIndices(new Set(fetchedEvents.map((_: any, i: number) => i)));
        } else {
          console.error('Events fetch error:', fnError || data?.error);
        }
      }

      setHasFetched(true);
    } catch (err) {
      console.error('Failed to fetch local info:', err);
      setError(err instanceof Error ? err.message : '情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  const handleSearchFromPhotos = () => {
    const params = getSearchParamsFromPhotos();
    if (params) {
      fetchLocalInfo(params);
    }
  };

  const handleSearchManual = () => {
    if (manualLocation && manualDate) {
      fetchLocalInfo({
        location: manualLocation,
        date: new Date(manualDate).toISOString(),
      });
    }
  };

  const toggleEventSelection = (index: number) => {
    setSelectedEventIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAddSelectedEvents = async () => {
    if (!onAddEvents) return;
    const selected = events.filter((_, i) => selectedEventIndices.has(i));
    if (selected.length > 0) {
      await onAddEvents(selected);
      setEvents([]);
      setSelectedEventIndices(new Set());
    }
  };

  const searchParamsFromPhotos = getSearchParamsFromPhotos();
  const hasPhotoParams = !!searchParamsFromPhotos;

  // Auto-fetch on mount: get current location + today's info
  useEffect(() => {
    if (hasAutoFetched.current || globalAutoFetched) return;
    hasAutoFetched.current = true;
    globalAutoFetched = true;
    
    const autoFetch = async () => {
      if (!navigator.geolocation) return;
      
      setIsGettingLocation(true);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 300000,
          });
        });
        
        const { latitude, longitude } = position.coords;
        const locationName = await reverseGeocode(latitude, longitude);
        
        if (locationName) {
          setManualLocation(locationName);
          setCurrentLocationName(locationName);
          fetchLocalInfo({
            location: locationName,
            date: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.log('Auto-location skipped:', err);
      } finally {
        setIsGettingLocation(false);
      }
    };
    
    autoFetch();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-panel p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold gradient-text">周辺ニュース・イベント</h2>
      </div>

      {/* Search Options */}
      <div className="space-y-4 mb-4">
        {hasPhotoParams && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-secondary/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{searchParamsFromPhotos.location}</span>
              <Calendar className="w-4 h-4 ml-2" />
              <span>{new Date(searchParamsFromPhotos.date).toLocaleDateString('ja-JP')}</span>
            </div>
            <Button
              onClick={handleSearchFromPhotos}
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="whitespace-nowrap"
            >
              <Newspaper className="w-4 h-4 mr-2" />
              写真の日付で検索
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-secondary/20">
          <div className="flex items-center gap-2 flex-1 w-full">
            <Button
              onClick={getCurrentLocation}
              variant="ghost"
              size="sm"
              disabled={isGettingLocation}
              className="shrink-0"
              title="現在地を取得"
            >
              {isGettingLocation ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
            </Button>
            <Input
              type="text"
              placeholder="場所を入力（例：東京都 渋谷区）"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              className="flex-1 h-8 text-sm"
            />
            <Input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="w-36 h-8 text-sm"
            />
          </div>
          <Button
            onClick={handleSearchManual}
            variant="outline"
            size="sm"
            disabled={isLoading || !manualLocation || !manualDate}
            className="whitespace-nowrap"
          >
            <Newspaper className="w-4 h-4 mr-2" />
            検索
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">ニュース・イベントを検索中...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {hasFetched && !isLoading && !error && news.length === 0 && events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          この地域の情報は見つかりませんでした
        </p>
      )}

      {/* News Results */}
      {news.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Newspaper className="w-3.5 h-3.5" />
            ニュース ({news.length}件)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {news.map((item, index) => (
              <motion.button
                key={index}
                onClick={() => handleNewsClick(item)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
                className="block p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group text-left w-full"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                    )}
                    {item.source && (
                      <p className="text-xs text-primary/70 mt-1">{item.source}</p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Events Results */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              周辺イベント ({events.length}件)
            </h3>
            {isLoggedIn && onAddEvents && (
              <Button
                onClick={handleAddSelectedEvents}
                size="sm"
                disabled={selectedEventIndices.size === 0}
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                選択した{selectedEventIndices.size}件を追加
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {events.map((event, index) => (
              <motion.button
                key={index}
                onClick={() => isLoggedIn ? toggleEventSelection(index) : undefined}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
                className={`block p-3 rounded-lg transition-colors text-left w-full ${
                  selectedEventIndices.has(index)
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  {isLoggedIn && (
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selectedEventIndices.has(index) ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                    }`}>
                      {selectedEventIndices.has(index) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{event.name}</p>
                    {event.location_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="line-clamp-1">{event.location_name}</span>
                      </p>
                    )}
                    {event.event_start && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {event.event_start}{event.event_end && event.event_end !== event.event_start ? ` 〜 ${event.event_end}` : ''}
                      </p>
                    )}
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{event.description}</p>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* News Detail Modal */}
      <NewsDetailModal
        news={selectedNews}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </motion.div>
  );
};

export default NearbyNews;
