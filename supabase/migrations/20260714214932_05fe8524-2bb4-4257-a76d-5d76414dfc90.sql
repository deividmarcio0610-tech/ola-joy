
-- 1. Extensão para similaridade textual
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Novos campos em records
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS internal_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS vale_protocol text,
  ADD COLUMN IF NOT EXISTS vale_code text,
  ADD COLUMN IF NOT EXISTS image_hash text,
  ADD COLUMN IF NOT EXISTS image_phash text,
  ADD COLUMN IF NOT EXISTS equipment text,
  ADD COLUMN IF NOT EXISTS equipment_number text,
  ADD COLUMN IF NOT EXISTS parent_record_id uuid REFERENCES public.records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vale_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid,
  ADD COLUMN IF NOT EXISTS sent_channel text,
  ADD COLUMN IF NOT EXISTS send_proof_url text,
  ADD COLUMN IF NOT EXISTS send_note text,
  ADD COLUMN IF NOT EXISTS similarity_meta jsonb;

CREATE INDEX IF NOT EXISTS idx_records_image_hash ON public.records(image_hash);
CREATE INDEX IF NOT EXISTS idx_records_image_phash ON public.records(image_phash);
CREATE INDEX IF NOT EXISTS idx_records_internal_code ON public.records(internal_code);
CREATE INDEX IF NOT EXISTS idx_records_vale_protocol ON public.records(vale_protocol);
CREATE INDEX IF NOT EXISTS idx_records_parent ON public.records(parent_record_id);
CREATE INDEX IF NOT EXISTS idx_records_vale_status ON public.records(vale_status);
CREATE INDEX IF NOT EXISTS idx_records_description_trgm ON public.records USING gin (description gin_trgm_ops);

-- 3. Contadores para código interno
CREATE TABLE IF NOT EXISTS public.record_counters (
  key text PRIMARY KEY,
  seq int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.record_counters TO authenticated;
GRANT ALL ON public.record_counters TO service_role;
ALTER TABLE public.record_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters read auth" ON public.record_counters FOR SELECT TO authenticated USING (true);

-- 4. Função geradora de código interno
CREATE OR REPLACE FUNCTION public.next_internal_code(_type text, _area text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _seq int;
  _area_key text;
  _month text;
BEGIN
  _area_key := upper(regexp_replace(coalesce(nullif(trim(_area),''),'GERAL'), '[^A-Za-z0-9]+', '', 'g'));
  _month := to_char(now(), 'YYYY-MM');
  _key := format('%s-%s-%s', upper(_type), _month, _area_key);
  INSERT INTO public.record_counters(key, seq) VALUES (_key, 1)
  ON CONFLICT (key) DO UPDATE SET seq = public.record_counters.seq + 1, updated_at = now()
  RETURNING seq INTO _seq;
  RETURN format('%s-%s-%s-%s', upper(_type), _month, _area_key, lpad(_seq::text, 6, '0'));
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_internal_code(text, text) TO authenticated, service_role;

-- 5. Histórico
CREATE TABLE IF NOT EXISTS public.record_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  justification text,
  proof_url text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_history_record ON public.record_history(record_id, created_at DESC);
GRANT SELECT, INSERT ON public.record_history TO authenticated;
GRANT ALL ON public.record_history TO service_role;
ALTER TABLE public.record_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history read auth" ON public.record_history
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND (r.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "history insert auth" ON public.record_history
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND (r.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

-- 6. Vínculos entre registros
CREATE TABLE IF NOT EXISTS public.record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  related_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  kind text NOT NULL,
  similarity numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(origin_id, related_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_record_links_origin ON public.record_links(origin_id);
CREATE INDEX IF NOT EXISTS idx_record_links_related ON public.record_links(related_id);
GRANT SELECT, INSERT, DELETE ON public.record_links TO authenticated;
GRANT ALL ON public.record_links TO service_role;
ALTER TABLE public.record_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "links read auth" ON public.record_links
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.records r WHERE r.id IN (origin_id, related_id) AND (r.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "links insert auth" ON public.record_links
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.records r WHERE r.id = origin_id AND (r.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "links delete admin" ON public.record_links
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));
