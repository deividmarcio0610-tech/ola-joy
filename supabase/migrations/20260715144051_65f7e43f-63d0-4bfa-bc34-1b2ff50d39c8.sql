
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
CREATE INDEX IF NOT EXISTS idx_records_image_phash ON public.records(image_phash) WHERE image_phash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_duplicate_of ON public.records(duplicate_of) WHERE duplicate_of IS NOT NULL;
