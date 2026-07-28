// Cliente único para a Edge Function `analisar-com-iris` (Google Gemini externo).
// Toda análise IA na interface passa por aqui — não usa mais a IA nativa do Lovable.

import { supabase } from "@/integrations/supabase/client";

/**
 * Garante um access_token válido antes de chamar a Edge Function.
 * Se não houver sessão, lança erro claro. Se estiver perto de expirar,
 * força refresh para evitar 401 "Sessão inválida".
 */
export async function ensureFreshSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    throw new Error("Você precisa estar logado. Faça login e tente novamente.");
  }
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now < 60) {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      throw new Error("Sua sessão expirou. Faça login novamente.");
    }
  }
}

async function ensureFreshSessionInternal(): Promise<void> {
  await ensureFreshSession();
}


export type IrisAnalysis = {
  titulo: string;
  tipo_registro:
    | "N3"
    | "Kaizen"
    | "Inspecao"
    | "MeioAmbiente"
    | "NaoConformidade"
    | "CondicaoSegura"
    | string;
  descricao: string;
  condicao_observada: string;
  perigos: string[];
  riscos: string[];
  nivel_risco: "baixo" | "medio" | "alto" | "critico" | string;
  probabilidade: number;
  severidade: number;
  acao_imediata: string;
  acao_corretiva: string;
  acao_preventiva: string;
  score_confianca: number;
  necessita_interdicao: boolean;
  relatorio_proposto: string;
};

export type IrisChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export type IrisVisualCorrectionPlan = {
  condicao_final_esperada: string;
  itens_remover: string[];
  itens_reparar: string[];
  limpeza_necessaria: string[];
  sinalizacao_necessaria: string[];
  isolamento_necessario: string[];
  melhorias_recomendadas: string[];
  checklist_foto_final: string[];
};

export type IrisSimulationResult =
  | {
      tipo: "simulacao_visual";
      imageUrl: string;
      imagemGerada: true;
      mensagem?: string;
      rotulo?: string;
    }
  | {
      tipo: "plano_correcao_visual";
      imageUrl: null;
      imagemGerada: false;
      mensagem: string;
      planoCorrecao: IrisVisualCorrectionPlan;
    };

const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export function validateImageForIris(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type.toLowerCase())) {
    return "Formato aceito: JPG, PNG ou WEBP.";
  }
  if (file.size > MAX_BYTES) {
    return "Imagem excede 8 MB. Reduza o tamanho e tente novamente.";
  }
  return null;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar a imagem para análise.");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function analisarComIris(input: {
  image?: string;
  images?: string[];
  context?: string;
}): Promise<IrisAnalysis> {
  const clientReqId = Math.random().toString(36).slice(2, 10);
  const images = input.images ?? (input.image ? [input.image] : []);
  const imagesSummary = images.map((v) => {
    if (v.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(v);
      return { kind: "data-url", mime: m?.[1], approxBytes: m ? Math.floor((m[2].length * 3) / 4) : 0 };
    }
    if (v.startsWith("http")) return { kind: "http", length: v.length };
    return { kind: "raw", length: v.length };
  });
  console.log("[IRIS client]", clientReqId, "→ invoke analisar-com-iris", {
    imagesCount: images.length,
    imagesSummary,
    contextChars: (input.context ?? "").length,
  });

  const t0 = performance.now();
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<IrisAnalysis | { error: string }>(
    "analisar-com-iris",
    { body: input },
  );
  const elapsedMs = Math.round(performance.now() - t0);

  if (error) {
    const anyErr = error as unknown as {
      message?: string;
      status?: number;
      context?: { body?: unknown; status?: number };
    };
    let msg = anyErr.message ?? "Falha ao chamar a IA.";
    let bodyPreview: unknown = anyErr.context?.body;
    try {
      const b = anyErr.context?.body;
      if (typeof b === "string" && b) {
        const j = JSON.parse(b) as { error?: string };
        bodyPreview = j;
        if (j?.error) msg = j.error;
      } else if (b && typeof b === "object" && "error" in b) {
        msg = String((b as { error: string }).error);
      }
    } catch {
      /* ignore */
    }
    console.error("[IRIS client]", clientReqId, "✗ error", {
      elapsedMs,
      status: anyErr.status ?? anyErr.context?.status,
      message: msg,
      bodyPreview,
    });
    throw new Error(msg);
  }
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    console.error("[IRIS client]", clientReqId, "✗ invalid data", { elapsedMs, data });
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  const a = data as IrisAnalysis;
  console.log("[IRIS client]", clientReqId, "✓ ok", {
    elapsedMs,
    titulo: a.titulo,
    tipo: a.tipo_registro,
    nivel: a.nivel_risco,
    prob: a.probabilidade,
    sev: a.severidade,
    conf: a.score_confianca,
  });
  return a;
}

