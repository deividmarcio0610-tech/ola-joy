
-- Trust score recompute function
CREATE OR REPLACE FUNCTION public.recompute_user_trust(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  age_days integer;
  active_count integer;
  matches_count integer;
  verified_count integer;
  reports_count integer;
  suspicious_count integer;
  s integer := 10;
BEGIN
  SELECT avatar_url, name, city, phone, bio, created_at
    INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  age_days := GREATEST(0, (EXTRACT(EPOCH FROM (now() - p.created_at))::int / 86400));

  SELECT COUNT(*) INTO active_count FROM public.listings
    WHERE user_id = _user_id AND status = 'active';
  SELECT COUNT(*) INTO matches_count FROM public.matches
    WHERE buyer_id = _user_id OR seller_id = _user_id;
  SELECT COUNT(*) INTO verified_count FROM public.listings
    WHERE user_id = _user_id AND fraud_score >= 75;
  SELECT COUNT(*) INTO suspicious_count FROM public.listings
    WHERE user_id = _user_id AND fraud_score IS NOT NULL AND fraud_score < 40;
  SELECT COUNT(*) INTO reports_count FROM public.reports
    WHERE reported_user_id = _user_id AND status <> 'dismissed';

  -- Positive signals
  IF p.avatar_url IS NOT NULL THEN s := s + 15; END IF;
  IF p.name IS NOT NULL AND length(p.name) > 0 THEN s := s + 10; END IF;
  IF p.city IS NOT NULL AND length(p.city) > 0 THEN s := s + 5; END IF;
  IF p.phone IS NOT NULL AND length(p.phone) > 0 THEN s := s + 10; END IF;
  IF p.bio IS NOT NULL AND length(p.bio) > 0 THEN s := s + 5; END IF;
  s := s + LEAST(15, (age_days / 7) * 3);
  s := s + LEAST(15, active_count * 3);
  s := s + LEAST(15, matches_count * 5);
  s := s + LEAST(10, verified_count * 3);

  -- Negative (anti-golpe) signals
  s := s - LEAST(40, reports_count * 15);
  s := s - LEAST(20, suspicious_count * 8);

  s := GREATEST(0, LEAST(100, s));
  UPDATE public.profiles SET trust_score = s WHERE id = _user_id;
  RETURN s;
END; $$;

GRANT EXECUTE ON FUNCTION public.recompute_user_trust(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_user_trust(uuid) TO service_role;

-- Trigger on reports (someone flags a user or listing)
CREATE OR REPLACE FUNCTION public.tg_recompute_trust_reports()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF NEW.reported_user_id IS NOT NULL THEN
    PERFORM public.recompute_user_trust(NEW.reported_user_id);
  END IF;
  IF NEW.listing_id IS NOT NULL THEN
    SELECT user_id INTO owner_id FROM public.listings WHERE id = NEW.listing_id;
    IF owner_id IS NOT NULL AND owner_id IS DISTINCT FROM NEW.reported_user_id THEN
      PERFORM public.recompute_user_trust(owner_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS reports_recompute_trust ON public.reports;
CREATE TRIGGER reports_recompute_trust
AFTER INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_trust_reports();

-- Trigger on listings (new ad, fraud_score updated by AI, status changed)
CREATE OR REPLACE FUNCTION public.tg_recompute_trust_listings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_user_trust(NEW.user_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS listings_recompute_trust ON public.listings;
CREATE TRIGGER listings_recompute_trust
AFTER INSERT OR UPDATE OF fraud_score, status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_trust_listings();

-- Trigger on matches (mutual like) - recompute both sides
CREATE OR REPLACE FUNCTION public.tg_recompute_trust_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_user_trust(NEW.buyer_id);
  PERFORM public.recompute_user_trust(NEW.seller_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS matches_recompute_trust ON public.matches;
CREATE TRIGGER matches_recompute_trust
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_trust_matches();

-- Trigger on profiles (completeness signals change).
-- Uses UPDATE OF <cols> so the recompute's own SET trust_score does not fire recursion.
CREATE OR REPLACE FUNCTION public.tg_recompute_trust_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_user_trust(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_recompute_trust ON public.profiles;
CREATE TRIGGER profiles_recompute_trust
AFTER INSERT OR UPDATE OF avatar_url, name, city, phone, bio ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_trust_profiles();

-- Backfill trust_score for existing users
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT id FROM public.profiles LOOP
    PERFORM public.recompute_user_trust(u);
  END LOOP;
END $$;
