import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Loader2 } from "lucide-react";

type Alert = {
  id: string;
  severity: string;
  title: string;
  message: string | null;
  decision: string | null;
  decided_at: string | null;
  created_at: string;
};

export function HistoryList({ locationId }: { locationId: string | null }) {
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("weather_alerts")
        .select("id,severity,title,message,decision,decided_at,created_at")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (alive) {
        setItems((data as Alert[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [locationId]);

  if (!locationId) return <div className="text-xs text-muted-foreground">Selecione um local.</div>;
  if (loading)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico…
      </div>
    );
  if (!items.length)
    return (
      <div className="text-xs text-muted-foreground">Nenhum evento registrado para este local.</div>
    );

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-border bg-black/30 p-3">
          <div className="flex items-center gap-2 text-xs">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="uppercase tracking-wide text-muted-foreground">{a.severity}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {new Date(a.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{a.title}</div>
          {a.message && <div className="text-xs text-foreground/70">{a.message}</div>}
          {a.decision && (
            <div className="mt-1 rounded border border-neon/40 bg-neon/5 px-2 py-1 text-[11px]">
              <b>Decisão:</b> {a.decision}{" "}
              {a.decided_at && (
                <span className="text-muted-foreground">
                  ({new Date(a.decided_at).toLocaleString("pt-BR")})
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
