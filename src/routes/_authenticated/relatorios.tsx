import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Loader2, FileDown, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ModuleShell } from "@/components/module-shell";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · VALETECH" }] }),
  component: Reports,
});

const MODULE_LABEL: Record<string, string> = {
  n3: "N3",
  kaizen: "Kaizen",
  environment: "Meio Amb.",
  emergency: "Emergência",
  supervision: "Supervisão",
  crm: "CRM",
  gain: "Ganhos",
  inspecao: "Inspeção 5S",
};

const COLORS = ["#3b82f6", "#eab308", "#22c55e", "#ef4444"];

type RecordRow = {
  id: string;
  module: string;
  title: string | null;
  description: string | null;
  area: string | null;
  location: string | null;
  status: string;
  priority: string;
  financial_value: number | null;
  photo_url: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

function Reports() {
  const [building, setBuilding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reports-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select(
          "id, module, title, description, area, location, status, priority, financial_value, photo_url, created_at, meta",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RecordRow[];
    },
  });

  const byModule = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  let totalValor = 0;
  data?.forEach((r) => {
    byModule.set(r.module, (byModule.get(r.module) ?? 0) + 1);
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + 1);
    if (r.financial_value) totalValor += Number(r.financial_value);
  });

  const moduleData = Array.from(byModule.entries()).map(([k, v]) => ({
    name: MODULE_LABEL[k] ?? k,
    total: v,
  }));
  const statusData = Array.from(byStatus.entries()).map(([k, v]) => ({ name: k, value: v }));

  async function toDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function buildManagerialPdf() {
    if (!data || data.length === 0) {
      toast.error("Sem registros para gerar relatório.");
      return;
    }
    setBuilding(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;

      // === Capa ===
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageW, pageH, "F");
      doc.setTextColor(57, 255, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text("VALETECH", margin, 140);
      doc.setFontSize(14);
      doc.setTextColor(200, 200, 200);
      doc.text("Relatório Gerencial · Modo Executivo", margin, 168);
      doc.setFontSize(10);
      doc.text(
        `Emitido em ${new Date().toLocaleString("pt-BR")}`,
        margin,
        pageH - margin,
      );
      doc.setTextColor(57, 255, 20);
      doc.setFontSize(11);
      doc.text("Análise IA · Antes / Depois com IA", margin, pageH - margin - 18);

      // === Indicadores ===
      doc.addPage();
      let y = margin;
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Indicadores Consolidados", margin, y);
      y += 24;

      const kpis: [string, string][] = [
        ["Registros totais", String(data.length)],
        [
          "Concluídos",
          String(data.filter((r) => r.status === "concluido").length),
        ],
        [
          "Críticos",
          String(data.filter((r) => r.priority === "critica").length),
        ],
        [
          "Ganho consolidado",
          `R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        ],
      ];
      const kpiW = (pageW - margin * 2 - 12) / 2;
      kpis.forEach(([label, value], i) => {
        const x = margin + (i % 2) * (kpiW + 12);
        const yy = y + Math.floor(i / 2) * 70;
        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(x, yy, kpiW, 58, 6, 6, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(label.toUpperCase(), x + 12, yy + 18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(20, 20, 20);
        doc.text(value, x + 12, yy + 42);
      });
      y += 160;

      // Breakdown tables
      const drawTable = (title: string, rows: [string, number][]) => {
        if (y > pageH - 140) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text(title, margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        rows.forEach(([k, v]) => {
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 4, pageW - margin, y + 4);
          doc.text(k, margin, y);
          doc.text(String(v), pageW - margin, y, { align: "right" });
          y += 16;
        });
        y += 10;
      };

      drawTable(
        "Registros por módulo",
        Array.from(byModule.entries()).map(([k, v]) => [MODULE_LABEL[k] ?? k, v]),
      );
      drawTable("Distribuição por status", Array.from(byStatus.entries()));
      drawTable("Distribuição por prioridade", Array.from(byPriority.entries()));

      // === Detalhamento por registro ===
      doc.addPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Detalhamento de Registros", margin, y);
      y += 22;

      // Order: critical first
      const ordered = [...data].sort((a, b) => {
        const rank: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
        return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
      });

      for (const r of ordered) {
        const cardH = 210;
        if (y + cardH > pageH - margin) {
          doc.addPage();
          y = margin;
        }
        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(margin, y, pageW - margin * 2, cardH, 6, 6, "FD");

        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        const title = r.title ?? "(sem título)";
        doc.text(
          doc.splitTextToSize(title, pageW - margin * 2 - 20)[0] ?? title,
          margin + 10,
          y + 18,
        );
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(
          `${(MODULE_LABEL[r.module] ?? r.module).toUpperCase()} · ${r.status.toUpperCase()} · Prioridade: ${r.priority}`,
          margin + 10,
          y + 32,
        );

        // Images
        const imgW = 130;
        const imgH = 100;
        const imgY = y + 46;
        const beforeX = margin + 10;
        const afterX = beforeX + imgW + 10;
        doc.setFontSize(7);
        doc.setTextColor(90, 90, 90);
        doc.text("ANTES", beforeX, imgY - 4);
        doc.text("DEPOIS (IA)", afterX, imgY - 4);

        const beforeUrl = r.photo_url ? await toDataUrl(r.photo_url) : null;
        const afterUrlRaw = (r.meta as { after_url?: string } | null)?.after_url ?? null;
        const afterUrl = afterUrlRaw ? await toDataUrl(afterUrlRaw) : null;

        doc.setDrawColor(220, 220, 220);
        doc.rect(beforeX, imgY, imgW, imgH);
        doc.rect(afterX, imgY, imgW, imgH);
        if (beforeUrl) {
          try {
            doc.addImage(beforeUrl, "JPEG", beforeX, imgY, imgW, imgH);
          } catch {
            /* ignore */
          }
        }
        if (afterUrl) {
          try {
            doc.addImage(afterUrl, "PNG", afterX, imgY, imgW, imgH);
          } catch {
            /* ignore */
          }
        } else {
          doc.setFontSize(7);
          doc.setTextColor(150, 150, 150);
          doc.text("(não gerado)", afterX + imgW / 2, imgY + imgH / 2, { align: "center" });
        }

        // Resumo lado direito
        const infoX = afterX + imgW + 12;
        const infoW = pageW - margin - infoX - 10;
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const iris = (r.meta as { iris?: Record<string, string> } | null)?.iris ?? {};
        const lines: string[] = [];
        if (r.area) lines.push(`Área: ${r.area}`);
        if (r.location) lines.push(`Local: ${r.location}`);
        if (iris.equipment) lines.push(`Equipamento: ${iris.equipment}`);
        if (iris.risk) lines.push(`Risco: ${iris.risk}`);
        if (iris.immediate_action) lines.push(`Ação imediata: ${iris.immediate_action}`);
        if (iris.final_action) lines.push(`Ação definitiva: ${iris.final_action}`);
        if (iris.suggested_responsible)
          lines.push(`Responsável: ${iris.suggested_responsible}`);
        if (r.description) lines.push(`Descrição: ${r.description}`);
        const wrapped = doc.splitTextToSize(lines.join("\n"), infoW);
        doc.text(wrapped.slice(0, 12), infoX, imgY + 8);

        // Footer date
        doc.setFontSize(7);
        doc.setTextColor(140, 140, 140);
        doc.text(
          new Date(r.created_at).toLocaleString("pt-BR"),
          pageW - margin - 10,
          y + cardH - 8,
          { align: "right" },
        );

        y += cardH + 10;
      }

      doc.save(`valetech-gerencial-${Date.now()}.pdf`);
      toast.success("PDF gerencial gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <ModuleShell
      icon={BarChart3}
      title="Relatórios"
      subtitle="Indicadores consolidados da plataforma."
      status="operacional"
    >
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button
          size="sm"
          onClick={buildManagerialPdf}
          disabled={building || isLoading}
          className="gap-2"
        >
          {building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          PDF Gerencial (Antes/Depois)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="gap-2"
        >
          <FileDown className="h-4 w-4" /> Imprimir visão
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Registros totais" value={data?.length ?? 0} />
            <Kpi
              label="Concluídos"
              value={data?.filter((r) => r.status === "concluido").length ?? 0}
              highlight
            />
            <Kpi
              label="Ganho consolidado"
              value={`R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              highlight
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <h3 className="mb-3 font-display text-sm font-semibold">Registros por módulo</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={moduleData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #222" }} />
                  <Bar dataKey="total" fill="#39ff14" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <h3 className="mb-3 font-display text-sm font-semibold">Distribuição por status</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #222" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </ModuleShell>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${highlight ? "text-neon" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
