import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Leaf,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  FileText,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell } from "@/components/module-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EnvRecordDialog } from "@/components/env-record-dialog";

export const Route = createFileRoute("/_authenticated/meio-ambiente")({
  head: () => ({ meta: [{ title: "Meio Ambiente · VisionGuard AI" }] }),
  component: MeioAmbientePage,
});

const levelColor: Record<string, string> = {
  muito_baixo: "bg-green-500/15 text-green-300 ring-green-500/40",
  baixo: "bg-teal-500/15 text-teal-300 ring-teal-500/40",
  moderado: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40",
  alto: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  critico: "bg-red-500/15 text-red-300 ring-red-500/40",
};
const levelLabel: Record<string, string> = {
  muito_baixo: "Muito baixo",
  baixo: "Baixo",
  moderado: "Moderado",
  alto: "Alto",
  critico: "Crítico",
};

type EnvRecord = {
  id: string;
  internal_code: string | null;
  title: string | null;
  description: string | null;
  area: string | null;
  location: string | null;
  equipment: string | null;
  status: string | null;
  priority: string | null;
  photo_url: string | null;
  created_at: string;
  env_categories: string[] | null;
  env_score_before: number | null;
  env_level_before: string | null;
  env_score_after: number | null;
  env_level_after: string | null;
  env_effectiveness: string | null;
  env_audit_verdict: string | null;
  env_after_photo_url: string | null;
};

function MeioAmbientePage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("recentes");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["env-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select(
          "id, internal_code, title, description, area, location, equipment, status, priority, photo_url, created_at, env_categories, env_score_before, env_level_before, env_score_after, env_level_after, env_effectiveness, env_audit_verdict, env_after_photo_url",
        )
        .eq("module", "environment")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as EnvRecord[];
    },
  });

  const kpis = useMemo(() => {
    const now = Date.now();
    return {
      total: records.length,
      abertos: records.filter((r) => r.status !== "concluido" && r.status !== "cancelado").length,
      criticos: records.filter(
        (r) => r.env_level_before === "critico" || r.env_level_before === "alto",
      ).length,
      emergencias: records.filter((r) => r.env_categories?.includes("emergencia_ambiental")).length,
      aguardEvid: records.filter((r) => r.status === "em_andamento" && !r.env_after_photo_url)
        .length,
      aguardValid: records.filter((r) => r.env_after_photo_url && !r.env_audit_verdict).length,
      encerrados: records.filter((r) => r.status === "concluido").length,
      vencidas: records.filter((r) => {
        if (r.status === "concluido") return false;
        const d = new Date(r.created_at).getTime();
        return now - d > 15 * 24 * 3600 * 1000 && !r.env_after_photo_url;
      }).length,
    };
  }, [records]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = records;
    if (s) {
      list = list.filter((r) =>
        [r.title, r.description, r.area, r.location, r.equipment, r.internal_code]
          .filter(Boolean)
          .some((x) => x!.toLowerCase().includes(s)),
      );
    }
    if (tab === "criticos")
      list = list.filter((r) => r.env_level_before === "critico" || r.env_level_before === "alto");
    else if (tab === "vencidas") {
      const now = Date.now();
      list = list.filter(
        (r) =>
          r.status !== "concluido" &&
          now - new Date(r.created_at).getTime() > 15 * 24 * 3600 * 1000 &&
          !r.env_after_photo_url,
      );
    } else if (tab === "aguard_evid")
      list = list.filter((r) => r.status === "em_andamento" && !r.env_after_photo_url);
    else if (tab === "aguard_valid")
      list = list.filter((r) => r.env_after_photo_url && !r.env_audit_verdict);
    else if (tab === "encerrados") list = list.filter((r) => r.status === "concluido");
    return list;
  }, [records, search, tab]);

  return (
    <ModuleShell
      icon={Leaf}
      title="Meio Ambiente"
      subtitle="Inspeção, auditoria, análise de impactos e acompanhamento de ações ambientais com apoio da IA."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { k: "Total", v: kpis.total, i: FileText, c: "text-muted-foreground" },
            { k: "Abertos", v: kpis.abertos, i: Clock, c: "text-blue-300" },
            { k: "Críticos", v: kpis.criticos, i: AlertTriangle, c: "text-red-300" },
            { k: "Emergências", v: kpis.emergencias, i: AlertTriangle, c: "text-red-400" },
            { k: "Vencidas", v: kpis.vencidas, i: Clock, c: "text-orange-300" },
            { k: "Aguard. evidência", v: kpis.aguardEvid, i: Clock, c: "text-yellow-300" },
            { k: "Aguard. validação", v: kpis.aguardValid, i: ShieldCheck, c: "text-cyan-300" },
            { k: "Encerrados", v: kpis.encerrados, i: CheckCircle2, c: "text-neon" },
          ].map((k) => (
            <div key={k.k} className="rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <k.i className={`w-3 h-3 ${k.c}`} />
                {k.k}
              </div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{k.v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setOpen(true)} className="bg-neon text-black hover:bg-neon/90">
            <Plus className="w-4 h-4 mr-1" />
            Registrar condição ambiental
          </Button>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1" />
            Analisar com a IA
          </Button>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, área, equipamento, código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="recentes">Recentes</TabsTrigger>
            <TabsTrigger value="criticos">Críticos</TabsTrigger>
            <TabsTrigger value="vencidas">Ações vencidas</TabsTrigger>
            <TabsTrigger value="aguard_evid">Aguard. evidência</TabsTrigger>
            <TabsTrigger value="aguard_valid">Aguard. validação</TabsTrigger>
            <TabsTrigger value="encerrados">Encerrados</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            {isLoading && (
              <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-lg">
                Nenhum registro nesta categoria.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border bg-card/50 overflow-hidden hover:border-neon/40 transition"
                >
                  {r.photo_url && (
                    <div className="aspect-video bg-muted overflow-hidden">
                      <PhotoThumb path={r.photo_url} />
                    </div>
                  )}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {r.internal_code && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.internal_code}
                        </Badge>
                      )}
                      {r.env_level_before && (
                        <Badge className={`text-[10px] ${levelColor[r.env_level_before] ?? ""}`}>
                          {levelLabel[r.env_level_before] ?? r.env_level_before}
                        </Badge>
                      )}
                      {r.env_after_photo_url && !r.env_audit_verdict && (
                        <Badge className="text-[10px] bg-cyan-500/15 text-cyan-300">
                          Aguardando validação
                        </Badge>
                      )}
                      {r.env_audit_verdict === "conforme" && (
                        <Badge className="text-[10px] bg-neon/15 text-neon">Validado</Badge>
                      )}
                    </div>
                    <div className="font-medium text-sm line-clamp-1">
                      {r.title ?? "Sem título"}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {r.description}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                      {r.area && <span>{r.area}</span>}
                      {r.equipment && <span>· {r.equipment}</span>}
                      <span className="ml-auto">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {r.env_categories && r.env_categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.env_categories.slice(0, 3).map((c) => (
                          <span
                            key={c}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
                          >
                            {c.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <EnvRecordDialog open={open} onOpenChange={setOpen} />
    </ModuleShell>
  );
}

function PhotoThumb({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["signed-thumb", path],
    queryFn: async () => {
      if (path.startsWith("http")) return path;
      const r = await supabase.storage.from("inspections").createSignedUrl(path, 3600);
      return r.data?.signedUrl ?? null;
    },
    staleTime: 55 * 60 * 1000,
  });
  if (!data) return null;
  return <img src={data} alt="" className="w-full h-full object-cover" />;
}
