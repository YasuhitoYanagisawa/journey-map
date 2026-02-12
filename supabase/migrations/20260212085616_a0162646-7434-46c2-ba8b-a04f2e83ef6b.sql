-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
ON public.comments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create hashtags table for categorization
CREATE TABLE public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hashtags are viewable by everyone"
ON public.hashtags FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert hashtags"
ON public.hashtags FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Photo-hashtag junction table
CREATE TABLE public.photo_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(photo_id, hashtag_id)
);

ALTER TABLE public.photo_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photo hashtags are viewable by everyone"
ON public.photo_hashtags FOR SELECT
USING (true);

CREATE POLICY "Photo owners can manage hashtags"
ON public.photo_hashtags FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.photos WHERE id = photo_id AND user_id = auth.uid()));

CREATE POLICY "Photo owners can delete hashtags"
ON public.photo_hashtags FOR DELETE
USING (EXISTS (SELECT 1 FROM public.photos WHERE id = photo_id AND user_id = auth.uid()));