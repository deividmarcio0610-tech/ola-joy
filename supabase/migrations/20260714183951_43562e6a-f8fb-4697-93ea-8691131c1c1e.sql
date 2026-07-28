
CREATE POLICY "records own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspections' AND (storage.foldername(name))[1] = 'records' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "records own insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspections' AND (storage.foldername(name))[1] = 'records' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "records own delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspections' AND (storage.foldername(name))[1] = 'records' AND (storage.foldername(name))[2] = auth.uid()::text);
