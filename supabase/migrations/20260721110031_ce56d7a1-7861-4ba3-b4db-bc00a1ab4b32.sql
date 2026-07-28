-- ============== image_providers ==============
CREATE TABLE public.image_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  default_model TEXT,
  preview_model TEXT,
  final_model TEXT,
  current_status TEXT NOT NULL DEFAULT 'closed', -- closed | open | half_open
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

-- ============== image_generation_jobs ==============
CREATE TABLE public.image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_image_hash TEXT NOT NULL,
  corrections_hash TEXT NOT NULL,
  original_image_url TEXT,
  corrected_image_url TEXT,
  generation_mode TEXT NOT NULL DEFAULT 'final', -- preview | final
  final_status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | validating | completed | failed | cancelled
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

-- ============== image_generation_attempts ==============
CREATE TABLE public.image_generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.image_generation_jobs(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  model TEXT,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL, -- success | failed
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

-- ============== Seed inicial dos 5 provedores ==============
INSERT INTO public.image_providers
  (provider_name, enabled, priority, default_model, preview_model, final_model, notes)
VALUES
  ('gemini',    true,  1, 'gemini-3-pro-image',                  'gemini-2.5-flash-image',              'gemini-3-pro-image',                  'Google Gemini/Imagen — usa GEMINI_API_KEY'),
  ('stability', false, 2, 'stable-image-edit',                   'stable-image-edit',                   'stable-image-edit',                   'Requer STABILITY_API_KEY'),
  ('fal',       false, 3, 'fal-ai/nano-banana/edit',             'fal-ai/nano-banana/edit',             'fal-ai/flux/dev/image-to-image',      'Requer FAL_API_KEY'),
  ('replicate', false, 4, 'black-forest-labs/flux-kontext-pro',  'black-forest-labs/flux-schnell',      'black-forest-labs/flux-kontext-pro',  'Requer REPLICATE_API_TOKEN'),
  ('openai',    false, 5, 'gpt-image-2',                         'gpt-image-2',                         'gpt-image-2',                         'Requer OPENAI_API_KEY');
