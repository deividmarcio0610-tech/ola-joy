-- Adicionando colunas de reputação e fraude se não existirem (garantindo idempotência)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='trust_score') THEN
        ALTER TABLE public.profiles ADD COLUMN trust_score INTEGER DEFAULT 50;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='city') THEN
        ALTER TABLE public.profiles ADD COLUMN city TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='name') THEN
        ALTER TABLE public.profiles ADD COLUMN name TEXT;
    END IF;
END $$;

-- Garantindo Grants
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- professional_memories e resumes só são criadas na migration 20260812010907.
-- Em um banco novo estas tabelas ainda não existem aqui, por isso cada comando
-- roda condicionado à existência delas (a migration seguinte cria as políticas
-- definitivas de qualquer forma).
DO $$
BEGIN
    IF to_regclass('public.professional_memories') IS NOT NULL THEN
        GRANT SELECT, INSERT, UPDATE ON public.professional_memories TO authenticated;

        ALTER TABLE public.professional_memories ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can manage their own memories" ON public.professional_memories;
        CREATE POLICY "Users can manage their own memories" ON public.professional_memories
            FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    IF to_regclass('public.resumes') IS NOT NULL THEN
        GRANT SELECT, INSERT, UPDATE ON public.resumes TO authenticated;

        ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can manage their own resumes" ON public.resumes;
        CREATE POLICY "Users can manage their own resumes" ON public.resumes
            FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
