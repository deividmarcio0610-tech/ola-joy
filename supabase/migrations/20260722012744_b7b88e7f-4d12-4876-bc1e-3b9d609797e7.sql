
-- Lock down trigger functions - only triggers should call them
REVOKE ALL ON FUNCTION public.tg_recompute_trust_reports() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_trust_listings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_trust_matches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_trust_profiles() FROM PUBLIC, anon, authenticated;

-- Restrict the core recompute to service_role only
REVOKE EXECUTE ON FUNCTION public.recompute_user_trust(uuid) FROM PUBLIC, anon, authenticated;

-- Public wrapper: only lets a signed-in user refresh their OWN score
CREATE OR REPLACE FUNCTION public.recompute_my_trust()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.recompute_user_trust(uid);
END; $$;

REVOKE ALL ON FUNCTION public.recompute_my_trust() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_trust() TO authenticated;
