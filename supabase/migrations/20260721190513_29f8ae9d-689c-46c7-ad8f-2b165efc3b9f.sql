-- Policies do bucket environmental (arquivos por usuário)
CREATE POLICY "env_bucket_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
