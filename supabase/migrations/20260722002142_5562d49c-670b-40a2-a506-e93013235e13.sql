ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS n3_riscos jsonb,
  ADD COLUMN IF NOT EXISTS kaizen_melhorias jsonb,
  ADD COLUMN IF NOT EXISTS risco_selecionado_id text,
  ADD COLUMN IF NOT EXISTS n3_resumo_auditoria text;