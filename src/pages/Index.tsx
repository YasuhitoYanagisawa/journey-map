import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Camera, LogIn, LogOut, Users, Loader2, CalendarDays, ListTodo, Eye, EyeOff } from 'lucide-react';
import PhotoDropzone from '@/components/PhotoDropzone';
import PhotoMap from '@/components/PhotoMap';
import StatsPanel from '@/components/StatsPanel';
import PhotoTimeline from '@/components/PhotoTimeline';
import NearbyNews from '@/components/NearbyNews';
import LayerToggle from '@/components/LayerToggle';
import EventTaskList from '@/components/EventTaskList';

import AdminStatsPanel from '@/components/AdminStatsPanel';
import ViewModeToggle from '@/components/ViewModeToggle';
import DateFilter from '@/components/DateFilter';
import { Button } from '@/components/ui/button';
import { ViewMode } from '@/types/photo';
import { EventItem } from '@/types/event';
import { calculateDayStats } from '@/utils/statsCalculator';

import { buildAdminBoundaryStats, AdminLevel, AdminBoundaryStats } from '@/utils/adminBoundaryCalculator';
import { useAuth } from '@/hooks/useAuth';
import { usePhotos } from '@/hooks/usePhotos';
import { useEvents } from '@/hooks/useEvents';
import { toast } from '@/components/ui/sonner';

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { photos, isLoading, isFetching, uploadPhotos, addLocalPhotos, updateAddressInfo } = usePhotos();
  const { events, upcomingEvents, visitedEvents, addMultipleEvents, toggleVisited, deleteEvent, autoMatchPhotos } = useEvents();
  
  const [viewMode, setViewMode] = useState<ViewMode>('markers');
  const [highlightedAreaId, setHighlightedAreaId] = useState<string | null>(null);
  const [filteredIndices, setFilteredIndices] = useState<number[] | null>(null);
  const [statsLabel, setStatsLabel] = useState<string>('全期間の統計');
  const [showPhotos, setShowPhotos] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showVisited, setShowVisited] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  
  
  const isAdminMode = viewMode.startsWith('admin-');
  const adminLevel: AdminLevel = viewMode === 'admin-city' ? 'city' : viewMode === 'admin-town' ? 'town' : 'prefecture';

  const handleFilterChange = useCallback((indices: number[] | null, label: string) => {
    setFilteredIndices(indices);
    setStatsLabel(label);
  }, []);

  const displayPhotos = useMemo(() => {
    if (filteredIndices === null) return photos;
    return filteredIndices.map(i => photos[i]).filter(Boolean);
  }, [photos, filteredIndices]);

  const stats = useMemo(() => {
    if (displayPhotos.length === 0) return null;
    return calculateDayStats(displayPhotos);
  }, [displayPhotos]);

  const adminStats = useMemo((): AdminBoundaryStats | null => {
    if (displayPhotos.length === 0) return null;
    return buildAdminBoundaryStats(displayPhotos, adminLevel);
  }, [displayPhotos, adminLevel]);

  const hasPhotosWithoutAddress = useMemo(() => {
    return photos.some(p => !p.prefecture && !p.city && !p.town);
  }, [photos]);

  const eventsWithLocation = useMemo(() =>
    events.filter(e => e.latitude && e.longitude),
    [events]
  );

  const handlePhotosLoaded = async (files: File[]) => {
    if (user) {
      await uploadPhotos(files);
    } else {
      const { parseMultiplePhotos } = await import('@/utils/exifParser');
      const parsed = await parseMultiplePhotos(files, { concurrency: 2, yieldEvery: 3 });
      addLocalPhotos(parsed);
    }
  };

  const handleAutoMatch = useCallback(async () => {
    if (photos.length === 0) {
      toast.error('写真がありません', { description: '先に写真をアップロードしてください' });
      return;
    }
    const matched = await autoMatchPhotos(photos.map(p => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
    })));
    if (matched === 0) {
      toast.message('マッチするイベントが見つかりませんでした');
    }
  }, [photos, autoMatchPhotos]);

  const handleEventClick = useCallback((event: EventItem) => {
    setSelectedEvent(event);
  }, []);

  const hasPhotos = photos.length > 0;
  const hasContent = hasPhotos || events.length > 0;

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
              <p className="text-xs text-muted-foreground">写真とイベントを地図で管理</p>
            </div>
          </motion.div>

          {hasContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              {hasPhotos && (
                <span className="flex items-center gap-1">
                  <Camera className="w-4 h-4" />
                  {photos.length}枚
                </span>
              )}
              {events.length > 0 && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-4 h-4" />
                  {events.length}件
                </span>
              )}
            </motion.div>
          )}
          
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('/feed')}>
                  <Users className="w-4 h-4 mr-2" />
                  フィード
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut} title="ログアウト">
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
                <LogIn className="w-4 h-4 mr-2" />
                ログイン
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20">
        <AnimatePresence mode="wait">
          {isFetching ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">データを読み込み中...</p>
            </motion.div>
          ) : !hasContent ? (
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
                onFilesSelected={handlePhotosLoaded}
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
                  { icon: '🏮', label: 'イベント管理' },
                  { icon: '🗺️', label: '行政区統計' },
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
              className="flex flex-col"
            >
              {/* News + Events Section - Above Map */}
              <div className="px-4 pt-4">
                <NearbyNews
                  photos={displayPhotos}
                  onAddEvents={addMultipleEvents}
                  isLoggedIn={!!user}
                />
              </div>

              {/* Map + Sidebar Row */}
              <div className="h-[calc(100vh-5rem)] flex">
                {/* Map Area */}
                <div className="flex-1 relative p-4">
                  {/* View Mode Toggle */}
                  <div className="absolute top-6 left-6 z-10 space-y-2">
                    {hasPhotos && (
                      <>
                        <ViewModeToggle 
                          currentMode={viewMode}
                          onChange={setViewMode}
                        />
                        <DateFilter 
                          photos={photos}
                          onFilterChange={handleFilterChange}
                        />
                      </>
                    )}
                    {/* Layer Toggle */}
                    <LayerToggle
                      showPhotos={showPhotos}
                      showEvents={showEvents}
                      onTogglePhotos={() => setShowPhotos(p => !p)}
                      onToggleEvents={() => setShowEvents(p => !p)}
                      photoCount={displayPhotos.length}
                      eventCount={eventsWithLocation.length}
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
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            handlePhotosLoaded(files);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <PhotoMap
                    photos={photos}
                    viewMode={showPhotos ? viewMode : 'markers'}
                    filteredIndices={showPhotos ? filteredIndices : []}
                    adminStats={showPhotos ? adminStats : null}
                    highlightedAreaId={highlightedAreaId}
                    events={eventsWithLocation}
                    showEvents={showEvents}
                    showPhotos={showPhotos}
                    onEventSelect={handleEventClick}
                  />
                </div>

                {/* Sidebar - Events */}
                <motion.div
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-80 p-4 space-y-4 overflow-y-auto"
                >
                  {/* Event Task List */}
                  <div className="glass-panel p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-sm">
                          {showVisited ? '訪問済み' : '予定イベント'}
                          <span className="text-muted-foreground ml-1">
                            ({showVisited ? visitedEvents.length : upcomingEvents.length})
                          </span>
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVisited(!showVisited)}
                        className="h-7 text-xs gap-1"
                      >
                        {showVisited ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showVisited ? '予定' : '訪問済み'}
                      </Button>
                    </div>

                    {user && !showVisited && upcomingEvents.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAutoMatch}
                        className="w-full mb-3 gap-2 text-xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        写真から自動消込
                      </Button>
                    )}

                    <EventTaskList
                      events={events}
                      onToggleVisited={toggleVisited}
                      onDelete={deleteEvent}
                      onEventClick={handleEventClick}
                      showVisited={showVisited}
                    />
                  </div>

                  {/* Photo Stats & Timeline */}
                  {hasPhotos && (
                    <>
                      {stats && <StatsPanel stats={stats} title={statsLabel} />}
                      {isAdminMode && adminStats && (
                        <AdminStatsPanel
                          stats={adminStats}
                          adminLevel={adminLevel}
                          onAreaClick={setHighlightedAreaId}
                          onUpdateAddressInfo={updateAddressInfo}
                          hasPhotosWithoutAddress={hasPhotosWithoutAddress}
                        />
                      )}
                      {!isAdminMode && <PhotoTimeline photos={displayPhotos} />}
                    </>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
