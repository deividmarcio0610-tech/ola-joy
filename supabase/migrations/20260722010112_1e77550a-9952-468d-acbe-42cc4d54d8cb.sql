
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  city TEXT,
  avatar_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- LISTINGS
CREATE TYPE public.listing_intent AS ENUM ('sell','trade','buy');
CREATE TYPE public.listing_status AS ENUM ('active','paused','sold');

CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  category TEXT,
  intent public.listing_intent NOT NULL DEFAULT 'sell',
  status public.listing_status NOT NULL DEFAULT 'active',
  photos TEXT[] NOT NULL DEFAULT '{}',
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listings_created_idx ON public.listings(created_at DESC);
CREATE INDEX listings_user_idx ON public.listings(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listings viewable by authenticated" ON public.listings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own listings" ON public.listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own listings" ON public.listings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own listings" ON public.listings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES / PASSES
CREATE TYPE public.swipe_action AS ENUM ('like','pass');
CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  action public.swipe_action NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
CREATE INDEX swipes_user_idx ON public.swipes(user_id);
CREATE INDEX swipes_listing_idx ON public.swipes(listing_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swipes TO authenticated;
GRANT ALL ON public.swipes TO service_role;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own swipes" ON public.swipes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Listing owners can see who liked" ON public.swipes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = swipes.listing_id AND l.user_id = auth.uid())
);

-- MATCHES
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX matches_buyer_idx ON public.matches(buyer_id);
CREATE INDEX matches_seller_idx ON public.matches(seller_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Match participants can view" ON public.matches FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_match_idx ON public.messages(match_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.matches m WHERE m.id = messages.match_id AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid()))
);
CREATE POLICY "Participants send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.matches m WHERE m.id = messages.match_id AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid()))
);

-- Realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER listings_updated BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create match when both users like each other's context
-- When a buyer likes a listing, and the listing owner has liked any listing by the buyer, create a match. Simpler: match on buyer_like of a listing (single-sided) is not "both like" — use classic Tinder rule: match if seller "likes" the buyer via responding. For MVP, create match when buyer likes a listing AND the seller has already liked one of buyer's listings.
CREATE OR REPLACE FUNCTION public.check_match() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  seller UUID;
  reciprocal BOOLEAN;
BEGIN
  IF NEW.action <> 'like' THEN RETURN NEW; END IF;
  SELECT user_id INTO seller FROM public.listings WHERE id = NEW.listing_id;
  IF seller IS NULL OR seller = NEW.user_id THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.swipes s
    JOIN public.listings l ON l.id = s.listing_id
    WHERE s.user_id = seller AND l.user_id = NEW.user_id AND s.action = 'like'
  ) INTO reciprocal;

  IF reciprocal THEN
    INSERT INTO public.matches (listing_id, buyer_id, seller_id)
    VALUES (NEW.listing_id, NEW.user_id, seller)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER swipes_check_match AFTER INSERT ON public.swipes FOR EACH ROW EXECUTE FUNCTION public.check_match();
