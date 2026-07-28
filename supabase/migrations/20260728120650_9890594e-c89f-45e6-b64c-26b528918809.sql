
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
CREATE POLICY "env_audits_own" ON public.environmental_audits FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_audits_updated_at BEFORE UPDATE ON public.environmental_audits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_audits_user_created ON public.environmental_audits(user_id, created_at DESC);

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
CREATE POLICY "env_findings_own" ON public.environmental_findings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_findings_updated_at BEFORE UPDATE ON public.environmental_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_findings_audit ON public.environmental_findings(audit_id, sort_index);

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
CREATE POLICY "env_attachments_own" ON public.environmental_attachments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX env_attachments_audit ON public.environmental_attachments(audit_id, created_at DESC);

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
CREATE POLICY "env_actions_own" ON public.environmental_actions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER env_actions_updated_at BEFORE UPDATE ON public.environmental_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX env_actions_audit ON public.environmental_actions(audit_id, priority, status);

CREATE POLICY "env_bucket_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "env_bucket_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'environmental' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  release_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  minimum_supported_version TEXT,
  rollout_percent INT NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_versions TO authenticated;
GRANT ALL ON public.app_versions TO service_role;

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active versions"
  ON public.app_versions FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage versions insert"
  ON public.app_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage versions update"
  ON public.app_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage versions delete"
  ON public.app_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER app_versions_set_updated_at
  BEFORE UPDATE ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_version_installs (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_version_installs TO authenticated;
GRANT ALL ON public.app_version_installs TO service_role;

ALTER TABLE public.app_version_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own install row"
  ON public.app_version_installs FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER app_version_installs_set_updated_at
  BEFORE UPDATE ON public.app_version_installs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS app_version_installs_version_idx
  ON public.app_version_installs(version);

INSERT INTO public.app_versions (version, title, description, release_notes, is_mandatory, rollout_percent)
VALUES (
  '2.0.0',
  'Sistema de versões e atualização automática',
  'Nova infraestrutura de controle de versões, com detecção automática, aviso in-app, rollout gradual e central administrativa.',
  '[
    "Detecção automática de novas versões (ao abrir, ao voltar à aba, após login e periodicamente)",
    "Aviso in-app com Atualizar agora / Ver novidades",
    "Suporte a atualização obrigatória e rollout gradual por porcentagem",
    "Página Novidades e Atualizações com histórico completo",
    "Central administrativa em /admin/versoes"
  ]'::jsonb,
  false,
  100
)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS n3_riscos jsonb,
  ADD COLUMN IF NOT EXISTS kaizen_melhorias jsonb,
  ADD COLUMN IF NOT EXISTS risco_selecionado_id text,
  ADD COLUMN IF NOT EXISTS n3_resumo_auditoria text;
