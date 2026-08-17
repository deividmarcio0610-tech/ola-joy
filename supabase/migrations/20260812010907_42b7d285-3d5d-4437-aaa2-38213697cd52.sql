CREATE TYPE public.professional_memory_category AS ENUM (
    'PERFIL', 'FORMAÇÃO', 'EXPERIÊNCIA', 'EMPRESA', 'CARGO', 
    'PROJETO', 'COMPETÊNCIA', 'CERTIFICAÇÃO', 'CURSO', 
    'RESULTADO', 'CONHECIMENTO TÉCNICO', 'HISTÓRIA PROFISSIONAL', 'RESPOSTA PREFERIDA'
);

CREATE TABLE IF NOT EXISTS public.professional_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category public.professional_memory_category NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    keywords TEXT[],
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content_text TEXT,
    parsed_data JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_memories TO authenticated;
GRANT ALL ON public.professional_memories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;

ALTER TABLE public.professional_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own memories" ON public.professional_memories
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own resumes" ON public.resumes
    FOR ALL TO authenticated USING (auth.uid() = user_id);
