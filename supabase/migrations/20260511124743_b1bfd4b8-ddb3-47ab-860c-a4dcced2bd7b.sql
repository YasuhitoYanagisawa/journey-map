
INSERT INTO storage.buckets (id, name, public)
VALUES ('omamori-data', 'omamori-data', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Omamori data is publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'omamori-data');
