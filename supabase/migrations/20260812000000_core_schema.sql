-- Create custom types
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'member');
CREATE TYPE public.meeting_type AS ENUM ('daily', 'weekly', 'management', 'project', 'client', 'security', 'maintenance', 'hr', 'commercial', 'other');
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.action_status AS ENUM ('open', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled');
CREATE TYPE public.job_status AS ENUM ('open', 'closed', 'paused');
CREATE TYPE public.candidate_status AS ENUM ('applied', 'screening', 'interview', 'evaluating', 'approved', 'rejected');

-- Organizations (Multi-tenant)
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Roles/Memberships
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.user_role DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

-- Meetings
CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type public.meeting_type DEFAULT 'other',
    status public.meeting_status DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    location TEXT,
    is_online BOOLEAN DEFAULT true,
    meeting_link TEXT,
    objective TEXT,
    agenda TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transcripts
CREATE TABLE public.transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    content TEXT,
    json_data JSONB, -- For segments, timestamps, speakers
    provider TEXT, -- 'whisper', 'openai', etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting Minutes (Atas)
CREATE TABLE public.minutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    summary TEXT,
    decisions TEXT[],
    insights TEXT[],
    risks TEXT[],
    template_id UUID, -- Optional template reference
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Action Plans
CREATE TABLE public.actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES auth.users(id),
    due_date TIMESTAMPTZ,
    status public.action_status DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Recruitment: Jobs
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    department TEXT,
    description TEXT,
    responsibilities TEXT[],
    requirements TEXT[],
    status public.job_status DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Recruitment: Candidates
CREATE TABLE public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    vaga_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    status public.candidate_status DEFAULT 'applied',
    resume_url TEXT,
    ai_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Recruitment: Interviews
CREATE TABLE public.interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    evaluation JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Templates
CREATE TABLE public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'meeting', 'interview', 'report'
    content JSONB NOT NULL, -- Structured layout/fields
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minutes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;

GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.meetings TO service_role;
GRANT ALL ON public.transcripts TO service_role;
GRANT ALL ON public.minutes TO service_role;
GRANT ALL ON public.actions TO service_role;
GRANT ALL ON public.jobs TO service_role;
GRANT ALL ON public.candidates TO service_role;
GRANT ALL ON public.interviews TO service_role;
GRANT ALL ON public.templates TO service_role;

-- Policies (Simplified for now - multi-tenant scoped)
CREATE POLICY "Users can see their organizations" ON public.organizations
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = id AND user_id = auth.uid())
    );

CREATE POLICY "Members can see org data" ON public.meetings
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.meetings.organization_id AND user_id = auth.uid())
    );

-- Repeat similar policies for other tables scoped to organization_id
CREATE POLICY "Members can see transcripts" ON public.transcripts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings JOIN public.organization_members ON public.meetings.organization_id = public.organization_members.organization_id WHERE public.meetings.id = meeting_id AND user_id = auth.uid()));
CREATE POLICY "Members can see minutes" ON public.minutes FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings JOIN public.organization_members ON public.meetings.organization_id = public.organization_members.organization_id WHERE public.meetings.id = meeting_id AND user_id = auth.uid()));
CREATE POLICY "Members can see actions" ON public.actions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.actions.organization_id AND user_id = auth.uid()));
CREATE POLICY "Members can see jobs" ON public.jobs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.jobs.organization_id AND user_id = auth.uid()));
CREATE POLICY "Members can see candidates" ON public.candidates FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.candidates.organization_id AND user_id = auth.uid()));
CREATE POLICY "Members can see interviews" ON public.interviews FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.interviews.organization_id AND user_id = auth.uid()));
CREATE POLICY "Members can see templates" ON public.templates FOR ALL TO authenticated USING (organization_id IS NULL OR EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = public.templates.organization_id AND user_id = auth.uid()));

