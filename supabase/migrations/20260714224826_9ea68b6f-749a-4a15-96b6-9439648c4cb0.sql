
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS env_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS env_aspect text,
  ADD COLUMN IF NOT EXISTS env_aspects_secondary text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS env_impact_direct text,
  ADD COLUMN IF NOT EXISTS env_impact_indirect text,
  ADD COLUMN IF NOT EXISTS env_medium text,
  ADD COLUMN IF NOT EXISTS env_source text,
  ADD COLUMN IF NOT EXISTS env_material text,
  ADD COLUMN IF NOT EXISTS env_severity smallint,
  ADD COLUMN IF NOT EXISTS env_probability smallint,
  ADD COLUMN IF NOT EXISTS env_scope smallint,
  ADD COLUMN IF NOT EXISTS env_persistence smallint,
  ADD COLUMN IF NOT EXISTS env_sensitivity smallint,
  ADD COLUMN IF NOT EXISTS env_control smallint,
  ADD COLUMN IF NOT EXISTS env_score_before integer,
  ADD COLUMN IF NOT EXISTS env_level_before text,
  ADD COLUMN IF NOT EXISTS env_actions jsonb DEFAULT '{"immediate":[],"corrective":[],"preventive":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS env_ai_before jsonb,
  ADD COLUMN IF NOT EXISTS env_ai_after jsonb,
  ADD COLUMN IF NOT EXISTS env_simulation_url text,
  ADD COLUMN IF NOT EXISTS env_after_photo_url text,
  ADD COLUMN IF NOT EXISTS env_after_description text,
  ADD COLUMN IF NOT EXISTS env_after_executed_by text,
  ADD COLUMN IF NOT EXISTS env_after_executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS env_score_after integer,
  ADD COLUMN IF NOT EXISTS env_level_after text,
  ADD COLUMN IF NOT EXISTS env_effectiveness text,
  ADD COLUMN IF NOT EXISTS env_audit_verdict text,
  ADD COLUMN IF NOT EXISTS env_audit_note text,
  ADD COLUMN IF NOT EXISTS env_validated_by uuid,
  ADD COLUMN IF NOT EXISTS env_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS env_checklist jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS env_reincidence_of uuid REFERENCES public.records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_records_env_categories ON public.records USING GIN (env_categories);
CREATE INDEX IF NOT EXISTS idx_records_env_level_before ON public.records(env_level_before);
CREATE INDEX IF NOT EXISTS idx_records_env_reincidence_of ON public.records(env_reincidence_of);
