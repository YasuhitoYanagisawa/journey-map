
-- Drop the old public SELECT policy
DROP POLICY IF EXISTS "Photos are viewable by everyone" ON public.photos;

-- Create new owner-only SELECT policy
CREATE POLICY "Users can view their own photos"
ON public.photos
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
