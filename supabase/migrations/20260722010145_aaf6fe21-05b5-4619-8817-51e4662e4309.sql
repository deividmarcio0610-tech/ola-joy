
REVOKE EXECUTE ON FUNCTION public.tg_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_match() FROM PUBLIC, anon, authenticated;

-- Storage policies for private buckets so authenticated users can upload/read
CREATE POLICY "Auth read listings" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'listings');
CREATE POLICY "Auth upload listings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'listings' AND owner = auth.uid());
CREATE POLICY "Owner delete listings" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'listings' AND owner = auth.uid());

CREATE POLICY "Auth read avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Auth upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());
CREATE POLICY "Owner update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());
CREATE POLICY "Owner delete avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());
