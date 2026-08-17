-- Políticas definitivas do módulo Nexus. Cada CREATE é precedido de DROP IF EXISTS
-- porque 20260812000000_core_schema.sql cria políticas com os mesmos nomes.

DROP POLICY IF EXISTS "Users can see their organizations" ON public.organizations;
CREATE POLICY "Users can see their organizations" ON public.organizations
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.organizations.id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can see org members" ON public.organization_members;
CREATE POLICY "Users can see org members" ON public.organization_members
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members AS sub WHERE sub.organization_id = public.organization_members.organization_id AND sub.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage meetings" ON public.meetings;
CREATE POLICY "Members can manage meetings" ON public.meetings
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.meetings.organization_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage transcripts" ON public.transcripts;
CREATE POLICY "Members can manage transcripts" ON public.transcripts
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.meetings 
            JOIN public.organization_members ON public.meetings.organization_id = public.organization_members.organization_id 
            WHERE public.meetings.id = meeting_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members can manage minutes" ON public.minutes;
CREATE POLICY "Members can manage minutes" ON public.minutes
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.meetings 
            JOIN public.organization_members ON public.meetings.organization_id = public.organization_members.organization_id 
            WHERE public.meetings.id = meeting_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members can manage actions" ON public.actions;
CREATE POLICY "Members can manage actions" ON public.actions
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.actions.organization_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage jobs" ON public.jobs;
CREATE POLICY "Members can manage jobs" ON public.jobs
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.jobs.organization_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage candidates" ON public.candidates;
CREATE POLICY "Members can manage candidates" ON public.candidates
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.candidates.organization_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage interviews" ON public.interviews;
CREATE POLICY "Members can manage interviews" ON public.interviews
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.interviews.organization_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can manage templates" ON public.templates;
CREATE POLICY "Members can manage templates" ON public.templates
    FOR ALL TO authenticated USING (
        is_system = true OR EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.templates.organization_id AND user_id = auth.uid())
    );
