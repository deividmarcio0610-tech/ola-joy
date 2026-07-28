
-- Enums
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

-- gains
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

-- updated_at trigger
CREATE TRIGGER gains_set_updated_at
  BEFORE UPDATE ON public.gains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- gain_history
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

-- Trigger to auto-log status/value changes
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

-- Auto-generate code on insert if null
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
