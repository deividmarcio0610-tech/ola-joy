
-- 1) Extend records with Vale result / versioning fields
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

-- Backfill vale_root_id = id when null (each existing record is its own root)
UPDATE public.records SET vale_root_id = id WHERE vale_root_id IS NULL;

-- Trigger: ensure vale_root_id defaults to id on insert
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

-- 2) record_versions: immutable submission history
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
