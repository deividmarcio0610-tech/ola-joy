
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_has_body CHECK (
  (content IS NOT NULL AND length(trim(content)) > 0) OR image_url IS NOT NULL
);

-- Storage RLS for chat-media bucket: first path segment MUST be a match_id
-- the user participates in.
CREATE POLICY "chat-media: participants can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id::text = (storage.foldername(name))[1]
        AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid())
    )
  );

CREATE POLICY "chat-media: participants can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id::text = (storage.foldername(name))[1]
        AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid())
    )
  );

CREATE POLICY "chat-media: owner can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());
