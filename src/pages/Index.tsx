import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Camera } from 'lucide-react';
import PhotoDropzone from '@/components/PhotoDropzone';
import PhotoMap from '@/components/PhotoMap';
import StatsPanel from '@/components/StatsPanel';
import PhotoTimeline from '@/components/PhotoTimeline';
import GridStatsPanel from '@/components/GridStatsPanel';
import ViewModeToggle from '@/components/ViewModeToggle';
import { toast } from '@/components/ui/sonner';
import { PhotoLocation, ViewMode, DayStats } from '@/types/photo';
import { calculateDayStats } from '@/utils/statsCalculator';
import { GridStats } from '@/utils/gridCalculator';

const Index = () => {
  const [photos, setPhotos] = useState<PhotoLocation[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('markers');
  const [stats, setStats] = useState<DayStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gridStats, setGridStats] = useState<GridStats | null>(null);
  const [highlightedCellId, setHighlightedCellId] = useState<string | null>(null);

  const handlePhotosLoaded = (newPhotos: PhotoLocation[]) => {
    setIsLoading(true);
    
    // Merge with existing photos
    setPhotos(prev => {
      const merged = [...prev, ...newPhotos];
      const newStats = calculateDayStats(merged);
      setStats(newStats);
      return merged;
    });
    
    setIsLoading(false);
  };

  const hasPhotos = photos.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 rounded-t-none">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="p-2 bg-primary/10 rounded-lg">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">PhotoTrail</h1>
              <p className="text-xs text-muted-foreground">写真から1日の軌跡を可視化</p>
            </div>
          </motion.div>

          {hasPhotos && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Camera className="w-4 h-4" />
              <span>{photos.length}枚の写真</span>
            </motion.div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20">
        <AnimatePresence mode="wait">
          {!hasPhotos ? (
            /* Welcome Screen */
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center px-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-12"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', bounce: 0.4 }}
                  className="inline-flex p-4 bg-primary/10 rounded-2xl mb-6 glow-effect"
                >
                  <MapPin className="w-12 h-12 text-primary animate-float" />
                </motion.div>
                
                <h2 className="text-4xl md:text-5xl font-bold mb-4">
                  <span className="gradient-text">1日の軌跡</span>を
                  <br className="md:hidden" />
                  可視化しよう
                </h2>
                
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  スマートフォンで撮った写真をアップロードするだけで、
                  GPS情報から移動経路を美しく表示します
                </p>
              </motion.div>

              <PhotoDropzone 
                onPhotosLoaded={handlePhotosLoaded}
                isLoading={isLoading}
              />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 grid grid-cols-4 gap-6 text-center"
              >
                {[
                  { icon: '📍', label: 'マーカー表示' },
                  { icon: '🔥', label: 'ヒートマップ' },
                  { icon: '🛤️', label: 'ルート表示' },
                  { icon: '🗺️', label: 'グリッド統計' },
                ].map((feature) => (
                  <div key={feature.label} className="space-y-2">
                    <span className="text-3xl">{feature.icon}</span>
                    <p className="text-sm text-muted-foreground">{feature.label}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            /* Map View */
            <motion.div
              key="mapview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-[calc(100vh-5rem)] flex"
            >
              {/* Map Area */}
              <div className="flex-1 relative p-4">
                {/* View Mode Toggle */}
                <div className="absolute top-6 left-6 z-10">
                  <ViewModeToggle 
                    currentMode={viewMode}
                    onChange={setViewMode}
                  />
                </div>

                {/* Add More Photos Button */}
                <div className="absolute bottom-6 left-6 z-10">
                  <label className="glass-panel px-4 py-2 cursor-pointer flex items-center gap-2 hover:border-primary/50 transition-colors">
                    <Camera className="w-4 h-4 text-primary" />
                    <span className="text-sm">写真を追加</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          const { parseMultiplePhotos } = await import('@/utils/exifParser');
                          const newPhotos = await parseMultiplePhotos(files, {
                            concurrency: 4,
                            yieldEvery: 5,
                          });

                          const skipped = files.length - newPhotos.length;
                          if (newPhotos.length === 0) {
                            toast.error('位置情報のある写真が見つかりませんでした', {
                              description: '位置情報（GPS）がOFFの写真や位置情報なしの画像はスキップされます。',
                            });
                            return;
                          }

                          if (skipped > 0) {
                            toast.message('一部の写真をスキップしました', {
                              description: `読み込み: ${newPhotos.length}枚 / スキップ: ${skipped}枚`,
                            });
                          }

                          handlePhotosLoaded(newPhotos);
                        }
                      }}
                    />
                  </label>
                </div>

                <PhotoMap
                  photos={photos}
                  viewMode={viewMode}
                  onGridStatsChange={setGridStats}
                  highlightedCellId={highlightedCellId}
                />
              </div>

              {/* Sidebar */}
              <motion.div
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-80 p-4 space-y-4 overflow-y-auto"
              >
                {stats && <StatsPanel stats={stats} />}
                {viewMode === 'grid' && gridStats && (
                  <GridStatsPanel
                    gridStats={gridStats}
                    onCellClick={setHighlightedCellId}
                  />
                )}
                {viewMode !== 'grid' && <PhotoTimeline photos={photos} />}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