export async function chamarIrisChat(input: {
  messages: IrisChatMessage[];
  response_format?: unknown;
}): Promise<{ choices: Array<{ message: { content?: string } }> }> {
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<
    { choices: Array<{ message: { content?: string } }> } | { error: string }
  >("analisar-com-iris", {
    body: { mode: "chat", ...input },
  });

  if (error) throw new Error(extractInvokeError(error));
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  return data as { choices: Array<{ message: { content?: string } }> };
}

export async function gerarSimulacaoComIris(input: {
  image: string; // data URL da foto ANTES
  prompt: string;
  solution?: string;
  analysis?: Record<string, unknown>;
  sceneDescription?: string;
  detectedRisks?: string[];
  selectedCorrections?: string[];
  signal?: AbortSignal;
  onProgress?: (pct: number, label: string) => void;
}): Promise<IrisSimulationResult> {
  // Extrai base64 puro + mime da data URL.
  const m = /^data:([^;]+);base64,(.+)$/.exec(input.image);
  if (!m) throw new Error("Foto Antes em formato inválido.");
  const mimeType = m[1];
  const imageBase64 = m[2];

  const corrections = (input.selectedCorrections?.filter(Boolean) ?? []);
  if (corrections.length === 0) {
    const seed = (input.solution || input.prompt || "").trim();
    if (seed) corrections.push(seed);
  }

  await ensureFreshSession();
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  input.onProgress?.(60, "Aplicando as correções");
  const res = await fetch("/api/iris/generate-after", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      imageBase64,
      mimeType,
      sceneDescription: input.sceneDescription ?? input.prompt,
      detectedRisks: input.detectedRisks ?? [],
      selectedCorrections: corrections,
      generationMode: "final",
    }),
    signal: input.signal,
  });
  input.onProgress?.(80, "Processando a imagem");

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* ignore */ }

  if (!res.ok || body.success !== true) {
    const baseMsg = typeof body.error === "string" ? body.error :
      "Os serviços de geração de imagem estão temporariamente indisponíveis. Nenhum crédito foi descontado. Tente novamente mais tarde.";

    const attempts = Array.isArray(body.attempts) ? body.attempts as Array<Record<string, unknown>> : [];
    const skipped = Array.isArray(body.skipped) ? body.skipped as Array<Record<string, unknown>> : [];

    // Log detalhado sempre — visível no console do navegador para diagnóstico.
    console.error("[generate-after] falha", {
      status: res.status,
      totalAttempts: body.totalAttempts,
      lastError: body.lastError,
      attempts,
      skipped,
    });

    let msg = baseMsg;
    if (import.meta.env.DEV && (attempts.length > 0 || skipped.length > 0)) {
      const lines = [
        ...attempts.map((a) => `• ${String(a.provider).toUpperCase()} (${a.model ?? "?"}) — HTTP ${a.httpStatus ?? "?"} · ${a.errorType ?? "?"} · ${a.durationMs ?? "?"}ms\n   ${a.errorMessage ?? "sem mensagem"}`),
        ...skipped.map((s) => `• ${String(s.provider).toUpperCase()} — pulado: ${s.reason}`),
      ];
      msg = `${baseMsg}\n\nDetalhes (dev):\n${lines.join("\n")}`;
    }

    if (res.status === 503 || body.success === false) {
      return {
        tipo: "plano_correcao_visual",
        imageUrl: null,
        imagemGerada: false,
        mensagem: msg,
        planoCorrecao: normalizeVisualPlan(null),
      };
    }
    throw new Error(msg);
  }

  const b64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mime = typeof body.imageMimeType === "string" ? body.imageMimeType : "image/png";
  if (!b64) throw new Error("Resposta sem imagem.");
  const imageUrl = `data:${mime};base64,${b64}`;
  return {
    tipo: "simulacao_visual",
    imageUrl,
    imagemGerada: true,
    mensagem: "Imagem corrigida gerada com sucesso.",
    rotulo: "Imagem gerada por IA",
  };
}

