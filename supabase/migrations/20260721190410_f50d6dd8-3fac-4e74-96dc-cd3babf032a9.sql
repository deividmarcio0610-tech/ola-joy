-- Módulo Auditoria Ambiental IA — Fase 1

-- ========== environmental_audits ==========
CREATE TABLE public.environmental_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  area TEXT,
  location TEXT,
  scope TEXT[] DEFAULT '{}',
  environment_type TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','em_analise','concluida','em_execucao','encerrada','arquivada')),
  criticality TEXT
    CHECK (criticality IN ('controlada','baixa','moderada','alta','muito_alta','critica')),
  overall_confidence INTEGER,
  summary TEXT,
  ai_payload JSONB,
  original_photo_url TEXT,
  compared_photo_url TEXT,
  requires_validation BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environmental_audits TO authenticated;
GRANT ALL ON public.environmental_audits TO service_role;
ALTER TABLE public.environmental_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_audits_own" ON public.environmental_audits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_audits_updated_at BEFORE UPDATE ON public.environmental_audits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_audits_user_created ON public.environmental_audits(user_id, created_at DESC);

-- ========== environmental_findings ==========
-- Constatações N3 com separação evidência × interpretação × hipótese × recomendação.
CREATE TABLE public.environmental_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.environmental_audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  level_1_observation TEXT,
  level_2_interpretation TEXT,
  level_3_analysis TEXT,
  aspect TEXT,
  impact TEXT,
  medium_affected TEXT[] DEFAULT '{}',
  classification TEXT
    CHECK (classification IN (
      'boa_pratica','oportunidade','observacao','desvio',
      'possivel_nc','nc_documental','nc_operacional',
      'risco_ambiental','risco_critico','emergencia_potencial',
      'necessita_investigacao','necessita_medicao','necessita_amostragem',
      'necessita_validacao_juridica','necessita_validacao_tecnica'
    )),
  criticality TEXT
    CHECK (criticality IN ('controlada','baixa','moderada','alta','muito_alta','critica')),
  evidence_type TEXT
    CHECK (evidence_type IN ('fato','interpretacao','hipotese','recomendacao','validado')),
  severity INTEGER,
  probability INTEGER,
  reversibility TEXT,
  control_hierarchy TEXT
    CHECK (control_hierarchy IN ('eliminacao','substituicao','reducao_geracao','engenharia','contencao','monitoramento','administrativo','treinamento','emergencia','compensacao')),
  proposals JSONB DEFAULT '[]'::jsonb,
  skeptic_notes TEXT,
  interference_notes TEXT,
  indicators TEXT[] DEFAULT '{}',
  requires TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environmental_findings TO authenticated;
GRANT ALL ON public.environmental_findings TO service_role;
ALTER TABLE public.environmental_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_findings_own" ON public.environmental_findings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_findings_updated_at BEFORE UPDATE ON public.environmental_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_findings_audit ON public.environmental_findings(audit_id, sort_index);

-- ========== environmental_attachments ==========
CREATE TABLE public.environmental_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES public.environmental_audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('foto','pdf','planilha','video','audio','documento','licenca','condicionante','laudo','procedimento','checklist','outro')),
  filename TEXT NOT NULL,
  storage_path TEXT,
  public_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  extracted_text TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environmental_attachments TO authenticated;
GRANT ALL ON public.environmental_attachments TO service_role;
ALTER TABLE public.environmental_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_attachments_own" ON public.environmental_attachments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX env_attachments_audit ON public.environmental_attachments(audit_id, created_at DESC);

-- ========== environmental_actions (5W2H + Kaisen Ambiental) ==========
CREATE TABLE public.environmental_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.environmental_audits(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES public.environmental_findings(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'kaisen'
    CHECK (tier IN ('imediata','kaisen','engenharia','inovacao')),
  what TEXT NOT NULL,
  why TEXT,
  where_ TEXT,
  when_ TEXT,
  who TEXT,
  how TEXT,
  how_much TEXT
    CHECK (how_much IN ('muito_baixo','baixo','medio','alto','estrategico')),
  priority TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','em_andamento','concluido','verificado','cancelado')),
  indicator TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  before_photo_url TEXT,
  after_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environmental_actions TO authenticated;
GRANT ALL ON public.environmental_actions TO service_role;
ALTER TABLE public.environmental_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_actions_own" ON public.environmental_actions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_actions_updated_at BEFORE UPDATE ON public.environmental_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_actions_audit ON public.environmental_actions(audit_id, priority, status);
