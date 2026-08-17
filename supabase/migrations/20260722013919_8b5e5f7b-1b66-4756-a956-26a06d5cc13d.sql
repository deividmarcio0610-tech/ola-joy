
-- ============================================================
-- Retenção: streaks, badges, pontos, notificações, wishlist
-- ============================================================

-- 1. Extras no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_points integer NOT NULL DEFAULT 0;

-- 2. Streaks
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  freebies_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_streaks TO authenticated;
GRANT ALL ON public.user_streaks TO service_role;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own streak" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own streak" ON public.user_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own streak" ON public.user_streaks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_streaks_updated ON public.user_streaks;
CREATE TRIGGER trg_streaks_updated BEFORE UPDATE ON public.user_streaks
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 3. Badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);
GRANT SELECT, INSERT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are public read" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "Users insert own badges" ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 5. Saved listings (wishlist)
CREATE TABLE IF NOT EXISTS public.saved_listings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_listings TO authenticated;
GRANT ALL ON public.saved_listings TO service_role;
ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own saved" ON public.saved_listings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users save own" ON public.saved_listings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unsave own" ON public.saved_listings FOR DELETE USING (auth.uid() = user_id);

-- 6. award_badge — concede badge se novo, opcionalmente notifica
CREATE OR REPLACE FUNCTION public.award_badge(_user_id uuid, _badge_key text, _title text, _body text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  INSERT INTO public.user_badges (user_id, badge_key)
  VALUES (_user_id, _badge_key)
  ON CONFLICT (user_id, badge_key) DO NOTHING
  RETURNING true INTO inserted;

  IF inserted THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (_user_id, 'badge', _title, _body, jsonb_build_object('badge_key', _badge_key));
    UPDATE public.profiles
      SET points = points + 20, lifetime_points = lifetime_points + 20
      WHERE id = _user_id;
  END IF;
  RETURN COALESCE(inserted, false);
END;
$$;

-- 7. daily_checkin — chamado pelo cliente ao abrir o app
CREATE OR REPLACE FUNCTION public.daily_checkin()
RETURNS TABLE (
  streak integer,
  longest integer,
  awarded_points integer,
  is_new_day boolean,
  milestone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  s record;
  new_streak integer;
  new_longest integer;
  pts integer := 0;
  ms text := NULL;
  new_day boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO s FROM public.user_streaks WHERE user_id = uid;
  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_active_date)
    VALUES (uid, 1, 1, today);
    new_streak := 1; new_longest := 1; pts := 10; new_day := true; ms := 'first_day';
  ELSIF s.last_active_date = today THEN
    new_streak := s.current_streak; new_longest := s.longest_streak; new_day := false;
  ELSIF s.last_active_date = today - 1 THEN
    new_streak := s.current_streak + 1;
    new_longest := GREATEST(s.longest_streak, new_streak);
    pts := 10; new_day := true;
    UPDATE public.user_streaks
      SET current_streak = new_streak, longest_streak = new_longest, last_active_date = today
      WHERE user_id = uid;
  ELSE
    new_streak := 1; new_longest := GREATEST(s.longest_streak, 1);
    pts := 10; new_day := true;
    UPDATE public.user_streaks
      SET current_streak = 1, longest_streak = new_longest, last_active_date = today
      WHERE user_id = uid;
  END IF;

  IF new_day THEN
    IF new_streak = 7 THEN
      pts := pts + 25; ms := 'streak_7';
      PERFORM public.award_badge(uid, 'streak_7', 'Semana de fogo 🔥', 'Você abriu o Vizin 7 dias seguidos!');
      UPDATE public.user_streaks SET freebies_earned = freebies_earned + 1 WHERE user_id = uid;
    ELSIF new_streak = 30 THEN
      pts := pts + 100; ms := 'streak_30';
      PERFORM public.award_badge(uid, 'streak_30', 'Vizinho de casa 🏠', '30 dias seguidos no Vizin!');
      UPDATE public.user_streaks SET freebies_earned = freebies_earned + 3 WHERE user_id = uid;
    ELSIF new_streak = 14 THEN
      pts := pts + 50; ms := 'streak_14';
    END IF;
    UPDATE public.profiles SET points = points + pts, lifetime_points = lifetime_points + pts WHERE id = uid;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      uid, 'streak',
      'Streak de ' || new_streak || ' dia' || CASE WHEN new_streak > 1 THEN 's' ELSE '' END || ' 🔥',
      '+' || pts || ' pontos hoje. Continue amanhã para não perder!',
      jsonb_build_object('streak', new_streak, 'points', pts)
    );
  END IF;

  streak := new_streak;
  longest := new_longest;
  awarded_points := pts;
  is_new_day := new_day;
  milestone := ms;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badge(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_checkin() TO authenticated;

-- 8. Trigger: primeiro anúncio
CREATE OR REPLACE FUNCTION public.tg_award_first_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_badge(NEW.user_id, 'first_listing', 'Primeiro anúncio 🎉', 'Você criou seu primeiro anúncio no Vizin!');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_listings_first_badge ON public.listings;
CREATE TRIGGER trg_listings_first_badge
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.tg_award_first_listing();

-- 9. Trigger: primeiro match + notificação
CREATE OR REPLACE FUNCTION public.tg_award_first_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_badge(NEW.buyer_id, 'first_match', 'Primeiro match 💚', 'Você deu match! Abra a conversa e negocie.');
  PERFORM public.award_badge(NEW.seller_id, 'first_match', 'Primeiro match 💚', 'Alguém quer seu item! Abra a conversa.');
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES
    (NEW.buyer_id, 'match', 'É Match! 💚', 'Vocês deram match. Abra a conversa!', jsonb_build_object('match_id', NEW.id, 'listing_id', NEW.listing_id)),
    (NEW.seller_id, 'match', 'É Match! 💚', 'Alguém curtiu seu anúncio. Fale com o comprador!', jsonb_build_object('match_id', NEW.id, 'listing_id', NEW.listing_id));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_matches_first_badge ON public.matches;
CREATE TRIGGER trg_matches_first_badge
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.tg_award_first_match();

-- 10. Trigger: anúncio verificado
CREATE OR REPLACE FUNCTION public.tg_notify_verified_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fraud_score IS NOT NULL AND NEW.fraud_score >= 75
     AND (OLD.fraud_score IS NULL OR OLD.fraud_score < 75) THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.user_id, 'verified', 'Anúncio verificado ✅',
      'Seu anúncio "' || NEW.title || '" foi validado pela IA e tem um selo de confiança.',
      jsonb_build_object('listing_id', NEW.id));
    PERFORM public.award_badge(NEW.user_id, 'verified_seller', 'Vendedor verificado ✅', 'Seus anúncios passaram na análise anti-golpe!');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_listings_verified ON public.listings;
CREATE TRIGGER trg_listings_verified
AFTER UPDATE OF fraud_score ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_verified_listing();
