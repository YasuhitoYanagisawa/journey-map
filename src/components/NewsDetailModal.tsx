import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Newspaper, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
}

interface NewsDetailModalProps {
  news: NewsItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const NewsDetailModal = ({ news, isOpen, onClose }: NewsDetailModalProps) => {
  if (!news) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, type: 'spring', damping: 25 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50"
          >
            <div className="glass-panel p-6 rounded-xl shadow-2xl">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-primary">ニュース詳細</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-foreground mb-4 leading-relaxed">
                {news.title}
              </h2>

              {/* Source */}
              {news.source && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {news.source}
                  </span>
                </div>
              )}

              {/* Summary */}
              {news.summary && (
                <div className="mb-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {news.summary}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                {news.url && (
                  <Button
                    asChild
                    className="flex-1"
                  >
                    <a
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      記事を読む
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  閉じる
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NewsDetailModal;
