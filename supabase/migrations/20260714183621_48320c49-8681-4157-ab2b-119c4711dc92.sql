
CREATE TYPE public.record_module AS ENUM ('n3','kaizen','environment','emergency','supervision','crm','gain');
CREATE TYPE public.record_status AS ENUM ('aberto','em_andamento','concluido','cancelado');
CREATE TYPE public.record_priority AS ENUM ('baixa','media','alta','critica');

CREATE TABLE public.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module public.record_module NOT NULL,
  title text NOT NULL,
  description text,
  area text,
  location text,
  status public.record_status NOT NULL DEFAULT 'aberto',
  priority public.record_priority NOT NULL DEFAULT 'media',
  financial_value numeric(14,2),
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;
GRANT ALL ON public.records TO service_role;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "records read own or supervisor" ON public.records FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "records insert own" ON public.records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "records update own or supervisor" ON public.records FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "records delete own" ON public.records FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER records_set_updated_at BEFORE UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX records_module_idx ON public.records(module);
CREATE INDEX records_user_idx ON public.records(user_id);
CREATE INDEX records_status_idx ON public.records(status);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
