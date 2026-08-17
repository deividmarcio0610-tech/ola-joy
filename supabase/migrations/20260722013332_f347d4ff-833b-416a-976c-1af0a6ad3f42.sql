
CREATE TABLE IF NOT EXISTS public.meetups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','completed','cancelled')),
  qr_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  buyer_confirmed_at timestamptz,
  seller_confirmed_at timestamptz,
  buyer_safety_ack boolean NOT NULL DEFAULT false,
  seller_safety_ack boolean NOT NULL DEFAULT false,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qr_token)
);

GRANT SELECT, INSERT, UPDATE ON public.meetups TO authenticated;
GRANT ALL ON public.meetups TO service_role;

ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read meetups" ON public.meetups
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Participants create meetups" ON public.meetups
  FOR INSERT WITH CHECK (
    auth.uid() = proposed_by
    AND (auth.uid() = buyer_id OR auth.uid() = seller_id)
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND m.buyer_id = meetups.buyer_id
        AND m.seller_id = meetups.seller_id
        AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid())
    )
  );

CREATE POLICY "Participants update meetups" ON public.meetups
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP TRIGGER IF EXISTS trg_meetups_updated_at ON public.meetups;
CREATE TRIGGER trg_meetups_updated_at
BEFORE UPDATE ON public.meetups
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX IF NOT EXISTS idx_meetups_match ON public.meetups(match_id);
CREATE INDEX IF NOT EXISTS idx_meetups_scheduled ON public.meetups(scheduled_at);
