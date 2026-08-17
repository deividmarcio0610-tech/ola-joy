-- Correções de RLS e índices para as tabelas que a aplicação realmente usa.
--
-- 1) A política de SELECT de organizations criada em 20260812000000_core_schema.sql
--    compara `organization_id = id` sem qualificar `id`, então o `id` resolve para
--    organization_members.id e a condição nunca é verdadeira. Como toda a leitura do
--    módulo Nexus depende de organization_members, ninguém enxergava nada.
-- 2) organizations e organization_members recebem GRANT de INSERT/UPDATE/DELETE mas
--    não tinham políticas correspondentes: era impossível criar uma organização.
-- 3) meeting_sessions recebe GRANT de DELETE sem política de DELETE.

-- organizations: leitura corrigida + escrita para membros administradores.
DROP POLICY IF EXISTS "Users can see their organizations" ON public.organizations;
CREATE POLICY "Users can see their organizations" ON public.organizations
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = public.organizations.id AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update their organizations" ON public.organizations;
CREATE POLICY "Admins can update their organizations" ON public.organizations
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = public.organizations.id
              AND m.user_id = auth.uid()
              AND m.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Admins can delete their organizations" ON public.organizations;
CREATE POLICY "Admins can delete their organizations" ON public.organizations
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = public.organizations.id
              AND m.user_id = auth.uid()
              AND m.role = 'admin'
        )
    );

-- organization_members: sem política de SELECT nenhuma subconsulta das demais
-- tabelas do módulo funciona.
DROP POLICY IF EXISTS "Users can see org members" ON public.organization_members;
CREATE POLICY "Users can see org members" ON public.organization_members
    FOR SELECT TO authenticated USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organization_members sub
            WHERE sub.organization_id = public.organization_members.organization_id
              AND sub.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can join organizations" ON public.organization_members;
CREATE POLICY "Users can join organizations" ON public.organization_members
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can leave organizations" ON public.organization_members;
CREATE POLICY "Users can leave organizations" ON public.organization_members
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- meeting_sessions: completa o CRUD e reforça o WITH CHECK das escritas.
DROP POLICY IF EXISTS "Users can delete their own meeting sessions" ON public.meeting_sessions;
CREATE POLICY "Users can delete their own meeting sessions" ON public.meeting_sessions
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own meeting sessions" ON public.meeting_sessions;
CREATE POLICY "Users can update their own meeting sessions" ON public.meeting_sessions
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- professional_memories e resumes: DELETE faltava no grant original de 20260812000001.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_memories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;

-- Índices das consultas que a aplicação faz em toda tela.
CREATE INDEX IF NOT EXISTS meeting_sessions_user_start_idx
    ON public.meeting_sessions (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS professional_memories_user_created_idx
    ON public.professional_memories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS resumes_user_active_idx
    ON public.resumes (user_id, is_active);
