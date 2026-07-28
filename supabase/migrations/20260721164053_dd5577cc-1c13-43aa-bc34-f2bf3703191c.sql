
-- ============ weather_locations ============
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

-- ============ weather_snapshots ============
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

-- ============ weather_alerts ============
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

-- ============ lightning_strikes ============
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
