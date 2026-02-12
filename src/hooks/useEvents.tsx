import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { EventItem, EventSearchResult } from '@/types/event';
import { toast } from '@/components/ui/sonner';

export const useEvents = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setIsFetching(false);
      return;
    }

    try {
      setIsFetching(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .order('event_start', { ascending: true });

      if (error) throw error;
      setEvents((data || []) as unknown as EventItem[]);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsFetching(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const searchEvents = useCallback(async (prefecture: string, city?: string, period?: string): Promise<EventSearchResult[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-events', {
        body: { prefecture, city, period },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      return data.events || [];
    } catch (error) {
      console.error('Search events error:', error);
      toast.error('イベント検索に失敗しました', {
        description: error instanceof Error ? error.message : undefined,
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addEvent = useCallback(async (event: Partial<EventItem>): Promise<EventItem | null> => {
    if (!user) {
      toast.error('ログインが必要です');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: user.id,
          name: event.name || '',
          description: event.description,
          location_name: event.location_name,
          prefecture: event.prefecture,
          city: event.city,
          latitude: event.latitude,
          longitude: event.longitude,
          event_start: event.event_start,
          event_end: event.event_end,
          source: event.source || 'manual',
          highlights: event.highlights,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const newEvent = data as unknown as EventItem;
      setEvents(prev => [...prev, newEvent]);
      return newEvent;
    } catch (error) {
      console.error('Add event error:', error);
      toast.error('イベントの追加に失敗しました');
      return null;
    }
  }, [user]);

  const addMultipleEvents = useCallback(async (searchResults: EventSearchResult[]): Promise<number> => {
    if (!user) {
      toast.error('ログインが必要です');
      return 0;
    }

    try {
      const rows = searchResults.map(e => ({
        user_id: user.id,
        name: e.name,
        description: e.description,
        location_name: e.location_name,
        prefecture: e.prefecture,
        city: e.city,
        latitude: e.latitude,
        longitude: e.longitude,
        event_start: e.event_start,
        event_end: e.event_end,
        source: 'ai' as const,
        highlights: e.highlights,
      }));

      const { data, error } = await supabase
        .from('events')
        .insert(rows as any[])
        .select();

      if (error) throw error;

      const newEvents = (data || []) as unknown as EventItem[];
      setEvents(prev => [...prev, ...newEvents]);
      toast.success(`${newEvents.length}件のイベントを追加しました`);
      return newEvents.length;
    } catch (error) {
      console.error('Add multiple events error:', error);
      toast.error('イベントの追加に失敗しました');
      return 0;
    }
  }, [user]);

  const toggleVisited = useCallback(async (eventId: string, visited: boolean) => {
    if (!user) return;

    try {
      const updateData: any = {
        visited,
        visited_at: visited ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', eventId);

      if (error) throw error;

      setEvents(prev => prev.map(e =>
        e.id === eventId ? { ...e, ...updateData } : e
      ));
    } catch (error) {
      console.error('Toggle visited error:', error);
      toast.error('更新に失敗しました');
    }
  }, [user]);

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      setEvents(prev => prev.filter(e => e.id !== eventId));
      toast.success('イベントを削除しました');
    } catch (error) {
      console.error('Delete event error:', error);
      toast.error('削除に失敗しました');
    }
  }, [user]);

  // Auto-match photos to events (GPS + date matching)
  const autoMatchPhotos = useCallback(async (photos: { latitude: number; longitude: number; timestamp: Date; id: string }[]) => {
    if (!user || events.length === 0 || photos.length === 0) return 0;

    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    let matched = 0;
    const unvisitedEvents = events.filter(e => !e.visited && e.latitude && e.longitude);

    for (const event of unvisitedEvents) {
      if (!event.latitude || !event.longitude) continue;

      for (const photo of photos) {
        const distance = haversineDistance(photo.latitude, photo.longitude, event.latitude, event.longitude);
        
        // Within 2km
        if (distance > 2.0) continue;

        // Check date range if event has dates
        if (event.event_start && event.event_end) {
          const photoDate = photo.timestamp;
          const start = new Date(event.event_start);
          const end = new Date(event.event_end);
          end.setDate(end.getDate() + 1); // Include end date
          
          if (photoDate < start || photoDate >= end) continue;
        }

        // Match found!
        try {
          const { error } = await supabase
            .from('events')
            .update({
              visited: true,
              visited_at: photo.timestamp.toISOString(),
              visited_photo_id: photo.id,
            } as any)
            .eq('id', event.id);

          if (!error) {
            setEvents(prev => prev.map(e =>
              e.id === event.id
                ? { ...e, visited: true, visited_at: photo.timestamp.toISOString(), visited_photo_id: photo.id }
                : e
            ));
            matched++;
          }
        } catch (err) {
          console.error('Auto-match error:', err);
        }
        break; // One match per event is enough
      }
    }

    if (matched > 0) {
      toast.success(`${matched}件のイベントを訪問済みにしました`);
    }

    return matched;
  }, [user, events]);

  const upcomingEvents = events.filter(e => !e.visited);
  const visitedEvents = events.filter(e => e.visited);

  return {
    events,
    upcomingEvents,
    visitedEvents,
    isLoading,
    isFetching,
    searchEvents,
    addEvent,
    addMultipleEvents,
    toggleVisited,
    deleteEvent,
    autoMatchPhotos,
    refetch: fetchEvents,
  };
};
