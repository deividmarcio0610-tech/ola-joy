
-- 1) app_versions
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

GRANT SELECT ON public.app_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_versions TO authenticated;
GRANT ALL ON public.app_versions TO service_role;

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active versions"
  ON public.app_versions FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage versions insert"
  ON public.app_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage versions update"
  ON public.app_versions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage versions delete"
  ON public.app_versions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER app_versions_set_updated_at
  BEFORE UPDATE ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) app_version_installs
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
  ON public.app_version_installs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER app_version_installs_set_updated_at
  BEFORE UPDATE ON public.app_version_installs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS app_version_installs_version_idx
  ON public.app_version_installs(version);

-- 3) Semente da primeira versão
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
