import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Trash2, Star, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import type { WeatherLocation } from "@/lib/weather/types";

type GeoResult = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
};

export function LocationsManager({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (loc: WeatherLocation) => void;
}) {
  const [locations, setLocations] = useState<WeatherLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Partial<WeatherLocation> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("weather_locations")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("name");
    if (error) toast.error(error.message);
    else {
      setLocations((data as WeatherLocation[]) ?? []);
      const primary = (data as WeatherLocation[])?.find((l) => l.is_primary) ?? data?.[0];
      if (primary && !selectedId) onSelect(primary as WeatherLocation);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/public/weather/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (e) {
      toast.error("Falha ao buscar cidade");
    } finally {
      setSearching(false);
    }
  };

  const useGps = () => {
    if (!navigator.geolocation) return toast.error("GPS indisponível");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({
          name: "Minha localização",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          lightning_radius_km: 20,
          warning_radius_km: 30,
          timezone: "America/Sao_Paulo",
        });
      },
      () => toast.error("Permissão de GPS negada"),
    );
  };

  const startFromGeo = (r: GeoResult) => {
    setDraft({
      name: `${r.name}${r.admin1 ? " · " + r.admin1 : ""}`,
      latitude: r.latitude,
      longitude: r.longitude,
      lightning_radius_km: 20,
      warning_radius_km: 30,
      timezone: "America/Sao_Paulo",
    });
    setResults([]);
    setQ("");
  };

  const save = async () => {
    if (!draft?.name || draft.latitude == null || draft.longitude == null)
      return toast.error("Preencha nome e coordenadas");
    const { data, error } = await supabase
      .from("weather_locations")
      .insert({
        name: draft.name!,
        contract: draft.contract ?? null,
        unit: draft.unit ?? null,
        latitude: draft.latitude!,
        longitude: draft.longitude!,
        lightning_radius_km: draft.lightning_radius_km ?? 20,
        warning_radius_km: draft.warning_radius_km ?? 30,
        responsible_name: draft.responsible_name ?? null,
        responsible_phone: draft.responsible_phone ?? null,
        responsible_email: draft.responsible_email ?? null,
        timezone: draft.timezone ?? "America/Sao_Paulo",
        is_primary: draft.is_primary ?? false,
        enabled: true,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Local cadastrado");
    setDraft(null);
    await load();
    if (data) onSelect(data as WeatherLocation);
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este local?")) return;
    const { error } = await supabase.from("weather_locations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const setPrimary = async (id: string) => {
    await supabase.from("weather_locations").update({ is_primary: false }).neq("id", id);
    await supabase.from("weather_locations").update({ is_primary: true }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-black/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> Adicionar novo local
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar cidade…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="flex-1 min-w-[200px]"
          />
          <Button
            onClick={search}
            disabled={searching || q.length < 2}
            variant="secondary"
            size="sm"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}{" "}
            Buscar
          </Button>
          <Button onClick={useGps} variant="outline" size="sm">
            <MapPin className="mr-1 h-3.5 w-3.5" /> GPS
          </Button>
          <Button
            onClick={() =>
              setDraft({
                name: "",
                latitude: 0,
                longitude: 0,
                lightning_radius_km: 20,
                warning_radius_km: 30,
                timezone: "America/Sao_Paulo",
              })
            }
            variant="outline"
            size="sm"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Manual
          </Button>
        </div>
        {results.length > 0 && (
          <div className="mt-2 space-y-1">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => startFromGeo(r)}
                className="w-full rounded-lg border border-border bg-black/40 px-3 py-2 text-left text-xs hover:bg-neon/10"
              >
                <b>{r.name}</b> {r.admin1 && <>· {r.admin1}</>}{" "}
                {r.country && <span className="text-muted-foreground">({r.country})</span>}
                <div className="text-[10px] text-muted-foreground">
                  {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {draft && (
        <div className="rounded-xl border border-neon/40 bg-neon/5 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neon">
            Novo local
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Nome*"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              placeholder="Contrato"
              value={draft.contract ?? ""}
              onChange={(e) => setDraft({ ...draft, contract: e.target.value })}
            />
            <Input
              placeholder="Unidade / Mina / Planta"
              value={draft.unit ?? ""}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            />
            <Input
              placeholder="Fuso horário"
              value={draft.timezone ?? ""}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
            <Input
              placeholder="Latitude*"
              type="number"
              step="0.0001"
              value={draft.latitude ?? ""}
              onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })}
            />
            <Input
              placeholder="Longitude*"
              type="number"
              step="0.0001"
              value={draft.longitude ?? ""}
              onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })}
            />
            <Input
              placeholder="Raio crítico de raios (km)"
              type="number"
              value={draft.lightning_radius_km ?? 20}
              onChange={(e) => setDraft({ ...draft, lightning_radius_km: Number(e.target.value) })}
            />
            <Input
              placeholder="Raio de alerta (km)"
              type="number"
              value={draft.warning_radius_km ?? 30}
              onChange={(e) => setDraft({ ...draft, warning_radius_km: Number(e.target.value) })}
            />
            <Input
              placeholder="Responsável"
              value={draft.responsible_name ?? ""}
              onChange={(e) => setDraft({ ...draft, responsible_name: e.target.value })}
            />
            <Input
              placeholder="Telefone"
              value={draft.responsible_phone ?? ""}
              onChange={(e) => setDraft({ ...draft, responsible_phone: e.target.value })}
            />
            <Input
              placeholder="E-mail"
              value={draft.responsible_email ?? ""}
              onChange={(e) => setDraft({ ...draft, responsible_email: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.is_primary ?? false}
                onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })}
              />
              Definir como local principal
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={save} size="sm">
              <Save className="mr-1 h-3.5 w-3.5" /> Salvar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-black/30 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Locais monitorados
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        ) : locations.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhum local cadastrado ainda.</div>
        ) : (
          <div className="space-y-1">
            {locations.map((l) => (
              <div
                key={l.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selectedId === l.id ? "border-neon bg-neon/10" : "border-border bg-black/20"}`}
              >
                <button className="flex-1 text-left" onClick={() => onSelect(l)}>
                  <div className="flex items-center gap-1 font-semibold text-foreground">
                    {l.is_primary && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}{" "}
                    {l.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {l.latitude.toFixed(3)}, {l.longitude.toFixed(3)} · raio {l.lightning_radius_km}{" "}
                    km {l.contract && `· ${l.contract}`}
                  </div>
                </button>
                {!l.is_primary && (
                  <Button size="sm" variant="ghost" onClick={() => setPrimary(l.id)}>
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => del(l.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
