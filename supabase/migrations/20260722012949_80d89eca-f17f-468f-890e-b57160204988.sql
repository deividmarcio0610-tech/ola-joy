
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own blocks" ON public.blocks
  FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users create own blocks" ON public.blocks
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users delete own blocks" ON public.blocks
  FOR DELETE USING (auth.uid() = blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

DROP POLICY IF EXISTS "Users upload own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users read own evidence" ON storage.objects;

CREATE POLICY "Users upload own evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
