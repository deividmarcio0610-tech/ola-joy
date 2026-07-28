
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

DROP POLICY IF EXISTS "authenticated read record_versions" ON public.record_versions;
CREATE POLICY "record_versions read own or admin"
  ON public.record_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = record_versions.record_id
        AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

DROP POLICY IF EXISTS "records own update" ON storage.objects;
CREATE POLICY "records own update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'inspections'
    AND (storage.foldername(name))[1] = 'records'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'inspections'
    AND (storage.foldername(name))[1] = 'records'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "counters read auth" ON public.record_counters;
REVOKE SELECT ON public.record_counters FROM authenticated, anon;
GRANT ALL ON public.record_counters TO service_role;

DROP POLICY IF EXISTS "record_versions insert authenticated" ON public.record_versions;
DROP POLICY IF EXISTS "record_versions insert own or admin" ON public.record_versions;

CREATE POLICY "record_versions insert own or admin"
ON public.record_versions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = record_versions.record_id
      AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);
DROP POLICY IF EXISTS "authenticated insert record_versions" ON public.record_versions;
REVOKE EXECUTE ON FUNCTION public.next_internal_code(text, text) FROM PUBLIC, anon;

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nova conversa',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_conversations_select" ON public.chat_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_conversations_insert" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_conversations_update" ON public.chat_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_conversations_delete" ON public.chat_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX chat_conversations_user_idx ON public.chat_conversations (user_id, updated_at DESC);

CREATE TRIGGER chat_conversations_set_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL DEFAULT '',
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_messages_delete" ON public.chat_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX chat_messages_conv_idx ON public.chat_messages (conversation_id, created_at ASC);

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS analysis_v2 jsonb,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS human_review jsonb,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel text,
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS turno text,
  ADD COLUMN IF NOT EXISTS ai_feedback jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_records_status ON public.records(status);
CREATE INDEX IF NOT EXISTS idx_records_duplicate_of ON public.records(duplicate_of) WHERE duplicate_of IS NOT NULL;

CREATE TABLE public.image_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  default_model TEXT,
  preview_model TEXT,
  final_model TEXT,
  current_status TEXT NOT NULL DEFAULT 'closed',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error_type TEXT,
  total_success BIGINT NOT NULL DEFAULT 0,
  total_failure BIGINT NOT NULL DEFAULT 0,
  total_cost_cents BIGINT NOT NULL DEFAULT 0,
  daily_budget_cents BIGINT,
  monthly_budget_cents BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.image_providers TO authenticated;
GRANT ALL ON public.image_providers TO service_role;

ALTER TABLE public.image_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read image_providers"
  ON public.image_providers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert image_providers"
  ON public.image_providers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update image_providers"
  ON public.image_providers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete image_providers"
  ON public.image_providers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER image_providers_set_updated_at
  BEFORE UPDATE ON public.image_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_image_hash TEXT NOT NULL,
  corrections_hash TEXT NOT NULL,
  original_image_url TEXT,
  corrected_image_url TEXT,
  generation_mode TEXT NOT NULL DEFAULT 'final',
  final_status TEXT NOT NULL DEFAULT 'queued',
  successful_provider TEXT,
  successful_model TEXT,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  internal_credits_used INTEGER NOT NULL DEFAULT 0,
  estimated_total_cost_cents BIGINT NOT NULL DEFAULT 0,
  scene_description TEXT,
  detected_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_corrections JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX image_generation_jobs_user_idx ON public.image_generation_jobs(user_id, created_at DESC);
CREATE INDEX image_generation_jobs_idempotency_idx ON public.image_generation_jobs(user_id, original_image_hash, corrections_hash, generation_mode);

GRANT SELECT, INSERT, UPDATE ON public.image_generation_jobs TO authenticated;
GRANT ALL ON public.image_generation_jobs TO service_role;

ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own jobs"
  ON public.image_generation_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own jobs"
  ON public.image_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own jobs"
  ON public.image_generation_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER image_generation_jobs_set_updated_at
  BEFORE UPDATE ON public.image_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.image_generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.image_generation_jobs(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  model TEXT,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_type TEXT,
  sanitized_error_message TEXT,
  estimated_cost_cents BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX image_generation_attempts_job_idx ON public.image_generation_attempts(job_id, attempt_number);

GRANT SELECT, INSERT ON public.image_generation_attempts TO authenticated;
GRANT ALL ON public.image_generation_attempts TO service_role;

ALTER TABLE public.image_generation_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own job attempts"
  ON public.image_generation_attempts FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.image_generation_jobs j
      WHERE j.id = image_generation_attempts.job_id AND j.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert attempts for own jobs"
  ON public.image_generation_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.image_generation_jobs j
      WHERE j.id = image_generation_attempts.job_id AND j.user_id = auth.uid()
    )
  );

INSERT INTO public.image_providers
  (provider_name, enabled, priority, default_model, preview_model, final_model, notes)
VALUES
  ('gemini',    true,  2, 'gemini-3-pro-image',                  'gemini-2.5-flash-image',              'gemini-3-pro-image',                  'Google Gemini/Imagen — usa GEMINI_API_KEY'),
  ('stability', true,  1, 'stable-image-edit',                   'stable-image-edit',                   'stable-image-edit',                   'Requer STABILITY_API_KEY'),
  ('fal',       false, 3, 'fal-ai/nano-banana/edit',             'fal-ai/nano-banana/edit',             'fal-ai/flux/dev/image-to-image',      'Requer FAL_API_KEY'),
  ('replicate', false, 4, 'black-forest-labs/flux-kontext-pro',  'black-forest-labs/flux-schnell',      'black-forest-labs/flux-kontext-pro',  'Requer REPLICATE_API_TOKEN'),
  ('openai',    false, 5, 'gpt-image-2',                         'gpt-image-2',                         'gpt-image-2',                         'Requer OPENAI_API_KEY');
