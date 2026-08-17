
-- Add fraud/trust columns to listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS fraud_score integer,
  ADD COLUMN IF NOT EXISTS fraud_flags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS fraud_analysis text;

-- Add trust score cache on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_score integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL,
  listing_id uuid,
  reported_user_id uuid,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users see own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);