function normalizeVisualPlan(value: unknown): IrisVisualCorrectionPlan {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (v: unknown) => Array.isArray(v) ? v.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  return {
    condicao_final_esperada: typeof o.condicao_final_esperada === "string" ? o.condicao_final_esperada : "Área corrigida e segura conforme a ação definitiva indicada.",
    itens_remover: list(o.itens_remover),
    itens_reparar: list(o.itens_reparar),
    limpeza_necessaria: list(o.limpeza_necessaria),
    sinalizacao_necessaria: list(o.sinalizacao_necessaria),
    isolamento_necessario: list(o.isolamento_necessario),
    melhorias_recomendadas: list(o.melhorias_recomendadas),
    checklist_foto_final: list(o.checklist_foto_final),
  };
}

export async function analisarAmbienteComIris(input: {
  imageUrls: string[];
  area?: string | null;
  location?: string | null;
  equipment?: string | null;
  description?: string | null;
}): Promise<Record<string, unknown>> {
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<Record<string, unknown> | { error: string }>(
    "analisar-com-iris",
    { body: { mode: "environment-before", ...input } },
  );

  if (error) throw new Error(extractInvokeError(error));
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  return data as Record<string, unknown>;
}

export async function transcreverAudioComIris(audio: Blob): Promise<string> {
  const audioData = await blobToDataUrl(audio);
  await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke<{ text: string } | { error: string }>(
    "analisar-com-iris",
    { body: { mode: "transcribe", audio: audioData } },
  );

  if (error) throw new Error(extractInvokeError(error));
  if (!data || typeof data !== "object" || "error" in (data as object)) {
    throw new Error((data as { error?: string })?.error ?? "Falha na transcrição");
  }
  return (data as { text?: string }).text ?? "";
}

function extractInvokeError(error: unknown): string {
  const anyErr = error as { message?: string; context?: { body?: unknown } };
  let msg = anyErr.message ?? "Falha ao chamar a IA.";
  try {
    const b = anyErr.context?.body;
    if (typeof b === "string" && b) {
      const j = JSON.parse(b) as { error?: string };
      if (j?.error) msg = j.error;
    } else if (b && typeof b === "object" && "error" in b) {
      msg = String((b as { error: string }).error);
    }
  } catch {
    /* ignore */
  }
  if (msg.toLowerCase().includes("quota") || msg.includes("Limite de uso")) return "Limite de uso da IA atingido. Tente novamente em instantes.";
  if (msg.includes("Créditos") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("payment")) return "Créditos da IA da workspace esgotados. Adicione créditos para continuar.";
  if (msg.includes("IA nativa não configurada")) return "IA nativa não configurada.";
  return msg;
}


// ---------- Adaptadores para telas existentes ----------

/** Mapeia nivel_risco → paleta verde/amarelo/vermelho usada na tela de Inspeção 5S. */
export function toInspectionRisk(a: IrisAnalysis): "verde" | "amarelo" | "vermelho" {
  const n = (a.nivel_risco || "").toLowerCase();
  if (n === "alto" || n === "critico" || n === "crítico") return "vermelho";
  if (n === "medio" || n === "médio") return "amarelo";
  return "verde";
}

/** Adapta para o formato Analysis usado em `inspecao.tsx`. */
export function toInspectionAnalysis(a: IrisAnalysis) {
  const steps = [a.acao_imediata, a.acao_corretiva, a.acao_preventiva].filter(Boolean);
  return {
    risk_level: toInspectionRisk(a),
    findings: [...a.perigos, ...a.riscos].filter(Boolean),
    suggestions: steps,
    action_plan: {
      objective: a.acao_corretiva || a.titulo || "Regularizar condição observada.",
      steps,
      responsible: ["Supervisor de Operações", "Equipe de Segurança"],
      closing_criteria: a.necessita_interdicao
        ? "Condição eliminada + evidência fotográfica + liberação pela segurança."
        : "Ação corretiva evidenciada e revisada pelo responsável.",
    },
    approval_probability: a.score_confianca,
    raw: a,
  };
}

