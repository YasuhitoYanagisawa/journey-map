
-- Create events table for festival/event tracking
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  location_name TEXT, -- e.g. "浅草神社"
  prefecture TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  event_start TIMESTAMP WITH TIME ZONE,
  event_end TIMESTAMP WITH TIME ZONE,
  visited BOOLEAN NOT NULL DEFAULT false,
  visited_at TIMESTAMP WITH TIME ZONE,
  visited_photo_id UUID REFERENCES public.photos(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'ai'
  highlights TEXT, -- おすすめポイント
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own events"
  ON public.events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON public.events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events"
  ON public.events FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_events_user_id ON public.events(user_id);
CREATE INDEX idx_events_prefecture ON public.events(prefecture);
CREATE INDEX idx_events_visited ON public.events(user_id, visited);
CREATE INDEX idx_events_dates ON public.events(event_start, event_end);
