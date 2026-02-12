import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, LogIn, LogOut, Users, CalendarDays, ListTodo, Map, Eye, EyeOff, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useEvents } from '@/hooks/useEvents';
import { usePhotos } from '@/hooks/usePhotos';
import EventSearchPanel from '@/components/EventSearchPanel';
import EventTaskList from '@/components/EventTaskList';
import EventMapView from '@/components/EventMapView';
import { EventItem, EventSearchResult } from '@/types/event';
import { toast } from '@/components/ui/sonner';

const Events = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { events, upcomingEvents, visitedEvents, isLoading, searchEvents, addEvent, addMultipleEvents, toggleVisited, deleteEvent, autoMatchPhotos } = useEvents();
  const { photos } = usePhotos();
  const [showVisited, setShowVisited] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');

  const handleAddManual = useCallback(async (result: Partial<EventSearchResult>) => {
    await addEvent({
      name: result.name || '',
      description: result.description,
      location_name: result.location_name,
      prefecture: result.prefecture,
      city: result.city,
      event_start: result.event_start,
      event_end: result.event_end,
      source: 'manual',
    });
    toast.success('イベントを追加しました');
  }, [addEvent]);

  const handleAutoMatch = useCallback(async () => {
    if (photos.length === 0) {
      toast.error('写真がありません', {
        description: '先に写真をアップロードしてください',
      });
      return;
    }
    const matched = await autoMatchPhotos(photos.map(p => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
    })));
    if (matched === 0) {
      toast.message('マッチするイベントが見つかりませんでした', {
        description: '写真のGPS座標・撮影日時とイベントの場所・期間が一致しませんでした',
      });
    }
  }, [photos, autoMatchPhotos]);

  const handleEventClick = useCallback((event: EventItem) => {
    setSelectedEvent(event);
    if (event.latitude && event.longitude) {
      setView('map');
    }
  }, []);

  const eventsWithLocation = useMemo(() =>
    events.filter(e => e.latitude && e.longitude),
    [events]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 rounded-t-none">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="p-2 bg-primary/10 rounded-lg">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">PhotoTrail</h1>
              <p className="text-xs text-muted-foreground">イベント管理</p>
            </div>
          </motion.div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              <Camera className="w-4 h-4 mr-2" />
              写真マップ
            </Button>
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

      {/* Main */}
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left Column: Search + Task List */}
            <div className="lg:w-96 space-y-4">
              <EventSearchPanel
                onSearch={searchEvents}
                onAddResults={addMultipleEvents}
                onAddManual={handleAddManual}
                isLoading={isLoading}
                isLoggedIn={!!user}
              />

              {/* Task List Controls */}
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowVisited(!showVisited)}
                      className="h-7 text-xs gap-1"
                    >
                      {showVisited ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showVisited ? '予定を表示' : '訪問済みを表示'}
                    </Button>
                  </div>
                </div>

                {user && !showVisited && upcomingEvents.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoMatch}
                    className="w-full mb-3 gap-2 text-xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    写真から自動消込（GPS＋日時マッチ）
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
            </div>

            {/* Right Column: Map */}
            <div className="flex-1">
              <div className="glass-panel p-4 h-[calc(100vh-6rem)]">
                <div className="flex items-center gap-2 mb-3">
                  <Map className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-sm">イベントマップ</h3>
                  <span className="text-xs text-muted-foreground">
                    ({eventsWithLocation.length}件表示)
                  </span>
                </div>
                <div className="h-[calc(100%-2rem)]">
                  <EventMapView
                    events={eventsWithLocation}
                    selectedEvent={selectedEvent}
                    onEventSelect={setSelectedEvent}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Events;
