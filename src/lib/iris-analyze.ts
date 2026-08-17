// Cliente único de análise IA — hoje aponta para a API da VPS via /api/vps/*.
// Toda análise passa por aqui. Sem fallback Gemini.

import { supabase } from "@/integrations/supabase/client";
import { callVpsRoute } from "@/lib/vps-ai/call";

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
    if (error) throw new Error("Sua sessão expirou. Faça login novamente.");
  }
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
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
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
      mensagem: string;
      rotulo?: string;
    }
  | {
      tipo: "plano_correcao_visual";
      imageUrl: null;
      imagemGerada: false;
      mensagem: string;
      planoCorrecao: IrisVisualCorrectionPlan;
    };

export async function analisarComIris(input: {
  image?: string;
  images?: string[];
  context?: string;
}): Promise<IrisAnalysis> {
  await ensureFreshSession();
  const images = input.images ?? (input.image ? [input.image] : []);
  const primary = images[0];
  const payload: Record<string, unknown> = {
    mode: "analyze",
    prompt: input.context,
    context: { images, contextText: input.context },
  };
  if (primary?.startsWith("data:")) payload.imageBase64 = primary;
  else if (primary?.startsWith("http")) payload.imageUrl = primary;

  const data = await callVpsRoute<IrisAnalysis | { error: string }>("/api/vps/analisar", payload);
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  return data as IrisAnalysis;
}

export async function chamarIrisChat(input: {
  messages: IrisChatMessage[];
  response_format?: unknown;
}): Promise<{ choices: Array<{ message: { content?: string } }> }> {
  await ensureFreshSession();
  const data = await callVpsRoute<
    { choices?: Array<{ message: { content?: string } }> } | { error: string }
  >("/api/vps/analisar", {
    mode: "chat",
    messages: input.messages,
    response_format: input.response_format,
  });
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  return {
    choices: (data as { choices?: Array<{ message: { content?: string } }> }).choices ?? [],
  };
}

function normalizeVisualPlan(value: unknown): IrisVisualCorrectionPlan {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
  return {
    condicao_final_esperada:
      typeof o.condicao_final_esperada === "string"
        ? o.condicao_final_esperada
        : "Área corrigida e segura conforme a ação definitiva indicada.",
    itens_remover: list(o.itens_remover),
    itens_reparar: list(o.itens_reparar),
    limpeza_necessaria: list(o.limpeza_necessaria),
    sinalizacao_necessaria: list(o.sinalizacao_necessaria),
    isolamento_necessario: list(o.isolamento_necessario),
    melhorias_recomendadas: list(o.melhorias_recomendadas),
    checklist_foto_final: list(o.checklist_foto_final),
  };
}

export async function gerarSimulacaoComIris(input: {
  image: string;
  prompt: string;
  solution?: string;
  analysis?: Record<string, unknown>;
  sceneDescription?: string;
  detectedRisks?: string[];
  selectedCorrections?: string[];
  signal?: AbortSignal;
  onProgress?: (pct: number, label: string) => void;
}): Promise<IrisSimulationResult> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(input.image);
  if (!m) throw new Error("Foto Antes em formato inválido.");
  const corrections = input.selectedCorrections?.filter(Boolean) ?? [];
  if (corrections.length === 0) {
    const seed = (input.solution || input.prompt || "").trim();
    if (seed) corrections.push(seed);
  }

  await ensureFreshSession();
  input.onProgress?.(30, "Criando job na VPS");

  // 1. Cria job
  const start = await callVpsRoute<{ jobId?: string; error?: string }>(
    "/api/vps/generate-after",
    {
      imageBase64: input.image,
      sceneDescription: input.sceneDescription ?? input.prompt,
      detectedRisks: input.detectedRisks ?? [],
      selectedCorrections: corrections,
      generationMode: "final",
    },
    { signal: input.signal },
  );
  if (!start.jobId) {
    return {
      tipo: "plano_correcao_visual",
      imageUrl: null,
      imagemGerada: false,
      mensagem:
        start.error ??
        "O gerador de imagens da VPS está indisponível. Nenhum crédito foi descontado.",
      planoCorrecao: normalizeVisualPlan(null),
    };
  }

  // 2. Polling
  input.onProgress?.(50, "Gerando imagem");
  const jobId = start.jobId;
  let attempts = 0;
  while (attempts < 120) {
    if (input.signal?.aborted) throw new Error("Cancelado pelo usuário.");
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;
    const j = await callVpsRoute<{
      status: string;
      progress?: number;
      resultUrl?: string;
      imageBase64?: string;
      imageMimeType?: string;
      error?: string;
    }>(`/api/vps/jobs/${encodeURIComponent(jobId)}`, undefined, { method: "GET" });

    if (typeof j.progress === "number") input.onProgress?.(50 + j.progress / 2, j.status);

    if (j.status === "completed") {
      const url =
        j.resultUrl ??
        (j.imageBase64 ? `data:${j.imageMimeType ?? "image/png"};base64,${j.imageBase64}` : null);
      if (!url) throw new Error("Job completo sem imagem.");
      return {
        tipo: "simulacao_visual",
        imageUrl: url,
        imagemGerada: true,
        mensagem: "Imagem corrigida gerada com sucesso.",
        rotulo: "Imagem gerada por IA",
      };
    }
    if (j.status === "failed" || j.status === "cancelled") {
      return {
        tipo: "plano_correcao_visual",
        imageUrl: null,
        imagemGerada: false,
        mensagem: j.error ?? "Falha ao gerar a imagem.",
        planoCorrecao: normalizeVisualPlan(null),
      };
    }
  }
  throw new Error("Tempo esgotado aguardando a imagem.");
}

