DROP POLICY IF EXISTS "record_versions insert authenticated" ON public.record_versions;
DROP POLICY IF EXISTS "record_versions insert own or admin" ON public.record_versions;

CREATE POLICY "record_versions insert own or admin"
ON public.record_versions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = record_versions.record_id
      AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);