-- Add address columns to photos table for administrative boundary aggregation
ALTER TABLE public.photos 
ADD COLUMN IF NOT EXISTS prefecture text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS town text;

-- Add index for faster aggregation queries
CREATE INDEX IF NOT EXISTS idx_photos_prefecture ON public.photos(prefecture);
CREATE INDEX IF NOT EXISTS idx_photos_city ON public.photos(city);
CREATE INDEX IF NOT EXISTS idx_photos_town ON public.photos(town);