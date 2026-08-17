-- Add super_like value to swipe_action enum
ALTER TYPE public.swipe_action ADD VALUE IF NOT EXISTS 'super_like';

-- Boost column
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS boosted_until timestamptz;

CREATE INDEX IF NOT EXISTS listings_boosted_until_idx
  ON public.listings (boosted_until DESC NULLS LAST);

-- Notify seller on super_like
CREATE OR REPLACE FUNCTION public.tg_notify_super_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller uuid;
  listing_title text;
BEGIN
  IF NEW.action <> 'super_like' THEN RETURN NEW; END IF;
  SELECT user_id, title INTO seller, listing_title
    FROM public.listings WHERE id = NEW.listing_id;
  IF seller IS NULL OR seller = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    seller,
    'super_like',
    'Alguém adorou seu anúncio ⭐',
    'Um vizinho deu Super Like em "' || COALESCE(listing_title,'seu anúncio') || '"!',
    jsonb_build_object('listing_id', NEW.listing_id)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_super_like ON public.swipes;
CREATE TRIGGER trg_notify_super_like
AFTER INSERT ON public.swipes
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_super_like();