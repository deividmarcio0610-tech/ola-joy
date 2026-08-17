
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX proposals_match_idx ON public.proposals(match_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view proposals"
  ON public.proposals FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Sender can create proposals"
  ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid())
        AND (m.buyer_id = to_user OR m.seller_id = to_user)
        AND to_user <> auth.uid()
    )
  );

CREATE POLICY "Recipient can respond, sender can cancel"
  ON public.proposals FOR UPDATE TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user)
  WITH CHECK (auth.uid() = from_user OR auth.uid() = to_user);

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;
