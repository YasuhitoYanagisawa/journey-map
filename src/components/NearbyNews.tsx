import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, ExternalLink, Loader2, AlertCircle, RefreshCw, MapPin, Calendar, Navigation } from 'lucide-react';
import { PhotoLocation } from '@/types/photo';
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
}

const NearbyNews = ({ photos }: NearbyNewsProps) => {
  const [news, setNews] = useState<NewsItem[]>([]);
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

    // Get the most common prefecture/city combination
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

    // Get the earliest date
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

  const fetchNews = async (params: { location: string; date: string }) => {
    if (!params.location || !params.date) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('search-news', {
        body: params,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setNews(data.news || []);
      setHasFetched(true);
    } catch (err) {
      console.error('Failed to fetch news:', err);
      setError(err instanceof Error ? err.message : 'ニュースの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchFromPhotos = () => {
    const params = getSearchParamsFromPhotos();
    if (params) {
      fetchNews(params);
    }
  };

  const handleSearchManual = () => {
    if (manualLocation && manualDate) {
      fetchNews({
        location: manualLocation,
        date: new Date(manualDate).toISOString(),
      });
    }
  };

  const searchParamsFromPhotos = getSearchParamsFromPhotos();
  const hasPhotoParams = !!searchParamsFromPhotos;

  // Auto-fetch on mount: get current location + today's news
  useEffect(() => {
    if (hasAutoFetched.current) return;
    hasAutoFetched.current = true;
    
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
          // Auto-search with current location + today
          fetchNews({
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
        <h2 className="text-lg font-semibold gradient-text">ニュース検索</h2>
      </div>

      {/* Search Options */}
      <div className="space-y-4 mb-4">
        {/* Option 1: Search from photos (if available) */}
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

        {/* Option 2: Manual search with current location or typed location */}
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
          <span className="ml-2 text-sm text-muted-foreground">検索中...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {hasFetched && !isLoading && !error && news.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          この日のニュースは見つかりませんでした
        </p>
      )}

      {news.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {news.map((item, index) => (
            <motion.button
              key={index}
              onClick={() => handleNewsClick(item)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * index }}
              className="block p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group text-left w-full"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  {item.source && (
                    <p className="text-xs text-primary/70 mt-2">
                      {item.source}
                    </p>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
              </div>
            </motion.button>
          ))}
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
