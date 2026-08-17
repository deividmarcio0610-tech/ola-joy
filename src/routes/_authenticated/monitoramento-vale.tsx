import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileCheck2,
  History as HistoryIcon,
  Filter,
  Download,
  FileText,
  Sparkles,
  Layers,
  TrendingUp,
  Timer,
  RotateCcw,
  GitBranch,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listMonitoring,
  confirmValeSend,
  updateValeStatus,
  listHistory,
  registerValeResult,
  createValeRevision,
  listValeVersions,
  generateValeInsights,
} from "@/lib/records.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/monitoramento-vale")({
  head: () => ({
    meta: [
      { title: "Monitoramento Vale · VisionGuard AI" },
      {
        name: "description",
        content:
          "Controle de eventos enviados, resultados, aprovações, reprovações e tratativas com a Vale.",
      },
    ],
  }),
  component: MonitoringPage,
});

// ─────────────────────────── labels / paletas
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  awaiting_review: "Pendente de envio",
  ready: "Pronto para envio",
  sent: "Enviado à Vale",
  awaiting_return: "Pendente de resultado",
  accepted: "Aprovado",
  rejected: "Reprovado",
  needs_fix: "Devolvido p/ correção",
  in_treatment: "Em tratativa",
  awaiting_evidence: "Aguardando evidência",
  awaiting_validation: "Aguardando validação",
  closed: "Encerrado",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted/40 text-muted-foreground border-muted/40",
  awaiting_review: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  ready: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  sent: "bg-neon/15 text-neon border-neon/40",
  awaiting_return: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  accepted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
  needs_fix: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  in_treatment: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  awaiting_evidence: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  awaiting_validation: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  closed: "bg-muted/60 text-muted-foreground border-muted/60",
};
const RESULT_LABELS: Record<string, string> = {
  approved: "Aprovado",
  approved_pending_exec: "Aprovado – aguard. execução",
  approved_done: "Aprovado e concluído",
  rejected: "Reprovado",
  returned: "Devolvido p/ correção",
  awaiting_complement: "Aguardando complemento",
  canceled: "Cancelado",
};
const REJECT_CATEGORIES = [
  "Foto insuficiente",
  "Evidência inadequada",
  "Descrição incompleta",
  "Classificação incorreta",
  "Registro duplicado",
  "Ação proposta insuficiente",
  "Plano de ação incompleto",
  "Responsável não definido",
  "Prazo inadequado",
  "Ausência de comprovante",
  "Dados divergentes",
  "Registro fora do padrão",
  "Condição não caracterizada",
  "Solução tecnicamente inadequada",
  "Outro",
];
const CHANNELS = [
  "IA da Vale",
  "Sistema interno Vale",
  "E-mail",
  "WhatsApp corporativo",
  "Teams",
  "Outro",
];
const NEON = "#39ff14";
const CHART_COLORS = [
  NEON,
  "#3b82f6",
  "#eab308",
  "#ef4444",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#84cc16",
];

type RecordRow = {
  id: string;
  internal_code: string | null;
  vale_protocol: string | null;
  vale_code: string | null;
  vale_status: string | null;
  vale_result: string | null;
  vale_result_at: string | null;
  vale_result_note: string | null;
  vale_reject_category: string | null;
  vale_reject_reason: string | null;
  vale_result_proof_url: string | null;
  vale_result_document_url: string | null;
  vale_version: number | null;
  vale_root_id: string | null;
  vale_channel: string | null;
  vale_deadline: string | null;
  module: string;
  title: string | null;
  description: string | null;
  area: string | null;
  location: string | null;
  equipment: string | null;
  status: string | null;
  priority: string | null;
  financial_value: number | null;
  photo_url: string | null;
  sent_at: string | null;
  sent_channel: string | null;
  send_proof_url: string | null;
  parent_record_id: string | null;
  recurrence_index: number | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  meta: Record<string, unknown> | null;
};

// ─────────────────────────── filtros
type Filters = {
  from: string;
  to: string;
  module: string;
  status: string;
  result: string;
  area: string;
  priority: string;
  q: string;
  reject: string;
  onlyOverdue: boolean;
  onlyNoProtocol: boolean;
};
const emptyFilters: Filters = {
  from: "",
  to: "",
  module: "all",
  status: "all",
  result: "all",
  area: "",
  priority: "all",
  q: "",
  reject: "all",
  onlyOverdue: false,
  onlyNoProtocol: false,
};

function daysBetween(a: string, b: string) {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, d);
}

function MonitoringPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMonitoring);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(true);
  const [sendTarget, setSendTarget] = useState<RecordRow | null>(null);
  const [resultTarget, setResultTarget] = useState<RecordRow | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<RecordRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<RecordRow | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<RecordRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RecordRow | null>(null);
  const [insight, setInsight] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["monitoring-vale"],
    queryFn: () => list(),
  });
  // `?? []` criava um array novo a cada render, o que invalidava os useMemo abaixo
  // (filtragem e KPIs recalculavam sempre). Memorizar estabiliza a referência.
  const records = useMemo(() => (data?.records ?? []) as RecordRow[], [data?.records]);

  // ── filtragem
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filters.from && r.created_at < filters.from) return false;
      if (filters.to && r.created_at > filters.to + "T23:59:59") return false;
      if (filters.module !== "all" && r.module !== filters.module) return false;
      if (filters.status !== "all" && (r.vale_status ?? "draft") !== filters.status) return false;
      if (filters.result !== "all" && (r.vale_result ?? "") !== filters.result) return false;
      if (filters.priority !== "all" && (r.priority ?? "") !== filters.priority) return false;
      if (filters.reject !== "all" && (r.vale_reject_category ?? "") !== filters.reject)
        return false;
      if (filters.area && !(r.area ?? "").toLowerCase().includes(filters.area.toLowerCase()))
        return false;
      if (filters.onlyOverdue) {
        if (!r.vale_deadline || r.vale_result) return false;
        if (new Date(r.vale_deadline) > new Date()) return false;
      }
      if (filters.onlyNoProtocol) {
        if (!(r.vale_status === "sent" || r.vale_status === "awaiting_return")) return false;
        if (r.vale_protocol) return false;
      }
      if (filters.q) {
        const term = filters.q.toLowerCase();
        const hay = [
          r.internal_code,
          r.vale_protocol,
          r.vale_code,
          r.title,
          r.description,
          r.area,
          r.location,
          r.equipment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [records, filters]);

  // ── indicadores
  const kpis = useMemo(() => {
    const c = (fn: (r: RecordRow) => boolean) => filtered.filter(fn).length;
    const isSent = (r: RecordRow) =>
      [
        "sent",
        "awaiting_return",
        "accepted",
        "rejected",
        "needs_fix",
        "awaiting_evidence",
        "in_treatment",
        "awaiting_validation",
        "closed",
      ].includes(r.vale_status ?? "");
    const hasResult = (r: RecordRow) => !!r.vale_result;
    const approved = c((r) =>
      ["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""),
    );
    const rejected = c((r) => r.vale_result === "rejected");
    const totalResult = approved + rejected;
    const respDays = filtered
      .filter((r) => r.sent_at && r.vale_result_at)
      .map((r) => daysBetween(r.sent_at!, r.vale_result_at!));
    const approvedDays = filtered
      .filter(
        (r) =>
          r.sent_at &&
          r.vale_result_at &&
          ["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""),
      )
      .map((r) => daysBetween(r.sent_at!, r.vale_result_at!));
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    return {
      total: filtered.length,
      pending_send: c((r) =>
        ["draft", "awaiting_review", "ready"].includes(r.vale_status ?? "draft"),
      ),
      sent: c(isSent),
      pending_result: c(
        (r) => (r.vale_status === "sent" || r.vale_status === "awaiting_return") && !hasResult(r),
      ),
      approved,
      rejected,
      returned: c((r) => r.vale_result === "returned"),
      resent: c((r) => (r.vale_version ?? 1) > 1),
      closed: c((r) => r.vale_status === "closed"),
      critical: c(
        (r) => r.priority === "alta" || r.priority === "urgente" || r.priority === "critica",
      ),
      overdue: c(
        (r) => !!r.vale_deadline && !r.vale_result && new Date(r.vale_deadline) < new Date(),
      ),
      no_protocol: c(
        (r) =>
          (r.vale_status === "sent" || r.vale_status === "awaiting_return") && !r.vale_protocol,
      ),
      approval_rate: totalResult > 0 ? Math.round((approved / totalResult) * 100) : 0,
      rejection_rate: totalResult > 0 ? Math.round((rejected / totalResult) * 100) : 0,
      avg_response: Math.round(avg(respDays) * 10) / 10,
      avg_to_approval: Math.round(avg(approvedDays) * 10) / 10,
      versions: filtered.reduce((s, r) => s + ((r.vale_version ?? 1) - 1), 0),
      recurrences: c((r) => !!r.parent_record_id),
    };
  }, [filtered]);

  // ── gráficos
  const chartData = useMemo(() => {
    const g = <K extends string>(picker: (r: RecordRow) => K | null | undefined) => {
      const m = new Map<string, number>();
      filtered.forEach((r) => {
        const k = picker(r);
        if (!k) return;
        m.set(k, (m.get(k) ?? 0) + 1);
      });
      return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    };
    // 1 pizza por resultado
    const byResult = [
      { name: "Aprovados", value: kpis.approved, color: "#10b981" },
      { name: "Reprovados", value: kpis.rejected, color: "#ef4444" },
      { name: "Devolvidos", value: kpis.returned, color: "#f97316" },
      { name: "Pendentes", value: kpis.pending_result, color: "#eab308" },
      { name: "Encerrados", value: kpis.closed, color: "#6b7280" },
    ].filter((x) => x.value > 0);

    // 2 evolução mensal
    const byMonth = new Map<
      string,
      { name: string; enviados: number; aprovados: number; reprovados: number; reenviados: number }
    >();
    filtered.forEach((r) => {
      const d = new Date(r.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = byMonth.get(k) ?? {
        name: k,
        enviados: 0,
        aprovados: 0,
        reprovados: 0,
        reenviados: 0,
      };
      if (r.sent_at) row.enviados++;
      if (["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""))
        row.aprovados++;
      if (r.vale_result === "rejected") row.reprovados++;
      if ((r.vale_version ?? 1) > 1) row.reenviados++;
      byMonth.set(k, row);
    });
    const evolution = Array.from(byMonth.values()).sort((a, b) => a.name.localeCompare(b.name));

    // 3 taxa aprovação por módulo
    const byModule = new Map<string, { a: number; total: number }>();
    filtered.forEach((r) => {
      const cur = byModule.get(r.module) ?? { a: 0, total: 0 };
      if (r.vale_result) cur.total++;
      if (["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""))
        cur.a++;
      byModule.set(r.module, cur);
    });
    const approvalByModule = Array.from(byModule.entries()).map(([name, v]) => ({
      name,
      taxa: v.total > 0 ? Math.round((v.a / v.total) * 100) : 0,
    }));

    // 4 motivos reprovação
    const rejReasons = g((r) =>
      r.vale_result === "rejected" ? (r.vale_reject_category ?? "Não informado") : null,
    );
    // 5 por área
    const byArea = g((r) => r.area)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    // 6 por criticidade
    const byPriority = g((r) => r.priority);
    // 7 tempo médio de resposta / mês
    const respByMonth = new Map<string, number[]>();
    filtered.forEach((r) => {
      if (!r.sent_at || !r.vale_result_at) return;
      const d = new Date(r.vale_result_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const arr = respByMonth.get(k) ?? [];
      arr.push(daysBetween(r.sent_at, r.vale_result_at));
      respByMonth.set(k, arr);
    });
    const responseTime = Array.from(respByMonth.entries())
      .map(([name, arr]) => ({
        name,
        dias: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 8 primeira submissão vs após correção
    const firstVsCorr = [
      {
        name: "1ª submissão",
        aprovados: filtered.filter(
          (r) =>
            (r.vale_version ?? 1) === 1 &&
            ["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""),
        ).length,
      },
      {
        name: "Após correção",
        aprovados: filtered.filter(
          (r) =>
            (r.vale_version ?? 1) > 1 &&
            ["approved", "approved_pending_exec", "approved_done"].includes(r.vale_result ?? ""),
        ).length,
      },
    ];

    // 9 registros por responsável (usuário)
    const byUser = g((r) => r.user_id).slice(0, 10);

    // 10 pendências por prazo
    const now = new Date();
    const deadlineBuckets = [
      {
        name: "No prazo",
        value: filtered.filter(
          (r) => r.vale_deadline && !r.vale_result && new Date(r.vale_deadline) > now,
        ).length,
      },
      {
        name: "Vence em 3 dias",
        value: filtered.filter(
          (r) =>
            r.vale_deadline &&
            !r.vale_result &&
            daysBetween(now.toISOString(), r.vale_deadline) <= 3 &&
            new Date(r.vale_deadline) > now,
        ).length,
      },
      {
        name: "Vencido",
        value: filtered.filter(
          (r) => r.vale_deadline && !r.vale_result && new Date(r.vale_deadline) < now,
        ).length,
      },
    ];

    return {
      byResult,
      evolution,
      approvalByModule,
      rejReasons,
      byArea,
      byPriority,
      responseTime,
      firstVsCorr,
      byUser,
      deadlineBuckets,
    };
  }, [filtered, kpis]);

  // ── alertas
  const alerts = useMemo(() => {
    const list: { level: "danger" | "warn" | "info"; text: string; count: number }[] = [];
    const push = (level: "danger" | "warn" | "info", text: string, count: number) =>
      count > 0 && list.push({ level, text, count });
    push("danger", "Eventos analisados aguardando envio", kpis.pending_send);
    push("danger", "Enviados sem protocolo", kpis.no_protocol);
    push("warn", "Pendências vencidas", kpis.overdue);
    push(
      "warn",
      "Reprovados sem tratativa registrada",
      filtered.filter((r) => r.vale_result === "rejected" && r.vale_status === "rejected").length,
    );
    push(
      "info",
      "Aprovados aguardando execução",
      filtered.filter((r) => r.vale_result === "approved_pending_exec").length,
    );
    return list;
  }, [kpis, filtered]);

  // ── ações
  const runInsights = useMutation({
    mutationFn: async () => {
      const rejMap: Record<string, number> = {};
      chartData.rejReasons.forEach((r) => {
        rejMap[r.name] = r.value;
      });
      const modMap: Record<string, number> = {};
      chartData.approvalByModule.forEach((r) => {
        modMap[r.name] = r.taxa;
      });
      const areaMap: Record<string, number> = {};
      filtered
        .filter((r) => !r.vale_result)
        .forEach((r) => {
          if (!r.area) return;
          areaMap[r.area] = (areaMap[r.area] ?? 0) + 1;
        });
      const fn = generateValeInsights;
      const res = await fn({
        data: {
          period_from: filters.from || null,
          period_to: filters.to || null,
          stats: {
            total: kpis.total,
            sent: kpis.sent,
            pending_result: kpis.pending_result,
            approved: kpis.approved,
            rejected: kpis.rejected,
            returned: kpis.returned,
            reject_by_category: rejMap,
            approval_by_module: modMap,
            pendings_by_area: areaMap,
            avg_response_days: kpis.avg_response || null,
            reincidences: kpis.recurrences,
          },
          filters_applied: JSON.stringify(filters),
        },
      });
      return (res as { text: string }).text;
    },
    onSuccess: (t) => setInsight(t),
    onError: (e: Error) => toast.error(e.message),
  });

  const exportExcel = useCallback(() => {
    const rows = filtered.map((r) => ({
      "Código interno": r.internal_code,
      "Protocolo Vale": r.vale_protocol,
      "Código Vale": r.vale_code,
      Módulo: r.module,
      Área: r.area,
      Local: r.location,
      Equipamento: r.equipment,
      Título: r.title,
      Descrição: r.description,
      Criticidade: r.priority,
      Status: STATUS_LABELS[r.vale_status ?? "draft"] ?? r.vale_status,
      Resultado: RESULT_LABELS[r.vale_result ?? ""] ?? "",
      "Motivo reprovação": r.vale_reject_category,
      Justificativa: r.vale_reject_reason ?? r.vale_result_note,
      "Data criação": r.created_at,
      "Data envio": r.sent_at,
      "Data retorno": r.vale_result_at,
      Prazo: r.vale_deadline,
      Versão: r.vale_version,
      Canal: r.sent_channel,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monitoramento Vale");
    XLSX.writeFile(wb, `monitoramento-vale-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [filtered]);

  const exportCsv = useCallback(() => {
    const rows = filtered.map((r) =>
      [
        r.internal_code ?? "",
        r.vale_protocol ?? "",
        r.module,
        r.area ?? "",
        r.title ?? "",
        STATUS_LABELS[r.vale_status ?? "draft"] ?? "",
        RESULT_LABELS[r.vale_result ?? ""] ?? "",
        r.vale_reject_category ?? "",
        r.created_at,
        r.sent_at ?? "",
        r.vale_result_at ?? "",
        r.vale_version ?? 1,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const header =
      "Código,Protocolo,Módulo,Área,Título,Status,Resultado,Motivo,Criado,Enviado,Retorno,Versão";
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoramento-vale-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const exportPdf = useCallback(() => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, W, 25, "F");
    doc.setTextColor(57, 255, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RELATÓRIO EXECUTIVO — MONITORAMENTO VALE", 10, 15);
    doc.setFontSize(9);
    doc.setTextColor(200);
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 10, 21);
    y = 32;
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Filtros aplicados:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Período: ${filters.from || "—"} a ${filters.to || "—"}  |  Módulo: ${filters.module}  |  Status: ${filters.status}  |  Resultado: ${filters.result}  |  Área: ${filters.area || "—"}`,
      10,
      y,
      { maxWidth: W - 20 },
    );
    y += 8;

    const kpiRows: Array<[string, string]> = [
      ["Total de eventos", String(kpis.total)],
      ["Pendente de envio", String(kpis.pending_send)],
      ["Enviados", String(kpis.sent)],
      ["Pendente de resultado", String(kpis.pending_result)],
      ["Aprovados", String(kpis.approved)],
      ["Reprovados", String(kpis.rejected)],
      ["Devolvidos", String(kpis.returned)],
      ["Reenviados", String(kpis.resent)],
      ["Encerrados", String(kpis.closed)],
      ["Críticos", String(kpis.critical)],
      ["Vencidos", String(kpis.overdue)],
      ["Sem protocolo", String(kpis.no_protocol)],
      ["Taxa de aprovação", `${kpis.approval_rate}%`],
      ["Taxa de reprovação", `${kpis.rejection_rate}%`],
      ["Tempo médio de resposta", `${kpis.avg_response} dias`],
      ["Reincidências", String(kpis.recurrences)],
    ];
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Indicadores", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    kpiRows.forEach(([k, v], i) => {
      const col = i % 2;
      const line = Math.floor(i / 2);
      const x = 10 + col * ((W - 20) / 2);
      const yy = y + line * 6;
      doc.text(`${k}:`, x, yy);
      doc.setFont("helvetica", "bold");
      doc.text(v, x + 55, yy);
      doc.setFont("helvetica", "normal");
    });
    y += Math.ceil(kpiRows.length / 2) * 6 + 5;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Motivos de reprovação", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (chartData.rejReasons.length === 0) {
      doc.text("Nenhuma reprovação no período.", 10, y);
      y += 6;
    } else
      chartData.rejReasons.forEach((r) => {
        doc.text(`• ${r.name}: ${r.value}`, 12, y);
        y += 5;
      });
    y += 3;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Tabela detalhada (primeiros 30 registros filtrados)", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    filtered.slice(0, 30).forEach((r) => {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      const line = `${r.internal_code ?? "—"} | ${r.module.toUpperCase()} | ${(r.title ?? "").slice(0, 40)} | ${STATUS_LABELS[r.vale_status ?? "draft"]} | ${RESULT_LABELS[r.vale_result ?? ""] ?? "—"}`;
      doc.text(line, 10, y, { maxWidth: W - 20 });
      y += 5;
    });

    if (insight) {
      doc.addPage();
      y = 15;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Análise da IA", 10, y);
      y += 7;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(insight, W - 20);
      lines.forEach((l: string) => {
        if (y > 285) {
          doc.addPage();
          y = 15;
        }
        doc.text(l, 10, y);
        y += 5;
      });
    }

    doc.save(`relatorio-monitoramento-vale-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [filters, kpis, chartData, filtered, insight]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["monitoring-vale"] });

  // ─────────────────────────── render
  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-widest text-neon">
            MONITORAMENTO VALE
          </h1>
          <p className="text-xs text-muted-foreground">
            Controle de eventos enviados, resultados, aprovações, reprovações e tratativas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((s) => !s)}
            className="gap-1"
          >
            <Filter className="h-3 w-3" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runInsights.mutate()}
            disabled={runInsights.isPending}
            className="gap-1"
          >
            <Sparkles className="h-3 w-3" /> {runInsights.isPending ? "Analisando…" : "Insights IA"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
            <Download className="h-3 w-3" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1">
            <Download className="h-3 w-3" /> Excel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={exportPdf}
            className="gap-1 bg-neon text-black hover:bg-neon/80"
          >
            <FileText className="h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {alerts.map((a) => (
            <div
              key={a.text}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                a.level === "danger"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : a.level === "warn"
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                    : "border-blue-500/40 bg-blue-500/10 text-blue-300"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="flex-1">{a.text}</span>
              <span className="font-bold">{a.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      {showFilters && (
        <div className="rounded-xl border border-border/60 bg-black/30 p-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <FiltroField label="De">
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
            </FiltroField>
            <FiltroField label="Até">
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </FiltroField>
            <FiltroField label="Módulo">
              <Select
                value={filters.module}
                onValueChange={(v) => setFilters({ ...filters, module: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="n3">N3</SelectItem>
                  <SelectItem value="crm">CRM</SelectItem>
                  <SelectItem value="inspecao">Inspeção</SelectItem>
                  <SelectItem value="kaizen">Kaizen</SelectItem>
                  <SelectItem value="environment">Meio Ambiente</SelectItem>
                  <SelectItem value="emergency">Emergência</SelectItem>
                  <SelectItem value="gain">Ganho</SelectItem>
                  <SelectItem value="supervision">Supervisão</SelectItem>
                </SelectContent>
              </Select>
            </FiltroField>
            <FiltroField label="Status">
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters({ ...filters, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FiltroField>
            <FiltroField label="Resultado Vale">
              <Select
                value={filters.result}
                onValueChange={(v) => setFilters({ ...filters, result: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(RESULT_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FiltroField>
            <FiltroField label="Motivo reprovação">
              <Select
                value={filters.reject}
                onValueChange={(v) => setFilters({ ...filters, reject: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {REJECT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FiltroField>
            <FiltroField label="Área">
              <Input
                value={filters.area}
                onChange={(e) => setFilters({ ...filters, area: e.target.value })}
              />
            </FiltroField>
            <FiltroField label="Criticidade">
              <Select
                value={filters.priority}
                onValueChange={(v) => setFilters({ ...filters, priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </FiltroField>
            <FiltroField label="Buscar">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="código, protocolo, equipamento…"
                  value={filters.q}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                />
              </div>
            </FiltroField>
            <div className="flex items-end gap-3 text-xs text-muted-foreground">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={filters.onlyOverdue}
                  onChange={(e) => setFilters({ ...filters, onlyOverdue: e.target.checked })}
                />{" "}
                Só vencidos
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={filters.onlyNoProtocol}
                  onChange={(e) => setFilters({ ...filters, onlyNoProtocol: e.target.checked })}
                />{" "}
                Sem protocolo
              </label>
            </div>
            <div className="flex items-end justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(emptyFilters)}
                className="gap-1"
              >
                <X className="h-3 w-3" /> Limpar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        <KPI label="Total" value={kpis.total} icon={FileCheck2} />
        <KPI label="Pend. envio" value={kpis.pending_send} icon={Clock} tone="text-yellow-300" />
        <KPI label="Enviados" value={kpis.sent} icon={Send} tone="text-neon" />
        <KPI
          label="Pend. resultado"
          value={kpis.pending_result}
          icon={Clock}
          tone="text-blue-300"
        />
        <KPI label="Aprovados" value={kpis.approved} icon={CheckCircle2} tone="text-emerald-300" />
        <KPI label="Reprovados" value={kpis.rejected} icon={XCircle} tone="text-red-300" />
        <KPI label="Devolvidos" value={kpis.returned} icon={RotateCcw} tone="text-orange-300" />
        <KPI label="Reenviados" value={kpis.resent} icon={GitBranch} tone="text-purple-300" />
        <KPI label="Encerrados" value={kpis.closed} icon={CheckCircle2} />
        <KPI label="Críticos" value={kpis.critical} icon={AlertTriangle} tone="text-red-300" />
        <KPI label="Vencidos" value={kpis.overdue} icon={Timer} tone="text-red-300" />
        <KPI
          label="Sem protocolo"
          value={kpis.no_protocol}
          icon={AlertTriangle}
          tone="text-orange-300"
        />
        <KPI
          label="Taxa aprov."
          value={`${kpis.approval_rate}%`}
          icon={TrendingUp}
          tone="text-emerald-300"
        />
        <KPI
          label="Taxa reprov."
          value={`${kpis.rejection_rate}%`}
          icon={TrendingUp}
          tone="text-red-300"
        />
        <KPI label="Tempo médio" value={`${kpis.avg_response}d`} icon={Timer} />
        <KPI
          label="Reincidências"
          value={kpis.recurrences}
          icon={HistoryIcon}
          tone="text-orange-300"
        />
      </div>

      {/* Insight card */}
      {insight && (
        <div className="rounded-xl border border-neon/40 bg-neon/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neon" />
            <span className="font-display text-xs uppercase tracking-widest text-neon">
              Análise da IA
            </span>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
            {insight}
          </p>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Eventos por resultado">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData.byResult} dataKey="value" nameKey="name" outerRadius={80} label>
                {chartData.byResult.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução mensal">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.evolution}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="enviados" stroke={NEON} strokeWidth={2} />
              <Line type="monotone" dataKey="aprovados" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="reprovados" stroke="#ef4444" strokeWidth={2} />
              <Line type="monotone" dataKey="reenviados" stroke="#a855f7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taxa de aprovação por módulo (%)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.approvalByModule} layout="vertical">
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#666" style={{ fontSize: 10 }} domain={[0, 100]} />
              <YAxis dataKey="name" type="category" stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar dataKey="taxa" fill={NEON} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Motivos de reprovação">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.rejReasons}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                stroke="#666"
                style={{ fontSize: 9 }}
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar
                dataKey="value"
                fill="#ef4444"
                onClick={(d: { name?: string }) =>
                  d?.name && setFilters((f) => ({ ...f, reject: d.name!, result: "rejected" }))
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Eventos por área (top 10)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.byArea} layout="vertical">
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#666"
                style={{ fontSize: 10 }}
                width={120}
              />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar
                dataKey="value"
                fill={NEON}
                onClick={(d: { name?: string }) =>
                  d?.name && setFilters((f) => ({ ...f, area: d.name! }))
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Eventos por criticidade">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.byPriority}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar dataKey="value" fill="#eab308" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tempo médio de resposta Vale (dias)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.responseTime}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Line type="monotone" dataKey="dias" stroke={NEON} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aprovação: 1ª submissão × após correção">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.firstVsCorr}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar dataKey="aprovados" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pendências por prazo">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.deadlineBuckets}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis stroke="#666" style={{ fontSize: 10 }} />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar dataKey="value">
                {chartData.deadlineBuckets.map((_, i) => (
                  <Cell key={i} fill={["#10b981", "#eab308", "#ef4444"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Registros por responsável (top 10)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.byUser} layout="vertical">
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#666" style={{ fontSize: 10 }} />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#666"
                style={{ fontSize: 9 }}
                width={100}
                tickFormatter={(v) => String(v).slice(0, 8)}
              />
              <RTooltip contentStyle={{ background: "#000", border: "1px solid #333" }} />
              <Bar dataKey="value" fill={CHART_COLORS[5]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-black/20">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="border-b border-border/60 bg-black/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="p-2">Código</th>
              <th className="p-2">Protocolo Vale</th>
              <th className="p-2">Data</th>
              <th className="p-2">Módulo</th>
              <th className="p-2">Área</th>
              <th className="p-2">Descrição</th>
              <th className="p-2">Criticidade</th>
              <th className="p-2">Status</th>
              <th className="p-2">Resultado</th>
              <th className="p-2">Prazo</th>
              <th className="p-2">Aguard.</th>
              <th className="p-2">Ver.</th>
              <th className="p-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={13} className="p-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="p-6 text-center text-muted-foreground">
                  Nenhum registro para os filtros aplicados.
                </td>
              </tr>
            )}
            {filtered.slice(0, 200).map((r) => {
              const waitDays =
                r.sent_at && !r.vale_result_at
                  ? Math.round(daysBetween(r.sent_at, new Date().toISOString()))
                  : null;
              const overdue =
                r.vale_deadline && !r.vale_result && new Date(r.vale_deadline) < new Date();
              return (
                <tr key={r.id} className="border-b border-border/40 hover:bg-black/30">
                  <td className="p-2 font-mono text-[10px]">{r.internal_code ?? "—"}</td>
                  <td className="p-2 font-mono text-[10px]">{r.vale_protocol ?? "—"}</td>
                  <td className="p-2 text-[10px]">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-2 text-[10px] uppercase text-neon">{r.module}</td>
                  <td className="p-2 text-[11px]">{r.area ?? "—"}</td>
                  <td className="p-2 max-w-[240px] truncate">{r.title ?? "—"}</td>
                  <td className="p-2 text-[10px]">{r.priority ?? "—"}</td>
                  <td className="p-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest ${STATUS_TONE[r.vale_status ?? "draft"] ?? ""}`}
                    >
                      {STATUS_LABELS[r.vale_status ?? "draft"]}
                    </span>
                  </td>
                  <td className="p-2 text-[10px]">{RESULT_LABELS[r.vale_result ?? ""] ?? "—"}</td>
                  <td className={`p-2 text-[10px] ${overdue ? "text-red-300 font-bold" : ""}`}>
                    {r.vale_deadline ?? "—"}
                  </td>
                  <td className="p-2 text-[10px]">{waitDays !== null ? `${waitDays}d` : "—"}</td>
                  <td className="p-2 text-[10px] text-center">
                    {(r.vale_version ?? 1) > 1 ? (
                      <button onClick={() => setVersionsTarget(r)} className="text-neon underline">
                        v{r.vale_version}
                      </button>
                    ) : (
                      "v1"
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setDetailTarget(r)}
                      >
                        Abrir
                      </Button>
                      {!r.sent_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setSendTarget(r)}
                        >
                          <Send className="mr-1 h-3 w-3" /> Enviar
                        </Button>
                      )}
                      {r.sent_at && !r.vale_result && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setResultTarget(r)}
                        >
                          Resultado
                        </Button>
                      )}
                      {r.vale_result === "rejected" ||
                      r.vale_result === "returned" ||
                      r.vale_result === "awaiting_complement" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setRevisionTarget(r)}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" /> Corrigir
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setHistoryTarget(r)}
                      >
                        <HistoryIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sendTarget && (
        <SendDialog
          record={sendTarget}
          onClose={() => setSendTarget(null)}
          onSaved={() => {
            setSendTarget(null);
            invalidate();
          }}
        />
      )}
      {resultTarget && (
        <ResultDialog
          record={resultTarget}
          onClose={() => setResultTarget(null)}
          onSaved={() => {
            setResultTarget(null);
            invalidate();
          }}
        />
      )}
      {revisionTarget && (
        <RevisionDialog
          record={revisionTarget}
          onClose={() => setRevisionTarget(null)}
          onSaved={() => {
            setRevisionTarget(null);
            invalidate();
          }}
        />
      )}
      {versionsTarget && (
        <VersionsDialog record={versionsTarget} onClose={() => setVersionsTarget(null)} />
      )}
      {detailTarget && (
        <DetailDrawer
          record={detailTarget}
          onClose={() => setDetailTarget(null)}
          onSend={() => {
            setSendTarget(detailTarget);
            setDetailTarget(null);
          }}
          onResult={() => {
            setResultTarget(detailTarget);
            setDetailTarget(null);
          }}
          onHistory={() => {
            setHistoryTarget(detailTarget);
            setDetailTarget(null);
          }}
          onVersions={() => {
            setVersionsTarget(detailTarget);
            setDetailTarget(null);
          }}
        />
      )}
      {historyTarget && (
        <HistoryDialog record={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  );
}

// ─────────────────────────── componentes auxiliares
function FiltroField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-black/30 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={`h-3.5 w-3.5 opacity-70 ${tone ?? ""}`} />
      </div>
      <div className={`mt-1 font-display text-xl font-bold ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-neon" />
        <h3 className="font-display text-[11px] uppercase tracking-widest text-foreground/90">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────── SendDialog (mantido)
function SendDialog({
  record,
  onClose,
  onSaved,
}: {
  record: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useServerFn(confirmValeSend);
  const [protocol, setProtocol] = useState(record.vale_protocol ?? "");
  const [valeCode, setValeCode] = useState(record.vale_code ?? "");
  const [channel, setChannel] = useState(record.sent_channel ?? "Sistema interno Vale");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [override, setOverride] = useState(false);
  const [justification, setJustification] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      let proofUrl: string | null = null;
      if (proof) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const ext = proof.name.split(".").pop() ?? "bin";
        const path = `records/${user?.id}/proof-${record.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage
          .from("inspections")
          .upload(path, proof, { contentType: proof.type });
        if (up.error) throw up.error;
        const { data: s } = await supabase.storage
          .from("inspections")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        proofUrl = s?.signedUrl ?? null;
      }
      await confirm({
        data: {
          record_id: record.id,
          vale_protocol: protocol.trim(),
          vale_code: valeCode.trim() || null,
          sent_at: new Date().toISOString(),
          sent_channel: channel,
          send_proof_url: proofUrl,
          send_note: note || null,
          override_duplicate: override,
          duplicate_justification: override ? justification : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Envio confirmado. Registro pendente de resultado Vale.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Confirmar envio para a Vale
          </DialogTitle>
          <DialogDescription>
            Código interno{" "}
            <span className="font-mono text-neon">{record.internal_code ?? "—"}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1">
            <Label>Protocolo Vale *</Label>
            <Input
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              placeholder="ex.: VALE-N3-987654"
            />
          </div>
          <div className="grid gap-1">
            <Label>Código Vale (opcional)</Label>
            <Input value={valeCode} onChange={(e) => setValeCode(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Canal utilizado</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Comprovante / captura de tela</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setProof(e.target.files?.[0] ?? null)}
            />
          </div>
          <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            <span>Confirmar mesmo com possível protocolo duplicado (exige justificativa).</span>
          </label>
          {override && (
            <Textarea
              rows={2}
              placeholder="Justificativa obrigatória"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="bg-neon text-black hover:bg-neon/80"
              disabled={!protocol.trim() || send.isPending || (override && !justification.trim())}
              onClick={() => send.mutate()}
            >
              {send.isPending ? "Enviando…" : "Confirmar envio"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── ResultDialog
function ResultDialog({
  record,
  onClose,
  onSaved,
}: {
  record: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const register = useServerFn(registerValeResult);
  const [result, setResult] = useState<string>("approved");
  const [approvalKind, setApprovalKind] = useState<"pending_exec" | "done">("pending_exec");
  const [resultAt, setResultAt] = useState(new Date().toISOString().slice(0, 10));
  const [protocol, setProtocol] = useState(record.vale_protocol ?? "");
  const [note, setNote] = useState("");
  const [rejectCat, setRejectCat] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");
  const [deadline, setDeadline] = useState<string>("");
  const [proof, setProof] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      let proofUrl: string | null = null;
      if (proof) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const ext = proof.name.split(".").pop() ?? "bin";
        const path = `records/${user?.id}/result-${record.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage
          .from("inspections")
          .upload(path, proof, { contentType: proof.type });
        if (up.error) throw up.error;
        const { data: s } = await supabase.storage
          .from("inspections")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        proofUrl = s?.signedUrl ?? null;
      }
      const finalResult =
        result === "approved"
          ? approvalKind === "done"
            ? "approved_done"
            : "approved_pending_exec"
          : result;
      await register({
        data: {
          record_id: record.id,
          result: finalResult as never,
          result_at: new Date(resultAt).toISOString(),
          protocol: protocol.trim() || null,
          note: note || null,
          reject_category: result === "rejected" ? rejectCat : null,
          reject_reason: result === "rejected" ? rejectReason : null,
          proof_url: proofUrl,
          deadline: deadline || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Resultado Vale registrado.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isReject = result === "rejected";
  const canSave = !mut.isPending && (!isReject || (rejectCat && rejectReason.trim()));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Registrar resultado Vale
          </DialogTitle>
          <DialogDescription>
            Código <span className="font-mono text-neon">{record.internal_code ?? "—"}</span> ·
            Protocolo <span className="font-mono text-neon">{record.vale_protocol ?? "—"}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1">
            <Label>Resultado *</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Reprovado</SelectItem>
                <SelectItem value="returned">Devolvido para correção</SelectItem>
                <SelectItem value="awaiting_complement">Aguardando complemento</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {result === "approved" && (
            <div className="grid gap-1">
              <Label>Situação da aprovação</Label>
              <Select
                value={approvalKind}
                onValueChange={(v) => setApprovalKind(v as "pending_exec" | "done")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_exec">Aprovado – aguardando execução</SelectItem>
                  <SelectItem value="done">Aprovado e concluído</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Não encerramos automaticamente na aprovação. Anexe evidência real para concluir.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Data do retorno *</Label>
              <Input type="date" value={resultAt} onChange={(e) => setResultAt(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Protocolo Vale</Label>
              <Input value={protocol} onChange={(e) => setProtocol(e.target.value)} />
            </div>
          </div>
          {isReject && (
            <>
              <div className="grid gap-1">
                <Label>Categoria do motivo *</Label>
                <Select value={rejectCat} onValueChange={setRejectCat}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Descrição / justificativa *</Label>
                <Textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Novo prazo para correção</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </>
          )}
          <div className="grid gap-1">
            <Label>Observação / parecer Vale</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Evidência do retorno (documento / captura)</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setProof(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="bg-neon text-black hover:bg-neon/80"
              disabled={!canSave}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Salvando…" : "Registrar resultado"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── RevisionDialog
function RevisionDialog({
  record,
  onClose,
  onSaved,
}: {
  record: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const revise = useServerFn(createValeRevision);
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: () => revise({ data: { record_id: record.id, changes_note: note.trim() } }),
    onSuccess: (d: { version: number }) => {
      toast.success(`Nova versão v${d.version} criada. Corrija e reenvie.`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Corrigir e criar nova versão
          </DialogTitle>
          <DialogDescription>
            A versão anterior será preservada no histórico. Este registro voltará para "Pendente de
            envio".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <Label>Alterações realizadas *</Label>
          <Textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Descreva o que foi corrigido…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-neon text-black hover:bg-neon/80"
            disabled={note.trim().length < 3 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Criando…" : "Criar nova versão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── VersionsDialog
function VersionsDialog({ record, onClose }: { record: RecordRow; onClose: () => void }) {
  const load = useServerFn(listValeVersions);
  const { data } = useQuery({
    queryKey: ["versions", record.vale_root_id ?? record.id],
    queryFn: () => load({ data: { root_id: record.vale_root_id ?? record.id } }),
  });
  type V = {
    id: string;
    version: number;
    sent_at: string | null;
    channel: string | null;
    protocol: string | null;
    result: string | null;
    result_at: string | null;
    result_note: string | null;
    reject_category: string | null;
    reject_reason: string | null;
    changes_note: string | null;
    snapshot: { photo_url?: string; title?: string; description?: string } | null;
  };
  const versions = (data?.versions ?? []) as V[];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Versões do registro
          </DialogTitle>
          <DialogDescription>{record.internal_code ?? record.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {versions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sem versões anteriores. Este é o primeiro envio.
            </p>
          )}
          {versions.map((v) => (
            <div key={v.id} className="rounded-lg border border-border/60 bg-black/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-display text-xs uppercase tracking-widest text-neon">
                  Versão {v.version}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {v.sent_at ? new Date(v.sent_at).toLocaleString("pt-BR") : "não enviada"} ·{" "}
                  {v.channel ?? "—"}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-[120px_1fr]">
                {v.snapshot?.photo_url && (
                  <img
                    src={v.snapshot.photo_url}
                    alt=""
                    className="h-24 w-24 rounded border border-border object-cover"
                  />
                )}
                <div className="space-y-1 text-[11px]">
                  <p>
                    <span className="text-muted-foreground">Protocolo:</span>{" "}
                    <span className="font-mono">{v.protocol ?? "—"}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Resultado:</span>{" "}
                    {RESULT_LABELS[v.result ?? ""] ?? "—"}
                  </p>
                  {v.reject_category && (
                    <p>
                      <span className="text-muted-foreground">Motivo:</span> {v.reject_category} —{" "}
                      {v.reject_reason}
                    </p>
                  )}
                  {v.result_note && (
                    <p>
                      <span className="text-muted-foreground">Parecer:</span> {v.result_note}
                    </p>
                  )}
                  {v.changes_note && (
                    <p>
                      <span className="text-muted-foreground">Alterações desta versão:</span>{" "}
                      {v.changes_note}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-neon/40 bg-neon/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-display text-xs uppercase tracking-widest text-neon">
                Versão atual v{record.vale_version ?? 1}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {STATUS_LABELS[record.vale_status ?? "draft"]}
              </span>
            </div>
            <p className="text-[11px]">
              <span className="text-muted-foreground">Resultado:</span>{" "}
              {RESULT_LABELS[record.vale_result ?? ""] ?? "aguardando"}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── DetailDrawer (mostra tudo)
function DetailDrawer({
  record,
  onClose,
  onSend,
  onResult,
  onHistory,
  onVersions,
}: {
  record: RecordRow;
  onClose: () => void;
  onSend: () => void;
  onResult: () => void;
  onHistory: () => void;
  onVersions: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Detalhamento do evento
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-neon">{record.internal_code}</span> · v
            {record.vale_version ?? 1}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          {record.photo_url ? (
            <img
              src={record.photo_url}
              alt=""
              className="h-40 w-40 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="h-40 w-40 rounded-lg border border-border/40 bg-muted/20" />
          )}
          <div className="space-y-1 text-xs">
            <Field label="Título">{record.title ?? "—"}</Field>
            <Field label="Descrição">{record.description ?? "—"}</Field>
            <Field label="Módulo">{record.module}</Field>
            <Field label="Área / Local / Equipamento">
              {[record.area, record.location, record.equipment].filter(Boolean).join(" · ")}
            </Field>
            <Field label="Criticidade">{record.priority ?? "—"}</Field>
            <Field label="Criado em">{new Date(record.created_at).toLocaleString("pt-BR")}</Field>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 text-xs">
          <Field label="Status">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_TONE[record.vale_status ?? "draft"] ?? ""}`}
            >
              {STATUS_LABELS[record.vale_status ?? "draft"]}
            </span>
          </Field>
          <Field label="Resultado Vale">{RESULT_LABELS[record.vale_result ?? ""] ?? "—"}</Field>
          <Field label="Protocolo Vale">{record.vale_protocol ?? "—"}</Field>
          <Field label="Código Vale">{record.vale_code ?? "—"}</Field>
          <Field label="Data envio">
            {record.sent_at ? new Date(record.sent_at).toLocaleString("pt-BR") : "—"}
          </Field>
          <Field label="Canal">{record.sent_channel ?? "—"}</Field>
          <Field label="Data retorno">
            {record.vale_result_at ? new Date(record.vale_result_at).toLocaleString("pt-BR") : "—"}
          </Field>
          <Field label="Prazo">{record.vale_deadline ?? "—"}</Field>
        </div>
        {record.vale_reject_category && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">
            <p className="font-bold text-red-300">
              Motivo da reprovação: {record.vale_reject_category}
            </p>
            <p className="mt-1">{record.vale_reject_reason}</p>
          </div>
        )}
        {record.vale_result_note && (
          <div className="rounded-lg border border-border/60 bg-black/30 p-2 text-xs">
            <p className="text-muted-foreground">Parecer Vale:</p>
            <p>{record.vale_result_note}</p>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          {!record.sent_at && (
            <Button size="sm" onClick={onSend} className="bg-neon text-black hover:bg-neon/80">
              Confirmar envio
            </Button>
          )}
          {record.sent_at && !record.vale_result && (
            <Button size="sm" onClick={onResult}>
              Registrar resultado
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onVersions}>
            Ver versões
          </Button>
          <Button size="sm" variant="outline" onClick={onHistory}>
            Histórico
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

// ─────────────────────────── HistoryDialog (mantido)
function HistoryDialog({ record, onClose }: { record: RecordRow; onClose: () => void }) {
  const load = useServerFn(listHistory);
  const { data } = useQuery({
    queryKey: ["history", record.id],
    queryFn: () => load({ data: { record_id: record.id } }),
  });
  type Entry = {
    id: string;
    action: string;
    from_status: string | null;
    to_status: string | null;
    justification: string | null;
    proof_url: string | null;
    created_at: string;
  };
  const entries = (data?.history ?? []) as Entry[];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-neon">
            Histórico do registro
          </DialogTitle>
          <DialogDescription>{record.internal_code ?? record.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {entries.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos.</p>}
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg border border-border/60 bg-black/30 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-display text-[10px] uppercase tracking-widest text-neon">
                  {e.action}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {(e.from_status || e.to_status) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {e.from_status ?? "—"} →{" "}
                  <span className="text-foreground">{e.to_status ?? "—"}</span>
                </p>
              )}
              {e.justification && <p className="mt-1 text-[11px]">{e.justification}</p>}
              {e.proof_url && (
                <a
                  href={e.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] text-neon underline"
                >
                  Ver comprovante
                </a>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