/** Mapeia tipo_registro → categoria dos módulos internos usados em photo-record-dialog. */
export function toModuleCategory(
  a: IrisAnalysis,
): "n3" | "crm" | "kaizen" | "environment" | "emergency" | "gain" | "inspecao" {
  switch (a.tipo_registro) {
    case "N3":
    case "NaoConformidade":
      return "n3";
    case "Kaizen":
      return "kaizen";
    case "Inspecao":
    case "CondicaoSegura":
      return "inspecao";
    case "MeioAmbiente":
      return "environment";
    default:
      return "n3";
  }
}

/** Mapeia nivel_risco → criticidade/prioridade do IrisResult. */
export function toCriticality(a: IrisAnalysis): "baixa" | "media" | "alta" | "critica" {
  const n = (a.nivel_risco || "").toLowerCase();
  if (n === "critico" || n === "crítico") return "critica";
  if (n === "alto") return "alta";
  if (n === "medio" || n === "médio") return "media";
  return "baixa";
}

/** Adapta para o IrisResult usado em `photo-record-dialog.tsx`. */
export function toPhotoDialogResult(a: IrisAnalysis) {
  const criticality = toCriticality(a);
  const riskClass =
    criticality === "critica"
      ? "critico"
      : criticality === "alta"
        ? "alto"
        : criticality === "media"
          ? "medio"
          : "baixo";
  return {
    category: toModuleCategory(a),
    confidence:
      a.score_confianca >= 75 ? "alta" : a.score_confianca >= 45 ? "media" : "baixa",
    title: a.titulo,
    description: a.descricao,
    area: "",
    location: "",
    equipment: "",
    risk: a.riscos.join("; "),
    exposed_people: "",
    consequence: a.perigos.join("; "),
    criticality,
    priority: criticality,
    immediate_action: a.acao_imediata,
    final_action: a.acao_corretiva,
    preventive_action: a.acao_preventiva,
    suggested_responsible: "Supervisor de Operações",
    suggested_deadline: a.necessita_interdicao ? "Imediato" : "7 dias",
    closing_evidence: "Foto do depois + parecer do responsável.",
    report_text: a.relatorio_proposto,
    norms_violated: "",
    root_cause: a.condicao_observada,
    consequences_list: a.perigos,
    probability: a.probabilidade,
    severity: a.severidade,
    risk_score: a.probabilidade * a.severidade,
    risk_class: riskClass as "baixo" | "medio" | "alto" | "critico",
    risk_class_reason: `Score ${a.probabilidade * a.severidade} (P${a.probabilidade}×S${a.severidade}).`,
    resources: "",
    execution_time: "",
    expected_gain: "",
    technical_opinion: a.relatorio_proposto,
    raw: a,
  };
}

/** Texto humano-legível para o botão “Analisar com IA” dos cards e módulos. */
export function toReadableReport(a: IrisAnalysis): string {
  return [
    `DIAGNÓSTICO — ${a.descricao || a.titulo}`,
    a.condicao_observada ? `Condição observada: ${a.condicao_observada}` : null,
    "",
    `RISCOS IDENTIFICADOS`,
    ...(a.riscos.length ? a.riscos.map((r) => `• ${r}`) : ["• (nenhum risco relevante identificado)"]),
    a.perigos.length ? `Perigos: ${a.perigos.join("; ")}` : null,
    "",
    `CLASSIFICAÇÃO`,
    `Tipo: ${a.tipo_registro}`,
    `Nível de risco: ${a.nivel_risco} (P${a.probabilidade} × S${a.severidade} = ${a.probabilidade * a.severidade})`,
    a.necessita_interdicao ? "⚠ Recomenda INTERDIÇÃO imediata." : null,
    "",
    `MODELO PROPOSTO DE AÇÃO`,
    `Ação imediata: ${a.acao_imediata || "-"}`,
    `Ação corretiva: ${a.acao_corretiva || "-"}`,
    `Ação preventiva: ${a.acao_preventiva || "-"}`,
    "",
    `RELATÓRIO`,
    a.relatorio_proposto || "-",
    "",
    `Confiança da análise: ${a.score_confianca}%`,
    "",
    "AVISO: As ações propostas pela IA devem ser avaliadas e validadas pelos responsáveis antes da execução.",
  ]
    .filter(Boolean)
    .join("\n");
}
