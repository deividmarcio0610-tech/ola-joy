import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  X,
  Share2,
  Mail,
  FileDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { findSimilar, createRecordWithCode } from "@/lib/records.functions";
import { sha256OfFile, dHashOfFile } from "@/lib/image-hash";
import { CompareSlider } from "@/components/compare-slider";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { validateFile } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import type { ModuleKey } from "@/components/record-module";
import {
  analisarComIris,
  chamarIrisChat,
  gerarSimulacaoComIris,
  toPhotoDialogResult,
} from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";
import { deriveNrCorrections } from "@/lib/nr-corrections";
import { ReportActions } from "@/components/report/ReportActions";
import { buildFromIrisResult } from "@/lib/reports/build-from-analysis";
import { N3KaizenFlow } from "@/components/record/N3KaizenFlow";
import { Inspecao5SFlow } from "@/components/record/Inspecao5SFlow";
import type { N3Result, N3Risk, KaizenResult } from "@/lib/n3-kaizen";

const priorityOptions = [
  { v: "baixa", l: "Baixa" },
  { v: "media", l: "Média" },
  { v: "alta", l: "Alta" },
  { v: "critica", l: "Crítica" },
];

async function getFreshAuthenticatedUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) throw new Error("Sessão expirada. Faça login novamente.");

  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now < 60) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    session = refreshed.data.session;
  }

  const { data: userData, error } = await supabase.auth.getUser(session.access_token);
  if (error || !userData.user) throw new Error("Sessão inválida. Faça login novamente.");
  return userData.user.id;
}

type IrisResult = {
  category: "n3" | "crm" | "kaizen" | "environment" | "emergency" | "gain" | "inspecao";
  confidence: "alta" | "media" | "baixa";
  title: string;
  description: string;
  area: string;
  location: string;
  equipment: string;
  risk: string;
  exposed_people: string;
  consequence: string;
  criticality: "baixa" | "media" | "alta" | "critica";
  priority: "baixa" | "media" | "alta" | "critica";
  immediate_action: string;
  final_action: string;
  suggested_responsible: string;
  suggested_deadline: string;
  closing_evidence: string;
  report_text: string;
  // Parecer técnico aprofundado (engenheiro de segurança / inspetor N3)
  norms_violated?: string;
  root_cause?: string;
  consequences_list?: string[];
  probability?: number;
  severity?: number;
  risk_score?: number;
  risk_class?: "baixo" | "medio" | "alto" | "critico";
  risk_class_reason?: string;
  preventive_action?: string;
  resources?: string;
  execution_time?: string;
  expected_gain?: string;
  technical_opinion?: string;
  // Hierarquia de controles de risco
  control_hierarchy?: {
    level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    label:
      | "eliminacao"
      | "substituicao"
      | "protecao_coletiva"
      | "barreira_fisica"
      | "automacao_isolamento"
      | "controle_administrativo"
      | "epi";
    chosen_solution: string;
    justification: string;
    alternatives_considered?: string[];
    why_not_lower_levels?: string;
  };
  // Preenchido após geração do "Depois"
  changes_applied?: string[];
  improvement?: {
    risk_reduction?: number;
    organization?: number;
    compliance?: number;
    operational_safety?: number;
  };
};

interface Props {
  moduleKey: ModuleKey;
  defaultModule?: ModuleKey;
  allowCategoryOverride?: boolean;
  triggerLabel: string;
  showFinancial?: boolean;
}

