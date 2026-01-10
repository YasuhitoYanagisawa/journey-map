import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, ExternalLink, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { PhotoLocation } from '@/types/photo';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

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

  // Get the most common location and earliest date from photos
  const getSearchParams = () => {
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
  };

  const fetchNews = async () => {
    const params = getSearchParams();
    if (!params) return;

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

  // Don't auto-fetch, let user trigger it
  const searchParams = getSearchParams();

  if (!searchParams) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-panel p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold gradient-text">近くのニュース</h2>
        </div>
        {hasFetched && (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNews}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        📍 {searchParams.location} • 📅 {new Date(searchParams.date).toLocaleDateString('ja-JP')}
      </p>

      {!hasFetched && !isLoading && (
        <Button
          onClick={fetchNews}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          <Newspaper className="w-4 h-4 mr-2" />
          ニュースを検索
        </Button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">検索中...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive">
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
        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
          {news.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * index }}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground line-clamp-2">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  {item.source && (
                    <p className="text-xs text-primary/70 mt-1">
                      {item.source}
                    </p>
                  )}
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1.5 rounded hover:bg-primary/10 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-primary" />
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default NearbyNews;
