
-- 1) record_versions: restrict SELECT to owner or admin
DROP POLICY IF EXISTS "authenticated read record_versions" ON public.record_versions;
CREATE POLICY "record_versions read own or admin"
  ON public.record_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = record_versions.record_id
        AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- 2) storage.objects: add UPDATE policy for records/{user_id} prefix in 'inspections' bucket
DROP POLICY IF EXISTS "records own update" ON storage.objects;
CREATE POLICY "records own update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'inspections'
    AND (storage.foldername(name))[1] = 'records'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'inspections'
    AND (storage.foldername(name))[1] = 'records'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

-- 3) record_counters: restrict read to service_role only
DROP POLICY IF EXISTS "counters read auth" ON public.record_counters;
REVOKE SELECT ON public.record_counters FROM authenticated, anon;
-- service_role already has ALL from earlier grants; ensure it still does
GRANT ALL ON public.record_counters TO service_role;

-- 4) Revoke EXECUTE from anon on the security-definer helper next_internal_code.
--    It's invoked from a trigger (SECURITY DEFINER) and from server-side code as authenticated.
REVOKE EXECUTE ON FUNCTION public.next_internal_code(text, text) FROM PUBLIC, anon;
