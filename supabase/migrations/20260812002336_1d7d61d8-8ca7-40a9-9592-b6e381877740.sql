-- NOTA: esta migration repete o schema criado em 20260812000000_core_schema.sql.
-- Os comandos foram tornados idempotentes para que `supabase db reset` rode do zero
-- sem erro de objeto duplicado, preservando o conteúdo original.

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE public.meeting_type AS ENUM ('daily', 'weekly', 'management', 'project', 'client', 'security', 'maintenance', 'hr', 'commercial', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE public.action_status AS ENUM ('open', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE public.job_status AS ENUM ('open', 'closed', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE public.candidate_status AS ENUM ('applied', 'screening', 'interview', 'evaluating', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.user_role DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.meetings (
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

CREATE TABLE IF NOT EXISTS public.transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    content TEXT,
    json_data JSONB,
    provider TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    summary TEXT,
    decisions TEXT[],
    insights TEXT[],
    risks TEXT[],
    template_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.actions (
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

CREATE TABLE IF NOT EXISTS public.jobs (
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

CREATE TABLE IF NOT EXISTS public.candidates (
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

CREATE TABLE IF NOT EXISTS public.interviews (
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

CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content JSONB NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

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