export function PhotoRecordDialog({
  moduleKey,
  defaultModule,
  allowCategoryOverride = false,
  triggerLabel,
  showFinancial = false,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2 sm:w-auto" size="lg">
          <Plus className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      {open && (
        <PhotoRecordContent
          moduleKey={moduleKey}
          defaultModule={defaultModule ?? moduleKey}
          allowCategoryOverride={allowCategoryOverride}
          showFinancial={showFinancial}
          onClose={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}

function PhotoRecordContent({
  moduleKey,
  defaultModule,
  allowCategoryOverride,
  showFinancial,
  onClose,
}: {
  moduleKey: ModuleKey;
  defaultModule: ModuleKey;
  allowCategoryOverride: boolean;
  showFinancial: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<IrisResult | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>([]);
  const [n3Result, setN3Result] = useState<N3Result | null>(null);
  const [n3SelectedRisk, setN3SelectedRisk] = useState<N3Risk | null>(null);
  const [kaizenResult, setKaizenResult] = useState<KaizenResult | null>(null);
  const [chosenModule, setChosenModule] = useState<ModuleKey>(defaultModule);
  const [priority, setPriority] = useState("media");
  const [financialValue, setFinancialValue] = useState("");
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [simulationVersion, setSimulationVersion] = useState(0);
  const [simulationPrompt, setSimulationPrompt] = useState<string | null>(null);
  const [generatingAfter, setGeneratingAfter] = useState(false);
  const [afterPlan, setAfterPlan] = useState<string | null>(null);
  const [correctionPhoto, setCorrectionPhoto] = useState<{ file: File; preview: string } | null>(
    null,
  );
  const [compareMode, setCompareMode] = useState<"grid" | "slider">("grid");
  type CompareResult = {
    conformidade: number;
    itens_corrigidos: string[];
    itens_pendentes: string[];
    itens_nao_identificados: string[];
    observacoes: string;
  };
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualResultado, setManualResultado] = useState<string>("concluida");
  const [manualObs, setManualObs] = useState("");
  const [manualResp, setManualResp] = useState("");
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [imagePhash, setImagePhash] = useState<string | null>(null);
  type SimilarRecord = {
    id: string;
    internal_code: string | null;
    vale_protocol: string | null;
    vale_status: string | null;
    title: string | null;
    description: string | null;
    area: string | null;
    location: string | null;
    equipment: string | null;
    photo_url: string | null;
    similarity: number;
    module: string;
    created_at: string;
  };
  const [similar, setSimilar] = useState<SimilarRecord[]>([]);
  const [showDupDialog, setShowDupDialog] = useState(false);
  const [dupKind, setDupKind] = useState<"new" | "complement" | "recurrence">("new");
  const [dupParentId, setDupParentId] = useState<string | null>(null);
  const [dupJustification, setDupJustification] = useState("");
  const findSimilarFn = useServerFn(findSimilar);
  const createRecordFn = useServerFn(createRecordWithCode);

  type SafetyCorrection = {
    id: string;
    standard: string;
    description: string;
    selected: boolean;
    source: "iris" | "manual";
    createdAt: string;
    usedInGeneration?: boolean;
  };
  const NORM_SUGGESTIONS = [
    "NR-01",
    "NR-06",
    "NR-10",
    "NR-11",
    "NR-12",
    "NR-18",
    "NR-23",
    "NR-26",
    "NR-33",
    "NR-35",
    "5S",
    "NBR",
    "Procedimento interno",
    "Outra",
  ];

  const [corrections, setCorrections] = useState<SafetyCorrection[]>([]);
  const [newStandard, setNewStandard] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{
    pct: number;
    label: string;
  } | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function newCorrectionId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (!result) {
      setCorrections([]);
      return;
    }
    const d = deriveNrCorrections(result as unknown as Record<string, unknown>);
    setCorrections(
      d.correcoes.map((c) => ({
        id: newCorrectionId(),
        standard: c.codigo,
        description: c.texto,
        selected: true,
        source: "iris" as const,
        createdAt: new Date().toISOString(),
      })),
    );
  }, [result]);

  function onPick(list: FileList | null) {
    if (!list) return;
    const next = [...photos];
    for (const f of Array.from(list)) {
      const v = validateFile(f, "image");
      if (!v.ok) {
        toast.error(v.error);
        continue;
      }
      const preview = URL.createObjectURL(f);
      next.push({ file: f, preview });
    }
    setPhotos(next);
    setResult(null);
    setCompareResult(null);
    setSimilar([]);
    setImageHash(null);
    setImagePhash(null);
    setN3Result(null);
    setN3SelectedRisk(null);
    setKaizenResult(null);
    Promise.all(next.map((p) => toDataURL(p.file)))
      .then(setPhotoDataUrls)
      .catch(() => setPhotoDataUrls([]));
    // Fingerprint the first photo
    const first = next[0]?.file;
    if (first) {
      sha256OfFile(first)
        .then(setImageHash)
        .catch(() => {});
      dHashOfFile(first)
        .then(setImagePhash)
        .catch(() => {});
    }
  }

  function removePhoto(i: number) {
    const p = photos[i];
    if (p) URL.revokeObjectURL(p.preview);
    const remaining = photos.filter((_, idx) => idx !== i);
    setPhotos(remaining);
    setResult(null);
    setCompareResult(null);
    setSimilar([]);
    setImageHash(null);
    setImagePhash(null);
    setN3Result(null);
    setN3SelectedRisk(null);
    setKaizenResult(null);
    Promise.all(remaining.map((p) => toDataURL(p.file)))
      .then(setPhotoDataUrls)
      .catch(() => setPhotoDataUrls([]));
  }

  async function toDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function analyze() {
    if (photos.length === 0) {
      toast.error("Anexe pelo menos uma foto.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const dataUrls = await Promise.all(photos.map((p) => toDataURL(p.file)));
      const raw = await analisarComIris({
        images: dataUrls,
        context: "Análise de campo — VisionGuard AI. Considere hierarquia de controles de risco.",
      });
      const parsed = toPhotoDialogResult(raw) as unknown as IrisResult;
      setResult(parsed);
      setPriority(parsed.priority ?? "media");
      if (allowCategoryOverride && (parsed.category === "n3" || parsed.category === "crm")) {
        setChosenModule(parsed.category);
      }
      logAudit("ai_analysis", { module: moduleKey });

      // Validação de duplicidade removida — a própria IA analisa se a N3 é duplicada.
    } catch (e) {
      handleAiError(e, "Erro ao analisar");
    } finally {
      setAnalyzing(false);
    }
  }

  function compareCacheKey(beforeSha: string, afterSha: string) {
    return `valetech.compare.v1:${beforeSha}:${afterSha}`;
  }

  function confirmManual() {
    if (!correctionPhoto) {
      toast.error("Anexe a foto da correção real antes.");
      return;
    }
    if (!manualResp.trim()) {
      toast.error("Informe o responsável pela validação.");
      return;
    }
    const map: Record<string, { conf: number; label: string }> = {
      concluida: { conf: 100, label: "Correção concluída" },
      parcial: { conf: 60, label: "Correção parcial" },
      nao_concluida: { conf: 0, label: "Correção não concluída" },
      insuficiente: { conf: 20, label: "Evidência insuficiente" },
      risco_presente: { conf: 10, label: "Risco ainda presente" },
    };
    const m = map[manualResultado] ?? map.concluida;
    setCompareResult({
      conformidade: m.conf,
      itens_corrigidos: manualResultado === "concluida" ? ["Confirmação humana: " + m.label] : [],
      itens_pendentes:
        manualResultado === "parcial" || manualResultado === "risco_presente"
          ? [manualObs || m.label]
          : [],
      itens_nao_identificados: [],
      observacoes:
        `[Validação manual sem IA] ${m.label}. Responsável: ${manualResp}. ${manualObs}`.trim(),
    });
    logAudit("record_update", { module: moduleKey, targetId: "manual-confirm" });
    setManualOpen(false);
    toast.success("Correção confirmada manualmente (sem consumo de IA).");
  }

  async function compareRealPhotos() {
    if (!photos[0] || !correctionPhoto) {
      toast.error("Envie a foto Antes e a foto da correção real.");
      return;
    }
    setComparing(true);
    setCompareResult(null);
    try {
      // Cache local por hash — evita chamadas duplicadas de IA
      let beforeSha = imageHash;
      try {
        if (!beforeSha) beforeSha = await sha256OfFile(photos[0].file);
      } catch {
        /* ignore */
      }
      const afterSha = await sha256OfFile(correctionPhoto.file).catch(() => null);
      const cacheKey = beforeSha && afterSha ? compareCacheKey(beforeSha, afterSha) : null;
      if (cacheKey) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsedCache = JSON.parse(cached) as CompareResult;
            setCompareResult(parsedCache);
            toast.info(
              "Análise já realizada anteriormente. Resultado recuperado sem novo consumo.",
            );
            setComparing(false);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      const beforeUrl = await toDataURL(photos[0].file);
      const afterUrl = await toDataURL(correctionPhoto.file);
      const ctx = result
        ? `Área="${result.area}", Equipamento="${result.equipment}", Risco identificado="${result.risk}", Ação imediata="${result.immediate_action}", Ação definitiva="${result.final_action}".`
        : "Sem contexto técnico prévio.";
      const rd = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              "Você é IA, auditora técnica de segurança e 5S. Compare a foto ANTES com a foto DEPOIS (correção real, enviada pelo usuário) e produza uma análise objetiva baseada APENAS no que é visivelmente observável nas duas fotos. " +
              "Analise: derramamentos removidos, organização, limpeza, obstáculos, EPC, sinalização, isolamento, condições do piso, materiais, área liberada. " +
              'Nunca invente evidências. Quando não houver informação visual suficiente para confirmar um item, coloque-o em "itens_nao_identificados". ' +
              'Retorne EXCLUSIVAMENTE JSON válido no formato: {"conformidade":0-100,"itens_corrigidos":["..."],"itens_pendentes":["..."],"itens_nao_identificados":["..."],"observacoes":"texto breve"}. Sem texto fora do JSON.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Contexto: ${ctx} Compare as duas imagens e retorne o JSON.` },
              { type: "image_url", image_url: { url: beforeUrl } },
              { type: "image_url", image_url: { url: afterUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      const txt = rd.choices?.[0]?.message?.content ?? "";
      const match = (typeof txt === "string" ? txt : "").match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta da IA sem JSON.");
      const parsed = JSON.parse(match[0]) as Partial<{
        conformidade: number;
        itens_corrigidos: string[];
        itens_pendentes: string[];
        itens_nao_identificados: string[];
        observacoes: string;
      }>;
      const list = (v: unknown) =>
        Array.isArray(v)
          ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          : [];
      const finalResult: CompareResult = {
        conformidade: Math.max(0, Math.min(100, Number(parsed.conformidade ?? 0))),
        itens_corrigidos: list(parsed.itens_corrigidos),
        itens_pendentes: list(parsed.itens_pendentes),
        itens_nao_identificados: list(parsed.itens_nao_identificados),
        observacoes: typeof parsed.observacoes === "string" ? parsed.observacoes : "",
      };
      setCompareResult(finalResult);
      if (cacheKey) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(finalResult));
        } catch {
          /* ignore */
        }
      }
      logAudit("ai_analysis", { module: moduleKey, targetId: "compare-real" });
      toast.success("Comparação Antes × Depois concluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao comparar imagens.");
    } finally {
      setComparing(false);
    }
  }

  function normalizeGenerationError(e: unknown): string {
    if (e instanceof Error) {
      if (e.name === "AbortError") return "Geração cancelada.";
      const msg = e.message || "";
      if (/timeout|demorou|abort/i.test(msg))
        return "A geração demorou além do limite. Tente novamente.";
      if (/\b401\b/.test(msg)) return "A autenticação do serviço de imagem falhou.";
      if (/\b402\b/.test(msg)) return "O provedor de imagem está sem saldo disponível.";
      if (/\b429\b/.test(msg)) return "O limite temporário do serviço de imagem foi atingido.";
      if (/\b503\b/.test(msg)) return "O serviço de imagem está temporariamente indisponível.";
      return msg || "Não foi possível gerar a correção visual. Nenhum crédito foi descontado.";
    }
    return "Não foi possível gerar a correção visual. Nenhum crédito foi descontado.";
  }

  async function generateAfterImage() {
    setGenerationError(null);
    if (!photos[0]) {
      const m = "Carregue a fotografia original antes de gerar a correção.";
      setGenerationError(m);
      toast.error(m);
      return;
    }
    const selected = corrections.filter((c) => c.selected && c.description.trim().length >= 10);
    if (selected.length === 0) {
      const m = "Selecione ou adicione pelo menos uma correção.";
      setGenerationError(m);
      toast.error(m);
      return;
    }
    // Cancela requisição anterior, se houver
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGeneratingAfter(true);
    setAfterPlan(null);
    setGenerationProgress({ pct: 10, label: "Preparando a fotografia" });
    try {
      const beforeDataUrl = await toDataURL(photos[0].file);
      setGenerationProgress({ pct: 20, label: "Organizando as correções" });
      const correctionsList = selected.map((c) => `[${c.standard}] ${c.description}`);
      const risks = [
        ...(Array.isArray(result?.consequences_list) ? result!.consequences_list! : []),
        ...(result?.risk ? [result.risk] : []),
      ].filter(Boolean);
      const prompt = correctionsList.join("\n");
      setGenerationProgress({ pct: 35, label: "Enviando ao gerador" });
      const sim = await gerarSimulacaoComIris({
        image: beforeDataUrl,
        prompt,
        solution: result?.final_action ?? undefined,
        sceneDescription: result?.description || result?.title || prompt,
        detectedRisks: risks,
        selectedCorrections: correctionsList,
        signal: controller.signal,
        onProgress: (pct, label) => setGenerationProgress({ pct, label }),
      });
      setGenerationProgress({ pct: 95, label: "Validando o resultado" });
      if (sim.tipo === "simulacao_visual" && sim.imageUrl) {
        setAfterImage(sim.imageUrl);
        setSimulationPrompt(prompt);
        setSimulationVersion((v) => v + 1);
        const usedIds = new Set(selected.map((s) => s.id));
        setCorrections((prev) =>
          prev.map((c) => (usedIds.has(c.id) ? { ...c, usedInGeneration: true } : c)),
        );
        setGenerationProgress({ pct: 100, label: "Concluído" });
        toast.success("Imagem Depois gerada pela IA.");
      } else {
        const plan = sim.tipo === "plano_correcao_visual" ? sim.planoCorrecao : null;
        const lines = plan
          ? [
              plan.condicao_final_esperada && `Condição esperada: ${plan.condicao_final_esperada}`,
              plan.itens_reparar?.length ? `Reparar: ${plan.itens_reparar.join("; ")}` : null,
              plan.isolamento_necessario?.length
                ? `Isolamento: ${plan.isolamento_necessario.join("; ")}`
                : null,
              plan.sinalizacao_necessaria?.length
                ? `Sinalização: ${plan.sinalizacao_necessaria.join("; ")}`
                : null,
            ]
              .filter(Boolean)
              .join("\n")
          : "";
        setAfterPlan(lines || sim.mensagem || "Plano visual textual retornado.");
        setGenerationError(
          sim.mensagem ||
            "Não foi possível gerar a correção visual. Nenhum crédito foi descontado.",
        );
        toast.info(sim.mensagem || "Geração visual indisponível — plano textual retornado.");
      }
    } catch (e) {
      const msg = normalizeGenerationError(e);
      setGenerationError(msg);
      toast.error(msg);
    } finally {
      setGeneratingAfter(false);
      if (abortRef.current === controller) abortRef.current = null;
      setTimeout(() => setGenerationProgress(null), 1500);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Analise a foto antes de salvar.");
      const userId = await getFreshAuthenticatedUserId();
      // upload first photo
      let photo_url: string | null = null;
      if (photos[0]) {
        const f = photos[0].file;
        const ext = f.name.split(".").pop() || "jpg";
        const path = `records/${userId}/${chosenModule}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("inspections").upload(path, f);
        if (up.error) throw up.error;
        const { data: signed } = await supabase.storage
          .from("inspections")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        photo_url = signed?.signedUrl ?? null;
      }
      // upload "depois" if generated
      let after_url: string | null = null;
      if (afterImage) {
        try {
          const blob = await (await fetch(afterImage)).blob();
          const path = `records/${userId}/${chosenModule}-after-${Date.now()}.png`;
          const upA = await supabase.storage.from("inspections").upload(path, blob, {
            contentType: blob.type || "image/png",
          });
          if (!upA.error) {
            const { data: signedA } = await supabase.storage
              .from("inspections")
              .createSignedUrl(path, 60 * 60 * 24 * 365);
            after_url = signedA?.signedUrl ?? null;
          }
        } catch {
          /* ignore */
        }
      }
      // upload foto real da correção (quando anexada)
      let correction_url: string | null = null;
      if (correctionPhoto) {
        try {
          const f = correctionPhoto.file;
          const ext = f.name.split(".").pop() || "jpg";
          const path = `records/${userId}/${chosenModule}-correction-${Date.now()}.${ext}`;
          const upC = await supabase.storage.from("inspections").upload(path, f);
          if (!upC.error) {
            const { data: signedC } = await supabase.storage
              .from("inspections")
              .createSignedUrl(path, 60 * 60 * 24 * 365);
            correction_url = signedC?.signedUrl ?? null;
          }
        } catch {
          /* ignore */
        }
      }
      // Validação de duplicidade removida — a IA valida se a N3 é duplicada.

      let insertedId: string | null = null;
      let internalCode: string | null = null;

      const moduleForServer = (
        chosenModule === "inspection"
          ? "inspecao"
          : chosenModule === "supervision"
            ? "n3"
            : chosenModule
      ) as "n3" | "crm" | "kaizen" | "environment" | "emergency" | "gain" | "inspecao";
      const out = await createRecordFn({
        data: {
          module: moduleForServer,
          title: result.title,
          description: result.description,
          area: result.area || null,
          location: result.location || null,
          equipment: result.equipment || null,
          priority,
          financial_value: showFinancial && financialValue ? Number(financialValue) : null,
          photo_url,
          image_hash: imageHash,
          image_phash: imagePhash,
          meta: {
            iris: result,
            confidence: result.confidence,
            after_url,
            correction_url,
            simulation: afterImage
              ? {
                  prompt: simulationPrompt,
                  version: simulationVersion,
                  generated_at: new Date().toISOString(),
                }
              : null,
          },
          parent_record_id: dupKind !== "new" ? dupParentId : null,
          kind: dupKind,
          similarity_meta: similar.length
            ? ({ top: similar.slice(0, 5) } as Record<string, unknown>)
            : null,
          justification: dupJustification || null,
        },
      });
      insertedId = out.id;
      internalCode = out.internal_code;
      await logAudit("record_create", { module: chosenModule, targetId: insertedId ?? undefined });
      return { id: insertedId, internal_code: internalCode };
    },
    onSuccess: (res) => {
      toast.success(res?.internal_code ? `Registro salvo: ${res.internal_code}` : "Registro salvo");
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["monitoring-vale"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reportText = useMemo(() => {
    if (!result) return "";
    return [
      `📋 ${result.title}`,
      ``,
      `Categoria: ${result.category.toUpperCase()} (confiança ${result.confidence})`,
      `Área: ${result.area} · Local: ${result.location}`,
      `Equipamento: ${result.equipment}`,
      ``,
      `Descrição: ${result.description}`,
      `Risco: ${result.risk}`,
      `Consequência: ${result.consequence}`,
      `Criticidade: ${result.criticality} · Prioridade: ${priority}`,
      ``,
      `▶ Ação imediata: ${result.immediate_action}`,
      `▶ Ação definitiva: ${result.final_action}`,
      result.preventive_action ? `▶ Ação preventiva: ${result.preventive_action}` : "",
      `▶ Responsável sugerido: ${result.suggested_responsible}`,
      `▶ Evidência de encerramento: ${result.closing_evidence}`,
      ``,
      result.norms_violated ? `Normas violadas: ${result.norms_violated}` : "",
      result.root_cause ? `Causa raiz: ${result.root_cause}` : "",
      result.probability && result.severity
        ? `Matriz de risco: Prob=${result.probability} · Sev=${result.severity} · Score=${result.risk_score ?? result.probability * result.severity} · Classe=${(result.risk_class ?? "").toUpperCase()}`
        : "",
      result.risk_class_reason ? `Justificativa da classificação: ${result.risk_class_reason}` : "",
      result.resources ? `Recursos: ${result.resources}` : "",
      result.execution_time ? `Tempo estimado: ${result.execution_time}` : "",
      result.expected_gain ? `Ganho esperado: ${result.expected_gain}` : "",
      result.changes_applied?.length
        ? `Alterações aplicadas (simulação): ${result.changes_applied.join("; ")}`
        : "",
      result.improvement
        ? `Melhoria estimada: risco -${result.improvement.risk_reduction ?? 0}% · organização +${result.improvement.organization ?? 0}% · conformidade +${result.improvement.compliance ?? 0}% · seg. operacional +${result.improvement.operational_safety ?? 0}%`
        : "",
      result.technical_opinion ? `\nParecer técnico:\n${result.technical_opinion}` : "",
      ``,
      `— Gerado pela IA · VisionGuard AI`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [result, priority]);

  async function buildPdf(): Promise<jsPDF> {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 40; // margem
    const contentW = pageW - M * 2;

    // Paleta VisionGuard AI
    const NEON: [number, number, number] = [0, 200, 100];
    const DARK: [number, number, number] = [15, 15, 15];
    const GRAY: [number, number, number] = [100, 100, 100];
    const LIGHT: [number, number, number] = [235, 235, 235];

    const now = new Date();
    const genDate = now.toLocaleString("pt-BR");
    const code = (result?.title ?? "REG").toUpperCase();
    const modLabel = (result?.category ?? moduleKey).toUpperCase();

    // ===== Helpers =====
    let y = 0;
    let pageNum = 1;

    function drawHeader() {
      doc.setFillColor(...DARK);
      doc.rect(0, 0, pageW, 54, "F");
      doc.setFillColor(...NEON);
      doc.rect(0, 54, pageW, 3, "F");
      doc.setTextColor(...NEON);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("VisionGuard AI", M, 26);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Relatório Gerencial · IA", M, 42);
      doc.setFontSize(9);
      doc.setTextColor(200, 200, 200);
      doc.text(`Módulo: ${modLabel}`, pageW - M, 26, { align: "right" });
      doc.text(genDate, pageW - M, 42, { align: "right" });
    }

    function drawFooter() {
      const fy = pageH - 22;
      doc.setDrawColor(...LIGHT);
      doc.setLineWidth(0.5);
      doc.line(M, fy - 8, pageW - M, fy - 8);
      doc.setTextColor(...GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Documento gerado por IA — sujeito à validação técnica do responsável.", M, fy);
      doc.text(`Página ${pageNum}`, pageW - M, fy, { align: "right" });
    }

    function newPage() {
      drawFooter();
      doc.addPage();
      pageNum += 1;
      drawHeader();
      y = 78;
    }

    function ensure(space: number) {
      if (y + space > pageH - 40) newPage();
    }

    function sectionTitle(txt: string) {
      ensure(30);
      doc.setFillColor(...NEON);
      doc.rect(M, y, 4, 14, "F");
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(txt.toUpperCase(), M + 10, y + 11);
      y += 22;
    }

    function paragraph(
      txt: string,
      opts?: { bold?: boolean; size?: number; color?: [number, number, number] },
    ) {
      if (!txt) return;
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setFontSize(opts?.size ?? 10);
      doc.setTextColor(...(opts?.color ?? [30, 30, 30]));
      const lh = (opts?.size ?? 10) + 3;
      const lines = doc.splitTextToSize(txt, contentW);
      for (const ln of lines) {
        ensure(lh);
        doc.text(ln, M, y);
        y += lh;
      }
    }

    function kv(label: string, value?: string | null) {
      if (!value) return;
      const lh = 13;
      const labelW = 130;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      const valueLines = doc.splitTextToSize(String(value), contentW - labelW);
      ensure(Math.max(lh, valueLines.length * lh));
      doc.text(label.toUpperCase(), M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(valueLines, M + labelW, y);
      y += Math.max(lh, valueLines.length * lh) + 2;
    }

    function badgeBox(title: string, value: string, color: [number, number, number]) {
      const w = (contentW - 20) / 3;
      const h = 46;
      return {
        w,
        h,
        draw: (x: number) => {
          doc.setFillColor(...color);
          doc.rect(x, y, w, h, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text(title.toUpperCase(), x + 8, y + 14);
          doc.setFontSize(15);
          doc.text(value, x + 8, y + 34);
        },
      };
    }

    function riskColor(cls?: string): [number, number, number] {
      switch ((cls ?? "").toLowerCase()) {
        case "critico":
        case "critica":
          return [180, 30, 30];
        case "alto":
        case "alta":
          return [210, 100, 20];
        case "medio":
        case "media":
          return [200, 160, 20];
        default:
          return [40, 120, 60];
      }
    }

    async function photoPage(label: string, dataUrl: string, sub?: string) {
      newPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...DARK);
      doc.text(label, M, y);
      if (sub) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY);
        doc.text(sub, M, y + 14);
      }
      y += sub ? 26 : 18;
      // Molde de imagem grande, mantém proporção, centraliza
      const availW = contentW;
      const availH = pageH - y - 60;
      try {
        const props = doc.getImageProperties(dataUrl);
        const ratio = props.width / props.height;
        let iw = availW;
        let ih = iw / ratio;
        if (ih > availH) {
          ih = availH;
          iw = ih * ratio;
        }
        const ix = M + (availW - iw) / 2;
        // Moldura
        doc.setDrawColor(...LIGHT);
        doc.setLineWidth(0.8);
        doc.rect(ix - 2, y - 2, iw + 4, ih + 4);
        doc.addImage(dataUrl, props.fileType === "PNG" ? "PNG" : "JPEG", ix, y, iw, ih);
        y += ih + 10;
      } catch {
        doc.setTextColor(...GRAY);
        doc.text("(imagem indisponível)", M, y);
      }
    }

    // ===== PÁGINA 1 — CAPA / RESUMO EXECUTIVO =====
    drawHeader();
    y = 78;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...DARK);
    const titleLines = doc.splitTextToSize(result?.title ?? "Registro", contentW);
    doc.text(titleLines, M, y);
    y += titleLines.length * 22 + 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(`Código do registro: ${code}    ·    Data: ${genDate}`, M, y);
    y += 18;

    // Cartões: Criticidade / Classe de risco / Prioridade
    ensure(60);
    const critColor = riskColor(result?.criticality);
    const classColor = riskColor(result?.risk_class);
    const prioColor = riskColor(priority);
    const b1 = badgeBox("Criticidade", (result?.criticality ?? "-").toUpperCase(), critColor);
    const b2 = badgeBox("Classe de Risco", (result?.risk_class ?? "-").toUpperCase(), classColor);
    const b3 = badgeBox("Prioridade", (priority ?? "-").toUpperCase(), prioColor);
    b1.draw(M);
    b2.draw(M + b1.w + 10);
    b3.draw(M + b1.w + b2.w + 20);
    y += b1.h + 14;

    // Score
    if (result?.probability && result?.severity) {
      doc.setFillColor(245, 245, 245);
      doc.rect(M, y, contentW, 28, "F");
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(
        `Matriz de Risco  ·  Probabilidade ${result.probability}  ×  Severidade ${result.severity}  =  Score ${result.risk_score ?? result.probability * result.severity}`,
        M + 10,
        y + 18,
      );
      y += 40;
    }

    sectionTitle("Resumo Executivo");
    paragraph(result?.description ?? "-");
    y += 4;

    sectionTitle("Identificação");
    kv("Área", result?.area);
    kv("Local", result?.location);
    kv("Equipamento", result?.equipment);
    kv("Pessoas expostas", result?.exposed_people);
    kv("Confiança da análise", result?.confidence ? `${result.confidence.toUpperCase()}` : null);

    // ===== PÁGINA 2 — ANÁLISE TÉCNICA =====
    newPage();
    sectionTitle("Análise Técnica");
    kv("Risco identificado", result?.risk);
    kv("Consequência principal", result?.consequence);
    kv("Causa raiz", result?.root_cause);
    kv("Normas violadas", result?.norms_violated);
    if (result?.risk_class_reason) {
      y += 2;
      paragraph("Justificativa da classificação de risco:", { bold: true, size: 10 });
      paragraph(result.risk_class_reason);
    }
    if (result?.consequences_list?.length) {
      y += 4;
      paragraph("Consequências possíveis:", { bold: true, size: 10 });
      for (const c of result.consequences_list) paragraph(`•  ${c}`);
    }

    if (result?.control_hierarchy) {
      y += 6;
      sectionTitle("Hierarquia de Controles de Risco");
      const ch = result.control_hierarchy;
      const levelNames: Record<string, string> = {
        eliminacao: "Eliminação",
        substituicao: "Substituição",
        protecao_coletiva: "Proteção Coletiva",
        barreira_fisica: "Barreira Física",
        automacao_isolamento: "Automação/Isolamento",
        controle_administrativo: "Controle Administrativo",
        epi: "EPI",
      };
      kv("Nível escolhido", `${ch.level} — ${levelNames[ch.label] ?? ch.label}`);
      kv("Solução adotada", ch.chosen_solution);
      if (ch.justification) {
        paragraph("Justificativa técnica:", { bold: true, size: 10 });
        paragraph(ch.justification);
      }
      if (ch.alternatives_considered?.length) {
        paragraph("Alternativas consideradas:", { bold: true, size: 10 });
        for (const a of ch.alternatives_considered) paragraph(`•  ${a}`);
      }
      if (ch.why_not_lower_levels) {
        paragraph("Por que não níveis inferiores:", { bold: true, size: 10 });
        paragraph(ch.why_not_lower_levels);
      }
    }

    // ===== PÁGINA 3 — PLANO DE AÇÃO =====
    newPage();
    sectionTitle("Plano de Ação");
    kv("Ação imediata", result?.immediate_action);
    kv("Ação corretiva definitiva", result?.final_action);
    kv("Ação preventiva", result?.preventive_action);
    kv("Responsável sugerido", result?.suggested_responsible);
    kv("Prazo sugerido", result?.suggested_deadline);
    kv("Recursos necessários", result?.resources);
    kv("Tempo estimado de execução", result?.execution_time);
    kv("Evidência de encerramento", result?.closing_evidence);
    kv("Ganho esperado", result?.expected_gain);

    if (result?.improvement) {
      y += 6;
      sectionTitle("Indicadores de Melhoria (estimados)");
      const rows: [string, number][] = [
        ["Redução do risco", result.improvement.risk_reduction ?? 0],
        ["Organização", result.improvement.organization ?? 0],
        ["Conformidade", result.improvement.compliance ?? 0],
        ["Segurança operacional", result.improvement.operational_safety ?? 0],
      ];
      for (const [lbl, pct] of rows) {
        ensure(22);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(lbl, M, y + 8);
        doc.setTextColor(...GRAY);
        doc.text(`${pct}%`, M + contentW, y + 8, { align: "right" });
        const barY = y + 12;
        const barW = contentW;
        doc.setFillColor(...LIGHT);
        doc.rect(M, barY, barW, 6, "F");
        doc.setFillColor(...NEON);
        doc.rect(M, barY, (Math.max(0, Math.min(100, pct)) * barW) / 100, 6, "F");
        y += 24;
      }
    }

    if (result?.changes_applied?.length) {
      y += 4;
      sectionTitle("Alterações Aplicadas na Simulação");
      for (const c of result.changes_applied) paragraph(`•  ${c}`);
    }

    if (result?.technical_opinion) {
      y += 6;
      sectionTitle("Parecer Técnico");
      paragraph(result.technical_opinion);
    }

    // ===== PÁGINAS DE FOTOS — cada uma em página separada, em tamanho grande =====
    const beforeUrl = photos[0] ? await toDataURL(photos[0].file) : null;
    if (beforeUrl) {
      await photoPage(
        "FOTO ORIGINAL (ANTES)",
        beforeUrl,
        "Registro real do local — anexar no app da Vale",
      );
    }
    if (afterImage) {
      await photoPage(
        "SIMULAÇÃO DE CORREÇÃO (DEPOIS)",
        afterImage,
        "Imagem gerada por IA — apoio visual, não é comprovação de execução",
      );
    }
    if (correctionPhoto) {
      const realUrl = await toDataURL(correctionPhoto.file);
      await photoPage(
        "CORREÇÃO EXECUTADA (FOTO REAL)",
        realUrl,
        "Registro da correção realizada em campo",
      );
    }
    // Adicionar demais fotos anexadas
    for (let i = 1; i < photos.length; i++) {
      try {
        const u = await toDataURL(photos[i].file);
        await photoPage(`FOTO ADICIONAL ${i}`, u);
      } catch {
        /* ignore */
      }
    }

    drawFooter();
    return doc;
  }

  function pdfFilename() {
    const t = (result?.title ?? "registro").replace(/[^a-z0-9\-_ ]/gi, "").slice(0, 60);
    return `${t || "registro"}.pdf`;
  }

  async function shareWhatsapp() {
    const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
    // wa.me sempre — redireciona automaticamente para o app instalado (mobile) ou WhatsApp Web (desktop).
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;

    // 1) Mobile: tenta Web Share API com o arquivo (seletor nativo inclui WhatsApp).
    if (isMobile) {
      try {
        const doc = await buildPdf();
        const filename = pdfFilename();
        const blob = doc.output("blob");
        const file = new File([blob], filename, { type: "application/pdf" });
        const nav = navigator as Navigator & {
          canShare?: (data: { files?: File[] }) => boolean;
          share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
        };
        if (nav.canShare?.({ files: [file] }) && nav.share) {
          try {
            await nav.share({
              files: [file],
              text: reportText,
              title: result?.title ?? "Registro VisionGuard AI",
            });
            return;
          } catch (err) {
            if ((err as DOMException)?.name === "AbortError") return;
            // segue para fallback
          }
        }
      } catch {
        // segue para fallback
      }
      // Fallback mobile: navega direto para o WhatsApp (sem about:blank).
      window.location.href = whatsappUrl;
      return;
    }

    // 2) Desktop: baixa o PDF e abre o WhatsApp Web em nova aba.
    try {
      const doc = await buildPdf();
      doc.save(pdfFilename());
      toast.info("PDF baixado. Anexe-o no WhatsApp após abrir a conversa.");
    } catch {
      // se falhar o PDF, ainda abre o WhatsApp com o texto
    }
    const win = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      // popup bloqueado → navega na mesma aba
      window.location.href = whatsappUrl;
    }
  }

  async function shareEmail() {
    const doc = await buildPdf();
    doc.save(pdfFilename());
    toast.info("PDF baixado. Anexe-o ao e-mail.");
    const subject = result ? `[VisionGuard AI] ${result.title}` : "Registro VisionGuard AI";
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportText)}`;
    window.location.href = url;
  }
  async function downloadPdf() {
    const doc = await buildPdf();
    doc.save(pdfFilename());
  }

  return (
    <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-neon" />
          Registro inteligente com IA
        </DialogTitle>
        <DialogDescription>
          Tire uma foto ou selecione da galeria. A IA identifica e preenche o registro
          automaticamente.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        {/* Photo capture */}
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-4 w-4" /> Tirar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 gap-2"
              onClick={() => galleryRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" /> Galeria
            </Button>
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => setExpandedImage(p.preview)}
                    className="block w-full"
                    aria-label="Ampliar foto"
                  >
                    <img
                      src={p.preview}
                      alt=""
                      className="h-24 w-full rounded-md border border-border object-cover transition hover:brightness-110"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 ring-1 ring-border"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-neon/40 hover:text-neon"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={analyze}
              disabled={photos.length === 0 || analyzing}
              className="h-12 w-full gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> IA analisando…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Analisar com IA
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Módulo Inspeção: auditor EXCLUSIVO de 5S. Não avalia N3/Kaizen/segurança/ambiental. */}
        {moduleKey === "inspection" && photoDataUrls.length > 0 && (
          <Inspecao5SFlow images={photoDataUrls} context={result?.description || undefined} />
        )}

        {/* Demais módulos: fluxo N3 (auditoria) → Kaizen (melhoria contínua) */}
        {moduleKey !== "inspection" && photoDataUrls.length > 0 && (
          <N3KaizenFlow
            images={photoDataUrls}
            context={result?.description || undefined}
            initialN3={n3Result}
            initialSelectedRiskId={n3SelectedRisk?.id ?? null}
            initialKaizen={kaizenResult}
            onChange={({ n3, selectedRisk, kaizen }) => {
              setN3Result(n3);
              setN3SelectedRisk(selectedRisk);
              setKaizenResult(kaizen);
            }}
          />
        )}

        {/* IA result review */}
        {result && (
          <div className="space-y-3 rounded-xl border border-neon/30 bg-neon/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-neon/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                {result.category}
              </span>
              <ConfidenceBadge c={result.confidence} />
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-red-300">
                Crit: {result.criticality}
              </span>
            </div>

            <N3ProbabilityChart result={result} />

            <div className="grid gap-2">
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Título (IA)
                </Label>
                <Input
                  value={result.title}
                  onChange={(e) => setResult({ ...result, title: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Descrição (IA)
                </Label>
                <Textarea
                  rows={3}
                  value={result.description}
                  onChange={(e) => setResult({ ...result, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Área
                  </Label>
                  <Input
                    value={result.area}
                    onChange={(e) => setResult({ ...result, area: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Local
                  </Label>
                  <Input
                    value={result.location}
                    onChange={(e) => setResult({ ...result, location: e.target.value })}
                  />
                </div>
              </div>

              {allowCategoryOverride && (
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Classificação final
                  </Label>
                  <Select
                    value={chosenModule}
                    onValueChange={(v) => setChosenModule(v as ModuleKey)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="n3">N3 · Não conformidade</SelectItem>
                      <SelectItem value="crm">CRM · Manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Prioridade
                  </Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((o) => (
                        <SelectItem key={o.v} value={o.v}>
                          {o.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showFinancial && (
                  <div className="grid gap-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Ganho (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={financialValue}
                      onChange={(e) => setFinancialValue(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Correção real & Comparação Antes × Depois */}
              <div className="rounded-lg border border-border bg-black/30 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                    <CheckCircle2 className="h-3 w-3" /> Correção real · Comparação Antes × Depois
                  </div>
                  <div className="flex gap-1">
                    {correctionPhoto && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={compareMode === "grid" ? "default" : "outline"}
                          className="h-7 text-[10px]"
                          onClick={() => setCompareMode("grid")}
                        >
                          Grade
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={compareMode === "slider" ? "default" : "outline"}
                          className="h-7 text-[10px]"
                          onClick={() => setCompareMode("slider")}
                        >
                          Slider
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-[11px] border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => setManualOpen(true)}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Confirmar manualmente
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
                  Carregue a foto <b>Depois</b> para registro visual. Use{" "}
                  <b>Confirmar manualmente</b> para validar a correção sem consumir créditos de IA.
                </p>

                {/* Editor de correções de segurança (sugeridas + manuais) */}
                {result &&
                  (() => {
                    const nr = deriveNrCorrections(result as unknown as Record<string, unknown>);
                    const selectedCount = corrections.filter((c) => c.selected).length;
                    const trimmedDesc = newDescription.trim();
                    const isDuplicate = corrections.some(
                      (c) =>
                        c.id !== editingId &&
                        c.description.trim().toLowerCase() === trimmedDesc.toLowerCase() &&
                        c.standard.trim().toLowerCase() === newStandard.trim().toLowerCase(),
                    );
                    const descTooShort = trimmedDesc.length > 0 && trimmedDesc.length < 10;
                    const descTooLong = trimmedDesc.length > 600;
                    const standardTooLong = newStandard.trim().length > 50;
                    const canSubmit =
                      newStandard.trim().length > 0 &&
                      trimmedDesc.length >= 10 &&
                      !descTooLong &&
                      !standardTooLong &&
                      !isDuplicate;

                    function submitCorrection() {
                      setCorrectionError(null);
                      if (!newStandard.trim()) {
                        setCorrectionError("Informe a norma ou referência.");
                        return;
                      }
                      if (trimmedDesc.length === 0) {
                        setCorrectionError("Descreva a correção que deverá ser aplicada.");
                        return;
                      }
                      if (trimmedDesc.length < 10) {
                        setCorrectionError("A descrição precisa ter pelo menos 10 caracteres.");
                        return;
                      }
                      if (descTooLong) {
                        setCorrectionError("A descrição não pode ultrapassar 600 caracteres.");
                        return;
                      }
                      if (isDuplicate) {
                        setCorrectionError("Já existe uma correção idêntica.");
                        return;
                      }

                      if (editingId) {
                        setCorrections((prev) =>
                          prev.map((c) =>
                            c.id === editingId
                              ? { ...c, standard: newStandard.trim(), description: trimmedDesc }
                              : c,
                          ),
                        );
                        toast.success("Correção atualizada.");
                      } else {
                        setCorrections((prev) => [
                          ...prev,
                          {
                            id: newCorrectionId(),
                            standard: newStandard.trim(),
                            description: trimmedDesc,
                            selected: true,
                            source: "manual",
                            createdAt: new Date().toISOString(),
                          },
                        ]);
                        toast.success("Correção adicionada.");
                      }
                      setNewStandard("");
                      setNewDescription("");
                      setEditingId(null);
                    }

                    function startEdit(c: SafetyCorrection) {
                      setEditingId(c.id);
                      setNewStandard(c.standard);
                      setNewDescription(c.description);
                      setCorrectionError(null);
                    }
                    function cancelEdit() {
                      setEditingId(null);
                      setNewStandard("");
                      setNewDescription("");
                      setCorrectionError(null);
                    }
                    function deleteCorrection(c: SafetyCorrection) {
                      if (c.usedInGeneration) {
                        const ok = window.confirm(
                          "Esta correção já foi aplicada em uma geração anterior. Remover mesmo assim?",
                        );
                        if (!ok) return;
                      }
                      setCorrections((prev) => prev.filter((x) => x.id !== c.id));
                      if (editingId === c.id) cancelEdit();
                    }

                    return (
                      <div className="mb-3 space-y-2 rounded-md border border-neon/30 bg-background/60 p-3 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neon">
                            Correções de segurança para a Foto Depois
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {selectedCount}/{corrections.length} selecionada
                            {selectedCount === 1 ? "" : "s"}
                          </span>
                        </div>

                        {nr.perigos.length > 0 && (
                          <div>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                              Perigos detectados
                            </div>
                            <ul className="list-inside list-disc space-y-0.5 text-foreground/90">
                              {nr.perigos.map((p, i) => (
                                <li key={`p${i}`}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {nr.riscos.length > 0 && (
                          <div>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                              Riscos identificados
                            </div>
                            <ul className="list-inside list-disc space-y-0.5 text-foreground/90">
                              {nr.riscos.map((r, i) => (
                                <li key={`r${i}`}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                              Lista de correções
                            </div>
                            <div className="flex flex-wrap gap-3 text-[10px]">
                              <button
                                type="button"
                                className="text-emerald-300 hover:underline"
                                onClick={() =>
                                  setCorrections((prev) =>
                                    prev.map((c) => ({ ...c, selected: true })),
                                  )
                                }
                              >
                                Selecionar todas
                              </button>
                              <button
                                type="button"
                                className="text-muted-foreground hover:underline"
                                onClick={() =>
                                  setCorrections((prev) =>
                                    prev.map((c) => ({ ...c, selected: false })),
                                  )
                                }
                              >
                                Desmarcar todas
                              </button>
                              <button
                                type="button"
                                className="text-rose-300 hover:underline"
                                onClick={() => {
                                  const manuais = corrections.filter((c) => c.source === "manual");
                                  if (manuais.length === 0) {
                                    toast.info("Não há correções manuais para excluir.");
                                    return;
                                  }
                                  const usadas = manuais.some((c) => c.usedInGeneration);
                                  if (usadas) {
                                    const ok = window.confirm(
                                      "Algumas correções manuais já foram usadas em uma geração. Excluir todas?",
                                    );
                                    if (!ok) return;
                                  }
                                  setCorrections((prev) =>
                                    prev.filter((c) => c.source !== "manual"),
                                  );
                                }}
                              >
                                Excluir manuais
                              </button>
                            </div>
                          </div>

                          {corrections.length === 0 && (
                            <p className="mb-2 text-muted-foreground">
                              Nenhuma correção — adicione abaixo a norma e a descrição da correção.
                            </p>
                          )}

                          <ul className="space-y-1.5">
                            {corrections.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-start gap-2 rounded border border-border/40 bg-background/40 p-1.5"
                              >
                                <label className="mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`Selecionar correção ${c.standard}`}
                                    className="h-4 w-4 accent-emerald-500"
                                    checked={c.selected}
                                    onChange={(e) =>
                                      setCorrections((prev) =>
                                        prev.map((x) =>
                                          x.id === c.id ? { ...x, selected: e.target.checked } : x,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded bg-neon/10 px-1.5 py-0.5 text-[10px] font-semibold text-neon">
                                      {c.standard}
                                    </span>
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                      {c.source === "iris"
                                        ? "Sugerida pela IA"
                                        : "Adicionada manualmente"}
                                    </span>
                                    {c.usedInGeneration && (
                                      <span className="text-[9px] uppercase tracking-wide text-emerald-400">
                                        Usada na geração
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90">
                                    {c.description}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col gap-1">
                                  <button
                                    type="button"
                                    className="rounded px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-500/10"
                                    onClick={() => startEdit(c)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/10"
                                    onClick={() => deleteCorrection(c)}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>

                          <div className="mt-3 space-y-2 border-t border-border/50 pt-2">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <div className="sm:w-40">
                                <Label
                                  htmlFor="new-standard"
                                  className="text-[10px] uppercase tracking-widest text-muted-foreground"
                                >
                                  Norma
                                </Label>
                                <Input
                                  id="new-standard"
                                  list="norm-suggestions"
                                  className="h-8 text-[11px]"
                                  maxLength={50}
                                  placeholder="Ex.: NR-10, NR-35, 5S ou Procedimento interno"
                                  value={newStandard}
                                  onChange={(e) => {
                                    setNewStandard(e.target.value);
                                    setCorrectionError(null);
                                  }}
                                />
                                <datalist id="norm-suggestions">
                                  {NORM_SUGGESTIONS.map((s) => (
                                    <option key={s} value={s} />
                                  ))}
                                </datalist>
                              </div>
                              <div className="flex-1">
                                <Label
                                  htmlFor="new-desc"
                                  className="text-[10px] uppercase tracking-widest text-muted-foreground"
                                >
                                  Descrição
                                </Label>
                                <Textarea
                                  id="new-desc"
                                  className="min-h-[54px] text-[11px]"
                                  rows={2}
                                  maxLength={600}
                                  placeholder="Descreva a correção a aplicar…"
                                  value={newDescription}
                                  onChange={(e) => {
                                    setNewDescription(e.target.value);
                                    setCorrectionError(null);
                                  }}
                                />
                                <div className="mt-0.5 flex items-center justify-between text-[9px] text-muted-foreground">
                                  <span>
                                    {descTooShort && "Mínimo 10 caracteres."}
                                    {isDuplicate && " Correção duplicada."}
                                  </span>
                                  <span>{trimmedDesc.length}/600</span>
                                </div>
                              </div>
                            </div>

                            {correctionError && (
                              <p className="text-[10px] text-rose-300" role="alert">
                                {correctionError}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 gap-1 text-[11px]"
                                disabled={!canSubmit}
                                onClick={submitCorrection}
                              >
                                <Plus className="h-3 w-3" />
                                {editingId ? "Salvar alteração" : "Adicionar"}
                              </Button>
                              {editingId && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[11px]"
                                  onClick={cancelEdit}
                                >
                                  Cancelar edição
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {/* Geração automática de imagem "Depois" removida do aplicativo.
                    O plano visual das correções agora é feito no Projeto Executivo. */}

                {compareMode === "slider" && correctionPhoto && photos[0] ? (
                  <CompareSlider
                    beforeSrc={photos[0].preview}
                    afterSrc={correctionPhoto.preview}
                    beforeLabel="Antes"
                    afterLabel="Correção real"
                    className="aspect-video"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Antes
                      </p>
                      {photos[0] ? (
                        <button
                          type="button"
                          onClick={() => setExpandedImage(photos[0].preview)}
                          className="block w-full"
                        >
                          <img
                            src={photos[0].preview}
                            alt="Antes"
                            className="aspect-square w-full rounded-md border border-border object-cover"
                          />
                        </button>
                      ) : (
                        <div className="aspect-square w-full rounded-md border border-dashed border-border" />
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Correção real
                      </p>
                      {correctionPhoto ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setExpandedImage(correctionPhoto.preview)}
                            className="block w-full"
                          >
                            <img
                              src={correctionPhoto.preview}
                              alt="Correção real"
                              className="aspect-square w-full rounded-md border border-emerald-500/40 object-cover"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(correctionPhoto.preview);
                              setCorrectionPhoto(null);
                              setCompareResult(null);
                            }}
                            className="absolute right-1 top-1 rounded bg-black/70 px-1.5 text-[9px] text-white"
                          >
                            remover
                          </button>
                        </div>
                      ) : (
                        <div className="grid aspect-square w-full grid-cols-1 gap-1">
                          <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-emerald-500/30 p-2 text-center text-[10px] text-muted-foreground hover:border-emerald-400/60 hover:text-emerald-300">
                            <Camera className="h-4 w-4" />
                            Tirar foto
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const v = validateFile(f, "image");
                                if (!v.ok) {
                                  toast.error(v.error);
                                  return;
                                }
                                setCorrectionPhoto({ file: f, preview: URL.createObjectURL(f) });
                                setCompareResult(null);
                              }}
                            />
                          </label>
                          <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-emerald-500/30 p-2 text-center text-[10px] text-muted-foreground hover:border-emerald-400/60 hover:text-emerald-300">
                            <ImagePlus className="h-4 w-4" />
                            Escolher da galeria
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const v = validateFile(f, "image");
                                if (!v.ok) {
                                  toast.error(v.error);
                                  return;
                                }
                                setCorrectionPhoto({ file: f, preview: URL.createObjectURL(f) });
                                setCompareResult(null);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {compareResult && (
                  <div className="mt-3 space-y-2 rounded-md border border-neon/30 bg-neon/5 p-3 text-[11px] leading-relaxed">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                        Conformidade estimada
                      </span>
                      <span
                        className={`font-mono text-sm ${compareResult.conformidade >= 70 ? "text-neon" : compareResult.conformidade >= 40 ? "text-yellow-300" : "text-red-400"}`}
                      >
                        {compareResult.conformidade}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                      <div
                        className={`h-full ${compareResult.conformidade >= 70 ? "bg-neon" : compareResult.conformidade >= 40 ? "bg-yellow-400" : "bg-red-500"}`}
                        style={{ width: `${compareResult.conformidade}%` }}
                      />
                    </div>
                    {compareResult.itens_corrigidos?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neon">
                          Itens corrigidos
                        </p>
                        <ul className="ml-4 list-disc text-foreground/80">
                          {compareResult.itens_corrigidos.map((i, k) => (
                            <li key={k}>{i}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {compareResult.itens_pendentes?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-yellow-300">
                          Itens pendentes
                        </p>
                        <ul className="ml-4 list-disc text-foreground/80">
                          {compareResult.itens_pendentes.map((i, k) => (
                            <li key={k}>{i}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {compareResult.itens_nao_identificados?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Sem evidências suficientes
                        </p>
                        <ul className="ml-4 list-disc text-foreground/80">
                          {compareResult.itens_nao_identificados.map((i, k) => (
                            <li key={k}>{i}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {compareResult.observacoes && (
                      <p className="text-foreground/80">
                        <span className="text-muted-foreground">Observações:</span>{" "}
                        {compareResult.observacoes}
                      </p>
                    )}
                    <p className="text-[9px] italic text-muted-foreground">
                      Avaliação automática — sujeita à validação do responsável.
                    </p>
                  </div>
                )}

                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Envie a <b className="text-emerald-300">foto real da correção</b> e clique em{" "}
                  <b>Comparar com IA</b> para comparar objetivamente com a foto de antes.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-black/30 p-3 text-xs">
                <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                  <CheckCircle2 className="h-3 w-3" /> Ação imediata
                </div>
                <p className="text-foreground/80">{result.immediate_action}</p>
                <div className="mt-2 mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                  <CheckCircle2 className="h-3 w-3" /> Ação definitiva
                </div>
                <p className="text-foreground/80">{result.final_action}</p>
                <div className="mt-2 text-[11px]">
                  <span className="text-muted-foreground">Responsável:</span>{" "}
                  {result.suggested_responsible}
                </div>

                <div className="mt-2 text-[11px]">
                  <span className="text-muted-foreground">Risco:</span> {result.risk}
                </div>
                <div className="mt-1 text-[11px]">
                  <span className="text-muted-foreground">Expostos:</span> {result.exposed_people}
                </div>
              </div>

              {/* Parecer técnico aprofundado */}
              {(result.technical_opinion ||
                result.norms_violated ||
                result.root_cause ||
                result.probability ||
                result.risk_class) && (
                <div className="rounded-lg border border-neon/30 bg-black/30 p-3 text-xs">
                  <div className="mb-2 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                    <AlertTriangle className="h-3 w-3" /> Parecer técnico · Engenheiro de Segurança
                  </div>
                  {result.norms_violated && (
                    <div className="mb-1 text-[11px]">
                      <span className="text-muted-foreground">Normas violadas:</span>{" "}
                      {result.norms_violated}
                    </div>
                  )}
                  {result.root_cause && (
                    <div className="mb-1 text-[11px]">
                      <span className="text-muted-foreground">Causa raiz:</span> {result.root_cause}
                    </div>
                  )}
                  {result.consequences_list && result.consequences_list.length > 0 && (
                    <div className="mb-1 text-[11px]">
                      <span className="text-muted-foreground">Consequências:</span>
                      <ul className="ml-4 list-disc text-foreground/80">
                        {result.consequences_list.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(result.probability || result.severity || result.risk_class) && (
                    <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Prob.</div>
                        <div className="font-display text-sm text-neon">
                          {result.probability ?? "-"}
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Sev.</div>
                        <div className="font-display text-sm text-neon">
                          {result.severity ?? "-"}
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Score</div>
                        <div className="font-display text-sm text-neon">
                          {result.risk_score ??
                            (result.probability && result.severity
                              ? result.probability * result.severity
                              : "-")}
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Classe</div>
                        <div className="font-display text-sm uppercase text-neon">
                          {result.risk_class ?? "-"}
                        </div>
                      </div>
                    </div>
                  )}
                  {result.risk_class_reason && (
                    <div className="mt-2 text-[11px]">
                      <span className="text-muted-foreground">Justificativa:</span>{" "}
                      {result.risk_class_reason}
                    </div>
                  )}
                  {result.preventive_action && (
                    <div className="mt-2 text-[11px]">
                      <span className="text-muted-foreground">Ação preventiva:</span>{" "}
                      {result.preventive_action}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                    {result.resources && (
                      <div>
                        <span className="text-muted-foreground">Recursos:</span> {result.resources}
                      </div>
                    )}
                    {result.execution_time && (
                      <div>
                        <span className="text-muted-foreground">Tempo:</span>{" "}
                        {result.execution_time}
                      </div>
                    )}
                    {result.expected_gain && (
                      <div>
                        <span className="text-muted-foreground">Ganho esperado:</span>{" "}
                        {result.expected_gain}
                      </div>
                    )}
                  </div>
                  {result.technical_opinion && (
                    <div className="mt-2 rounded bg-black/40 p-2 text-[11px] leading-relaxed text-foreground/90">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-neon">
                        Parecer
                      </div>
                      {result.technical_opinion}
                    </div>
                  )}
                </div>
              )}

              {/* Alterações visuais aplicadas + percentuais de melhoria */}
              {(result.changes_applied?.length || result.improvement) && (
                <div className="rounded-lg border border-neon/30 bg-black/30 p-3 text-xs">
                  <div className="mb-2 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-widest text-neon">
                    <Sparkles className="h-3 w-3" /> Antes × Simulação · alterações
                  </div>
                  {result.changes_applied?.length ? (
                    <ul className="ml-4 list-disc text-[11px] text-foreground/85">
                      {result.changes_applied.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                  {result.improvement && (
                    <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[10px] sm:grid-cols-4">
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Risco</div>
                        <div className="font-display text-sm text-neon">
                          -{result.improvement.risk_reduction ?? 0}%
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Organização</div>
                        <div className="font-display text-sm text-neon">
                          +{result.improvement.organization ?? 0}%
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Conformidade</div>
                        <div className="font-display text-sm text-neon">
                          +{result.improvement.compliance ?? 0}%
                        </div>
                      </div>
                      <div className="rounded bg-black/50 p-1.5">
                        <div className="text-muted-foreground">Seg. Oper.</div>
                        <div className="font-display text-sm text-neon">
                          +{result.improvement.operational_safety ?? 0}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={shareWhatsapp}>
                  <Share2 className="h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={shareEmail}>
                  <Mail className="h-3.5 w-3.5" /> E-mail
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadPdf}>
                  <FileDown className="h-3.5 w-3.5" /> Baixar PDF
                </Button>
              </div>

              <ReportActions
                report={buildFromIrisResult({
                  result,
                  moduleKey,
                  originalImageUrl: photos[0]?.preview,
                  markedImageUrl: afterImage ?? undefined,
                  requester: result.suggested_responsible || "—",
                  company: result.area || "—",
                  unit: result.location || "—",
                  area: result.area || "—",
                  equipment: result.equipment || undefined,
                  qrTargetUrl: typeof window !== "undefined" ? window.location.href : undefined,
                })}
              />

              <p className="text-[10px] italic text-muted-foreground">
                AVISO: As ações propostas pela IA devem ser validadas pelos responsáveis antes da
                execução.
              </p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
          Cancelar
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={!result || save.isPending}
          className="w-full gap-2 sm:w-auto"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar registro
        </Button>
      </DialogFooter>

      {expandedImage && (
        <Dialog open onOpenChange={(o) => !o && setExpandedImage(null)}>
          <DialogContent className="max-w-5xl border-neon/30 bg-black/95 p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Foto ampliada</DialogTitle>
            </DialogHeader>
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-background/80 p-1.5 ring-1 ring-border"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={expandedImage}
              alt="Foto ampliada"
              className="max-h-[85vh] w-full rounded-md object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      {showDupDialog && similar.length > 0 && (
        <Dialog open onOpenChange={(o) => !o && setShowDupDialog(false)}>
          <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display uppercase tracking-widest text-neon">
                {similar[0].similarity >= 90
                  ? "Provável duplicidade detectada"
                  : "Possíveis registros semelhantes"}
              </DialogTitle>
              <DialogDescription>
                Encontramos {similar.length} registro(s) semelhante(s). Verifique antes de criar uma
                nova {chosenModule === "n3" ? "N3" : "CRM"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {similar.map((s) => {
                const selected = dupParentId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDupParentId(s.id)}
                    className={`flex w-full gap-3 rounded-lg border p-2 text-left text-xs transition ${selected ? "border-neon bg-neon/5" : "border-border/60 bg-black/30"}`}
                  >
                    {s.photo_url ? (
                      <img
                        src={s.photo_url}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-md border border-border/40 bg-muted/20" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-foreground">
                          {s.title ?? "(sem título)"}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest ${s.similarity >= 90 ? "bg-red-500/15 text-red-300" : s.similarity >= 75 ? "bg-orange-500/15 text-orange-300" : "bg-yellow-500/10 text-yellow-300"}`}
                        >
                          {s.similarity}%
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-neon">
                        {s.internal_code ?? "—"}
                        {s.vale_protocol ? ` · ${s.vale_protocol}` : ""}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[s.area, s.location, s.equipment].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-black/30 p-3">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                O que fazer?
              </Label>
              <div className="grid gap-1 text-xs">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={dupKind === "new"}
                    onChange={() => setDupKind("new")}
                  />
                  <span>
                    <b>Confirmar novo registro</b> — descartar semelhança.{" "}
                    {similar[0].similarity >= 90 && (
                      <span className="text-orange-300">(exige justificativa)</span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={dupKind === "complement"}
                    onChange={() => setDupKind("complement")}
                  />
                  <span>
                    <b>Vincular como complemento</b> — atualiza tratativa do registro selecionado.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={dupKind === "recurrence"}
                    onChange={() => setDupKind("recurrence")}
                  />
                  <span>
                    <b>Registrar reincidência</b> — cria N3/CRM vinculada ao original (código
                    …-R0N).
                  </span>
                </label>
              </div>
              {(dupKind === "new" && similar[0].similarity >= 90) || dupKind === "recurrence" ? (
                <Textarea
                  rows={2}
                  placeholder={
                    dupKind === "new"
                      ? "Justificativa para criar novo registro"
                      : "Motivo da reincidência / falha da ação anterior"
                  }
                  value={dupJustification}
                  onChange={(e) => setDupJustification(e.target.value)}
                />
              ) : null}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDupDialog(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  (dupKind !== "new" && !dupParentId) ||
                  (((dupKind === "new" && similar[0].similarity >= 90) ||
                    dupKind === "recurrence") &&
                    !dupJustification.trim())
                }
                onClick={() => setShowDupDialog(false)}
              >
                Confirmar decisão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {manualOpen && (
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar correção manualmente</DialogTitle>
              <DialogDescription>
                Validação humana da correção — não consome créditos de IA.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Resultado
                </Label>
                <Select value={manualResultado} onValueChange={setManualResultado}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concluida">Correção concluída</SelectItem>
                    <SelectItem value="parcial">Correção parcial</SelectItem>
                    <SelectItem value="nao_concluida">Correção não concluída</SelectItem>
                    <SelectItem value="insuficiente">Evidência insuficiente</SelectItem>
                    <SelectItem value="risco_presente">Risco ainda presente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Responsável pela validação
                </Label>
                <Input
                  value={manualResp}
                  onChange={(e) => setManualResp(e.target.value)}
                  placeholder="Nome / matrícula"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Observação / Risco residual
                </Label>
                <Textarea
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  rows={3}
                  placeholder="Descreva o que foi verificado, risco residual e necessidade de nova ação."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmManual}>Confirmar sem IA</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DialogContent>
  );
}

function ConfidenceBadge({ c }: { c: "alta" | "media" | "baixa" }) {
  const map = {
    alta: "bg-neon/15 text-neon",
    media: "bg-yellow-500/15 text-yellow-300",
    baixa: "bg-red-500/15 text-red-300",
  } as const;
  const icon = c === "alta" ? CheckCircle2 : AlertTriangle;
  const Icon = icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${map[c]}`}
    >
      <Icon className="h-3 w-3" /> Confiança {c}
    </span>
  );
}

function N3ProbabilityChart({ result }: { result: IrisResult }) {
  const raw = (result as unknown as { raw?: { score_confianca?: number } }).raw;
  const base =
    typeof raw?.score_confianca === "number"
      ? raw.score_confianca
      : result.confidence === "alta"
        ? 85
        : result.confidence === "media"
          ? 60
          : 35;
  const critBoost = { critica: 1, alta: 0.92, media: 0.72, baixa: 0.5 }[result.criticality] ?? 0.7;
  const catFactor =
    result.category === "n3"
      ? 1
      : result.category === "inspecao" || result.category === "emergency"
        ? 0.7
        : 0.35;
  const prob = Math.round(Math.min(99, Math.max(1, base * critBoost * catFactor)));
  const rest = 100 - prob;

  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const C = 2 * Math.PI * r;
  const dashN3 = (prob / 100) * C;
  const dashRest = C - dashN3;
  const color = prob >= 75 ? "#ef4444" : prob >= 45 ? "#f59e0b" : "#22c55e";

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-black/30 p-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="18"
          opacity="0.25"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="18"
          strokeDasharray={`${dashN3} ${dashRest}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-foreground"
          fontSize="20"
          fontWeight="700"
        >
          {prob}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" fontSize="9">
          N3 · IA Vale
        </text>
      </svg>
      <div className="space-y-1 text-xs">
        <div className="font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Probabilidade de ser N3
        </div>
        <div className="text-foreground/90">
          Estimativa da chance deste registro ser classificado como N3 e passar pela IA da Vale.
        </div>
        <div className="flex items-center gap-3 pt-1 text-[10px] uppercase tracking-widest">
          <span className="inline-flex items-center gap-1 text-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} /> N3 {prob}%
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Outros {rest}%
          </span>
        </div>
      </div>
    </div>
  );
}