export async function analisarAmbienteComIris(input: {
  imageUrls: string[];
  area?: string | null;
  location?: string | null;
  equipment?: string | null;
  description?: string | null;
}): Promise<Record<string, unknown>> {
  await ensureFreshSession();
  const data = await callVpsRoute<Record<string, unknown> | { error: string }>(
    "/api/vps/analisar",
    { mode: "environment-before", ...input },
  );
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error((data as { error?: string })?.error ?? "Resposta inválida da IA.");
  }
  return data as Record<string, unknown>;
}

export async function transcreverAudioComIris(audio: Blob): Promise<string> {
  const audioData = await blobToDataUrl(audio);
  await ensureFreshSession();
  const data = await callVpsRoute<{ text?: string; error?: string }>("/api/vps/analisar", {
    mode: "transcribe",
    audio: audioData,
  });
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error((data as { error?: string })?.error ?? "Falha na transcrição");
  }
  return data.text ?? "";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler áudio"));
    reader.readAsDataURL(blob);
  });
}

export async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar imagem.");
  const blob = await res.blob();
  return blobToDataUrl(blob);
}

export function toReadableReport(a: IrisAnalysis | Record<string, unknown>): string {
  const x = a as IrisAnalysis;
  const lines: string[] = [];
  if (x.titulo) lines.push(`**${x.titulo}**`);
  if (x.tipo_registro) lines.push(`Tipo: ${x.tipo_registro}`);
  if (x.nivel_risco) lines.push(`Nível de risco: ${x.nivel_risco}`);
  if (x.descricao) lines.push("", x.descricao);
  if (x.condicao_observada) lines.push("", `Condição observada: ${x.condicao_observada}`);
  if (Array.isArray(x.perigos) && x.perigos.length)
    lines.push("", "Perigos:", ...x.perigos.map((p) => `• ${p}`));
  if (Array.isArray(x.riscos) && x.riscos.length)
    lines.push("", "Riscos:", ...x.riscos.map((p) => `• ${p}`));
  if (x.acao_imediata) lines.push("", `Ação imediata: ${x.acao_imediata}`);
  if (x.acao_corretiva) lines.push(`Ação corretiva: ${x.acao_corretiva}`);
  if (x.acao_preventiva) lines.push(`Ação preventiva: ${x.acao_preventiva}`);
  if (x.relatorio_proposto) lines.push("", x.relatorio_proposto);
  return lines.join("\n");
}

export function toPhotoDialogResult(
  a: IrisAnalysis | Record<string, unknown>,
): Record<string, unknown> {
  const x = a as IrisAnalysis;
  return {
    titulo: x.titulo,
    tipo_registro: x.tipo_registro,
    descricao: x.descricao,
    condicao_observada: x.condicao_observada,
    perigos: x.perigos ?? [],
    riscos: x.riscos ?? [],
    nivel_risco: x.nivel_risco,
    probabilidade: x.probabilidade,
    severidade: x.severidade,
    acao_imediata: x.acao_imediata,
    acao_corretiva: x.acao_corretiva,
    acao_preventiva: x.acao_preventiva,
    score_confianca: x.score_confianca,
    necessita_interdicao: x.necessita_interdicao,
    relatorio_proposto: x.relatorio_proposto,
    ...(a as Record<string, unknown>),
  };
}
