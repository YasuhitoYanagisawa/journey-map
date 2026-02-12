-- Add archived column to photos table
ALTER TABLE public.photos ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX idx_photos_archived ON public.photos (is_archived);

-- Update RLS: feed query should only show non-archived photos
-- (We'll handle this in application code to keep flexibility)