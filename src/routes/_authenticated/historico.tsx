import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, ScanLine, ImageOff, FileDown, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { exportVisionReportPdf, type PdfReport } from "@/lib/vision-pdf";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Scans · VALETECH" },
      { name: "description", content: "Todas as inspeções Vision AI IA salvas com score, data e status." },
    ],
  }),
  component: HistoricoPage,
});

type Inspection = {
  id: string;
  area: string | null;
  location: string | null;
  status: string;
  risk_level: string | null;
  photo_before_url: string | null;
  ai_analysis: PdfReport | null;
  created_at: string;
};

function HistoricoPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["inspections", "history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, area, location, status, risk_level, photo_before_url, ai_analysis, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Inspection[];
    },
  });

  const total = data?.length ?? 0;
  const abertas = data?.filter((i) => i.status === "aberta").length ?? 0;
  const concluidas = data?.filter((i) => i.status === "concluida").length ?? 0;
  const scores = data?.map((i) => i.ai_analysis?.score ?? 0).filter((s) => s > 0) ?? [];
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/40">
            <History className="h-5 w-5 text-neon" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold">Histórico de Scans</h1>
            <p className="text-xs text-muted-foreground">
              Inspeções Vision AI IA salvas.
            </p>
          </div>
        </div>
        <Button asChild className="gap-2">
          <Link to="/vision">
            <ScanLine className="h-4 w-4" /> Novo scan
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total" value={total} />
        <Kpi label="Abertas" value={abertas} />
        <Kpi label="Concluídas" value={concluidas} highlight />
        <Kpi label="Score médio" value={avg} suffix="/100" highlight={avg >= 70} />
      </div>

      <div className="rounded-xl border border-border bg-card/40">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <ScanLine className="h-8 w-8 text-neon" />
            <p className="text-sm text-muted-foreground">
              Nenhum scan salvo ainda. Comece pelo Vision AI.
            </p>
            <Button asChild size="sm">
              <Link to="/vision">Fazer primeiro scan</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((i) => (
              <HistoryRow key={i.id} inspection={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${highlight ? "text-neon" : "text-foreground"}`}
      >
        {value}
        {suffix && <span className="ml-0.5 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function HistoryRow({ inspection }: { inspection: Inspection }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const score = inspection.ai_analysis?.score ?? null;
  const dets = inspection.ai_analysis?.detections?.length ?? 0;
  const scoreColor =
    score == null
      ? "text-muted-foreground"
      : score >= 70
        ? "text-neon"
        : score >= 40
          ? "text-yellow-300"
          : "text-red-400";

  useEffect(() => {
    if (!inspection.photo_before_url) return;
    let active = true;
    supabase.storage
      .from("inspections")
      .createSignedUrl(inspection.photo_before_url, 60 * 60)
      .then(({ data }) => {
        if (active && data?.signedUrl) setThumb(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [inspection.photo_before_url]);

  async function exportPdf() {
    if (!inspection.ai_analysis) {
      toast.error("Este scan não possui análise para exportar.");
      return;
    }
    setExporting(true);
    try {
      let imgDataUrl: string | undefined;
      if (inspection.photo_before_url) {
        const { data } = await supabase.storage
          .from("inspections")
          .createSignedUrl(inspection.photo_before_url, 60 * 5);
        if (data?.signedUrl) {
          const blob = await (await fetch(data.signedUrl)).blob();
          imgDataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
        }
      }
      await exportVisionReportPdf({
        report: inspection.ai_analysis,
        image: imgDataUrl,
        note: inspection.location ?? "",
      });
    } catch {
      toast.error("Falha ao exportar PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <li className="flex items-center gap-4 p-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-black/60">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-semibold">
            {inspection.area || "Vision AI"}
          </span>
          <StatusBadge status={inspection.status} />
          {inspection.risk_level && <RiskDot level={inspection.risk_level} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{new Date(inspection.created_at).toLocaleString("pt-BR")}</span>
          {inspection.location && <span>· {inspection.location}</span>}
          <span>· {dets} {dets === 1 ? "detecção" : "detecções"}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <div className={`font-display text-2xl font-semibold leading-none ${scoreColor}`}>
          {score ?? "—"}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
          Score IA
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={exportPdf}
        disabled={exporting || !inspection.ai_analysis}
        title="Exportar PDF"
        className="ml-2 text-neon hover:bg-neon/10"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
      </Button>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberta: "bg-blue-500/15 text-blue-300 ring-blue-400/40",
    em_execucao: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/40",
    concluida: "bg-neon/15 text-neon ring-neon/40",
    cancelada: "bg-muted text-muted-foreground ring-border",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-display text-[9px] uppercase tracking-widest ring-1 ${cls}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function RiskDot({ level }: { level: string }) {
  const c =
    level === "verde"
      ? "bg-neon"
      : level === "amarelo"
        ? "bg-yellow-400"
        : level === "vermelho"
          ? "bg-red-500"
          : "bg-muted";
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${c}`} /> {level}
    </span>
  );
}
