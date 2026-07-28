
CREATE TABLE public.safety_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  module_key TEXT,
  title TEXT NOT NULL DEFAULT 'Projeto Executivo',
  photo_url TEXT NOT NULL,
  interventions JSONB NOT NULL DEFAULT '[]'::jsonb,
  svg_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_plans TO authenticated;
GRANT ALL ON public.safety_plans TO service_role;

ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_plans_owner_select" ON public.safety_plans
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "safety_plans_owner_insert" ON public.safety_plans
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "safety_plans_owner_update" ON public.safety_plans
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "safety_plans_owner_delete" ON public.safety_plans
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER safety_plans_updated_at
  BEFORE UPDATE ON public.safety_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX safety_plans_created_by_idx ON public.safety_plans(created_by);
CREATE INDEX safety_plans_record_id_idx ON public.safety_plans(record_id);
