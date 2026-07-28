
CREATE TABLE public.safety_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  module_key TEXT,
  title TEXT NOT NULL DEFAULT 'Projeto Executivo',
  photo_url TEXT NOT NULL,
  interventions JSONB NOT NULL DEFAULT '[]'::jsonb,
  svg_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_plans TO authenticated;
GRANT ALL ON public.safety_plans TO service_role;

ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_plans_owner_select" ON public.safety_plans
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "safety_plans_owner_insert" ON public.safety_plans
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "safety_plans_owner_update" ON public.safety_plans
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "safety_plans_owner_delete" ON public.safety_plans
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER safety_plans_updated_at
  BEFORE UPDATE ON public.safety_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX safety_plans_created_by_idx ON public.safety_plans(created_by);
CREATE INDEX safety_plans_record_id_idx ON public.safety_plans(record_id);

CREATE TABLE public.weather_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contract text,
  unit text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  lightning_radius_km numeric NOT NULL DEFAULT 20,
  warning_radius_km numeric NOT NULL DEFAULT 30,
  responsible_name text,
  responsible_phone text,
  responsible_email text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  is_primary boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_locations TO authenticated;
GRANT ALL ON public.weather_locations TO service_role;
ALTER TABLE public.weather_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wl_owner_rw" ON public.weather_locations FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER weather_locations_set_updated_at BEFORE UPDATE ON public.weather_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX weather_locations_created_by_idx ON public.weather_locations(created_by);

CREATE TABLE public.weather_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  provider text NOT NULL DEFAULT 'open-meteo',
  status text NOT NULL DEFAULT 'ok',
  response_ms integer,
  error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.weather_snapshots TO authenticated;
GRANT ALL ON public.weather_snapshots TO service_role;
ALTER TABLE public.weather_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_owner_read" ON public.weather_snapshots FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.weather_locations l WHERE l.id = location_id AND (l.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "ws_owner_insert" ON public.weather_snapshots FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE INDEX weather_snapshots_location_idx ON public.weather_snapshots(location_id, fetched_at DESC);

CREATE TABLE public.weather_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  severity text NOT NULL,
  title text NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  resolved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_alerts TO authenticated;
GRANT ALL ON public.weather_alerts TO service_role;
ALTER TABLE public.weather_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_owner_rw" ON public.weather_alerts FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER weather_alerts_set_updated_at BEFORE UPDATE ON public.weather_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX weather_alerts_location_idx ON public.weather_alerts(location_id, created_at DESC);
CREATE INDEX weather_alerts_active_idx ON public.weather_alerts (created_by, resolved_at, created_at DESC);

CREATE TABLE public.lightning_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  distance_km numeric NOT NULL,
  bearing_degrees numeric,
  strike_type text,
  polarity text,
  intensity_ka numeric,
  quality numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lightning_strikes TO authenticated;
GRANT ALL ON public.lightning_strikes TO service_role;
ALTER TABLE public.lightning_strikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ls_owner_read" ON public.lightning_strikes FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.weather_locations l WHERE l.id = location_id AND (l.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "ls_owner_insert" ON public.lightning_strikes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE INDEX lightning_strikes_location_idx ON public.lightning_strikes(location_id, occurred_at DESC);

CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  platform TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions select" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own subscriptions insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subscriptions update" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subscriptions delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_push_subs_updated BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id) WHERE enabled = true;

CREATE TABLE public.push_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT,
  tag TEXT,
  is_test BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL,
  http_status INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.push_deliveries TO authenticated;
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deliveries select" ON public.push_deliveries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_push_deliveries_user_created ON public.push_deliveries(user_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weather_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.weather_alerts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weather_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.weather_locations';
  END IF;
END $$;

ALTER TABLE public.weather_alerts REPLICA IDENTITY FULL;
