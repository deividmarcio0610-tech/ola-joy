
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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

CREATE TABLE IF NOT EXISTS public.record_counters (
  key text PRIMARY KEY,
  seq int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.record_counters TO authenticated;
GRANT ALL ON public.record_counters TO service_role;
ALTER TABLE public.record_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters read auth" ON public.record_counters FOR SELECT TO authenticated USING (true);

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

DO $$ BEGIN
  CREATE TYPE public.gain_status AS ENUM ('estimado','em_medicao','realizado','validado','rejeitado','suspenso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gain_type AS ENUM (
    'tempo','financeiro','produtividade','reducao_custo','reducao_retrabalho',
    'prevencao_perda','reducao_parada','reducao_consumo','ambiental','seguranca',
    'disponibilidade','qualidade','operacional'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.gains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE RESTRICT,
  source_module public.record_module NOT NULL,
  gain_type public.gain_type NOT NULL,
  status public.gain_status NOT NULL DEFAULT 'estimado',
  title text NOT NULL,
  description text,
  area text,
  equipment text,
  responsible text,
  period_kind text NOT NULL DEFAULT 'mensal',
  period_start date,
  period_end date,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula text,
  calc_memory text,
  value_estimated numeric(14,2),
  value_realized numeric(14,2),
  value_validated numeric(14,2),
  hours_saved numeric(14,2),
  manhours_saved numeric(14,2),
  implementation_cost numeric(14,2),
  roi numeric(10,2),
  payback_months numeric(10,2),
  confidence text,
  evidences jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  iris_analysis jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  validation_note text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gains_record ON public.gains(record_id);
CREATE INDEX IF NOT EXISTS idx_gains_status ON public.gains(status);
CREATE INDEX IF NOT EXISTS idx_gains_type ON public.gains(gain_type);
CREATE INDEX IF NOT EXISTS idx_gains_module ON public.gains(source_module);
CREATE INDEX IF NOT EXISTS idx_gains_period ON public.gains(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_gains_created_by ON public.gains(created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gains TO authenticated;
GRANT ALL ON public.gains TO service_role;

ALTER TABLE public.gains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gains select own or elevated" ON public.gains
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "gains insert own" ON public.gains
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "gains update own or elevated" ON public.gains
  FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid() AND status <> 'validado')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "gains delete elevated non-validated" ON public.gains
  FOR DELETE TO authenticated
  USING (
    status <> 'validado'
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE TRIGGER gains_set_updated_at
  BEFORE UPDATE ON public.gains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.gain_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gain_id uuid NOT NULL REFERENCES public.gains(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gain_history_gain ON public.gain_history(gain_id);

GRANT SELECT, INSERT ON public.gain_history TO authenticated;
GRANT ALL ON public.gain_history TO service_role;

ALTER TABLE public.gain_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gain_history read via gain" ON public.gain_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gains g
      WHERE g.id = gain_history.gain_id
        AND (
          g.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'supervisor')
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "gain_history insert authenticated" ON public.gain_history
  FOR INSERT TO authenticated
  WITH CHECK (actor = auth.uid());

CREATE OR REPLACE FUNCTION public.gain_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.gain_history(gain_id, actor, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.gain_history(gain_id, actor, action, field, old_value, new_value)
      VALUES (NEW.id, auth.uid(), 'status_change', 'status', to_jsonb(OLD.status), to_jsonb(NEW.status));
    END IF;
    IF NEW.value_validated IS DISTINCT FROM OLD.value_validated THEN
      INSERT INTO public.gain_history(gain_id, actor, action, field, old_value, new_value)
      VALUES (NEW.id, auth.uid(), 'value_validated_change', 'value_validated', to_jsonb(OLD.value_validated), to_jsonb(NEW.value_validated));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gains_log_change
  AFTER INSERT OR UPDATE ON public.gains
  FOR EACH ROW EXECUTE FUNCTION public.gain_log_change();

CREATE OR REPLACE FUNCTION public.gains_set_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.next_internal_code('GANHO', COALESCE(NEW.area, 'GERAL'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gains_set_code_trigger
  BEFORE INSERT ON public.gains
  FOR EACH ROW EXECUTE FUNCTION public.gains_set_code();

REVOKE EXECUTE ON FUNCTION public.gain_log_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gains_set_code() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS vale_result text,
  ADD COLUMN IF NOT EXISTS vale_result_at timestamptz,
  ADD COLUMN IF NOT EXISTS vale_result_by uuid,
  ADD COLUMN IF NOT EXISTS vale_result_note text,
  ADD COLUMN IF NOT EXISTS vale_reject_category text,
  ADD COLUMN IF NOT EXISTS vale_reject_reason text,
  ADD COLUMN IF NOT EXISTS vale_result_proof_url text,
  ADD COLUMN IF NOT EXISTS vale_result_document_url text,
  ADD COLUMN IF NOT EXISTS vale_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS vale_root_id uuid REFERENCES public.records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vale_channel text,
  ADD COLUMN IF NOT EXISTS vale_deadline date;

CREATE INDEX IF NOT EXISTS idx_records_vale_result ON public.records(vale_result);
CREATE INDEX IF NOT EXISTS idx_records_vale_root ON public.records(vale_root_id);

UPDATE public.records SET vale_root_id = id WHERE vale_root_id IS NULL;

CREATE OR REPLACE FUNCTION public.records_default_vale_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vale_root_id IS NULL THEN
    NEW.vale_root_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_records_default_vale_root ON public.records;
CREATE TRIGGER trg_records_default_vale_root
BEFORE INSERT ON public.records
FOR EACH ROW EXECUTE FUNCTION public.records_default_vale_root();

CREATE TABLE IF NOT EXISTS public.record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  root_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  sent_by uuid,
  channel text,
  protocol text,
  vale_code text,
  report_url text,
  result text,
  result_at timestamptz,
  result_note text,
  reject_category text,
  reject_reason text,
  changes_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.record_versions TO authenticated;
GRANT ALL ON public.record_versions TO service_role;

ALTER TABLE public.record_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read record_versions"
  ON public.record_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert record_versions"
  ON public.record_versions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_record_versions_record ON public.record_versions(record_id, version);
CREATE INDEX IF NOT EXISTS idx_record_versions_root ON public.record_versions(root_id, version);
CREATE INDEX IF NOT EXISTS idx_record_versions_sent_at ON public.record_versions(sent_at);
