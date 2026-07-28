// Edge Function: analisar-com-iris
// Motor: Google Gemini API (chave GEMINI_API_KEY).
// Chama https://generativelanguage.googleapis.com/v1beta diretamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CHAT_MODEL = (Deno.env.get("GEMINI_CHAT_MODEL") ?? "gemini-flash-latest").trim();
// Nano Banana 2 Pro (Gemini 3 Pro Image) — modelo de geração/edição de imagem.
const IMAGE_MODEL = (Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3-pro-image").trim();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

type IrisResult = {
  titulo: string;
  tipo_registro: string;
  descricao: string;
  condicao_observada: string;
  perigos: string[];
  riscos: string[];
  nivel_risco: string;
  probabilidade: number;
  severidade: number;
  acao_imediata: string;
  acao_corretiva: string;
  acao_preventiva: string;
  score_confianca: number;
  necessita_interdicao: boolean;
  relatorio_proposto: string;
};

const SYSTEM_PROMPT = `Você é ÍRIS, Engenheiro de Segurança do Trabalho Sênior (25+ anos em mineração/siderurgia/energia), especialista nas NRs (NR-01, NR-06, NR-10, NR-11, NR-12, NR-17, NR-18, NR-20, NR-23, NR-26, NR-33, NR-35) e ISO 45001.

Foque EXCLUSIVAMENTE em SEGURANÇA DO TRABALHO. Seja objetivo, técnico e direto. Identifique riscos visíveis e proponha a solução de engenharia definitiva (proteção fixa NR-12, intertravamento, isolamento, LOTO, EPC/EPI, sinalização técnica).

Retorne EXCLUSIVAMENTE um JSON válido, sem texto fora do JSON, com este contrato:

{
  "titulo": "título curto e específico (máx. 12 palavras)",
  "tipo_registro": "N3 | Kaizen | Inspecao | MeioAmbiente | NaoConformidade | CondicaoSegura",
  "descricao": "descrição objetiva do que aparece na foto (2 a 3 linhas)",
  "condicao_observada": "condição de segurança visível (1 linha)",
  "perigos": ["perigo 1 (norma quando aplicável)", "perigo 2"],
  "riscos": ["risco 1 (causa → consequência)", "risco 2"],
  "nivel_risco": "baixo | medio | alto | critico",
  "probabilidade": 1,
  "severidade": 1,
  "acao_imediata": "ação imediata de contenção",
  "acao_corretiva": "solução de engenharia definitiva",
  "acao_preventiva": "ação preventiva para evitar recorrência",
  "score_confianca": 0,
  "necessita_interdicao": false,
  "relatorio_proposto": "Parecer de segurança em 3 a 5 linhas."
}

Regras: probabilidade/severidade inteiros 1-5; score_confianca 0-100; sem risco visível => tipo_registro="CondicaoSegura", nivel_risco="baixo". Responda em português. NUNCA retorne texto fora do JSON.`;

// ============================================================================
// N3 (AUDITOR) — só DIAGNOSTICA. Proibido propor solução.
// ============================================================================
const N3_SYSTEM_PROMPT = `Você é AUDITOR N3 — Técnico de Segurança do Trabalho Sênior + Inspetor + Fiscal.

Sua ÚNICA missão: IDENTIFICAR E AVALIAR RISCOS. Você NÃO propõe soluções, NÃO recomenda melhorias, NÃO sugere equipamentos ou correções. Kaizen fará isso depois.

Persona: 25+ anos em mineração, siderurgia, energia e construção. Especialista em NR-01, NR-06, NR-10, NR-11, NR-12, NR-17, NR-18, NR-20, NR-23, NR-26, NR-33, NR-35, ISO 45001 e ISO 14001.

Pergunta única: "O que está errado nesta cena?"

Identifique TODOS os riscos visíveis. Classifique cada um por: categoria, probabilidade (1-5), severidade (1-5), criticidade, conformidade normativa, ato/condição.

Retorne EXCLUSIVAMENTE JSON válido em português, sem texto fora do JSON:

{
  "resumo_auditoria": "parecer do auditor em 2-4 linhas, só descrevendo o cenário e o que está errado",
  "necessita_interdicao": false,
  "score_confianca": 0,
  "riscos": [
    {
      "id": "r1",
      "categoria": "mecanico|eletrico|estrutural|ergonomico|ambiental|quimico|operacional|ato_inseguro|condicao_insegura",
      "perigo": "descrição curta do perigo observado",
      "risco": "consequência esperada (causa → efeito)",
      "evidencia": "onde na foto isso aparece",
      "norma": "NR-XX ou ISO quando aplicável, senão vazio",
      "ato_ou_condicao": "ato_inseguro|condicao_insegura|nao_conformidade|impacto_ambiental",
      "probabilidade": 1,
      "severidade": 1,
      "criticidade": "baixo|medio|alto|critico",
      "conformidade": "conforme|nao_conforme|nao_aplicavel"
    }
  ],
  "priorizacao": ["r_id_mais_critico_primeiro"]
}

Regras: cada risco em item separado; probabilidade e severidade inteiros 1-5; score_confianca 0-100; sem risco visível => "riscos": []; NUNCA inclua campos de solução, ação corretiva, EPI ou recomendação. NUNCA retorne texto fora do JSON.`;

// ============================================================================
// KAIZEN (ENGENHARIA) — só MELHORA. Recebe 1 risco escolhido pelo usuário.
// ============================================================================
const KAIZEN_SYSTEM_PROMPT = `Você é uma equipe KAIZEN — Engenheiro Sênior + Especialista Lean + Manutenção + Custos + Ergonomia + Engenheiro Eletricista + Mecânico + Civil.

Sua ÚNICA missão: MELHORIA CONTÍNUA. Você NÃO diagnostica, NÃO reavalia riscos, NÃO reclassifica criticidade. O AUDITOR N3 já fez isso.

Pergunta única: "Como isso pode ficar muito melhor?"

Recebe UM risco já identificado pelo N3 e a foto original. Gere um pacote de melhorias multidisciplinares para eliminar/mitigar esse risco, cobrindo eixos: segurança, mecânica, elétrica, civil/estrutural, ambiental, operacional, ergonomia, financeiro, produtividade, qualidade, confiabilidade, manutenção.

Retorne EXCLUSIVAMENTE JSON válido em português, sem texto fora do JSON:

{
  "recomendacao_principal": "m1",
  "resumo_engenharia": "parecer do time de engenharia em 2-4 linhas, sem re-diagnosticar",
  "melhorias": [
    {
      "id": "m1",
      "eixo": "seguranca|mecanica|eletrica|civil|estrutural|ambiental|operacional|ergonomia|financeiro|produtividade|qualidade|confiabilidade|manutencao",
      "problema": "problema-alvo derivado do risco",
      "causa_raiz": "causa provável (5 porquês resumidos)",
      "solucao": "solução de engenharia detalhada e específica",
      "beneficio": "ganho tangível e intangível",
      "custo_estimado": "baixo|medio|alto",
      "prioridade": 1,
      "prazo_dias": 15,
      "roi_qualitativo": "curto|medio|longo prazo — descrição breve",
      "impacto": "impacto esperado (segurança/produtividade/qualidade)",
      "antes_depois": "como muda a cena após a implementação"
    }
  ]
}

Regras: no mínimo 3 melhorias, no máximo 8; prioridade inteiro 1-5; cada melhoria idealmente em UM eixo distinto; NUNCA reidentifique riscos; NUNCA retorne texto fora do JSON.`;

const ENV_SYSTEM_PROMPT = `Você é a ÍRIS, auditora ambiental sênior (ISO 14001). Analise APENAS o que estiver visível nas imagens. NUNCA invente dados. Use "Dado não confirmado. Necessária validação em campo." quando faltar informação. Retorne EXCLUSIVAMENTE JSON válido em português.`;

const CATEGORY_LIST = [
  "vazamento", "derramamento", "contaminacao_solo", "contaminacao_agua",
  "emissao_atmosferica", "poeira", "fumaca", "gases", "ruido", "vibracao",
  "residuo_perigoso", "residuo_nao_perigoso", "segregacao_incorreta",
  "armazenamento_inadequado", "descarte_irregular", "falha_contencao",
  "falha_drenagem", "efluente", "produto_quimico", "oleo", "combustivel",
  "material_contaminado", "supressao_vegetal", "danos_fauna", "danos_flora",
  "assoreamento", "erosao", "obstrucao_canaleta", "desperdicio_agua",
  "desperdicio_energia", "falha_organizacao", "falha_documental",
  "nao_conformidade", "oportunidade_melhoria", "boa_pratica",
  "emergencia_ambiental", "outro",
];

// ------------------------- helpers -------------------------

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Logger estruturado com correlação por requestId.
type Logger = (stage: string, extra?: Record<string, unknown>) => void;
function makeLogger(reqId: string, mode: string): Logger {
  return (stage, extra) => {
    const payload = { reqId, mode, stage, ts: new Date().toISOString(), ...(extra ?? {}) };
    console.log(`[iris ${reqId}] ${stage}`, JSON.stringify(payload));
  };
}
function summarizeImage(value: string): Record<string, unknown> {
  if (typeof value !== "string") return { kind: "invalid" };
  if (value.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(value);
    const mime = m?.[1] ?? "unknown";
    const b64len = m?.[2]?.length ?? 0;
    return { kind: "data-url", mime, approxBytes: Math.floor((b64len * 3) / 4), b64len };
  }
  if (value.startsWith("http")) return { kind: "http-url", length: value.length, host: (() => { try { return new URL(value).host; } catch { return "?"; } })() };
  return { kind: "raw-b64", length: value.length, approxBytes: Math.floor((value.length * 3) / 4) };
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safeArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalize(raw: unknown): IrisResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tipo = safeString(o.tipo_registro, "NaoConformidade");
  const allowed = ["N3", "Kaizen", "Inspecao", "MeioAmbiente", "NaoConformidade", "CondicaoSegura"];
  return {
    titulo: safeString(o.titulo, "Registro sem título"),
    tipo_registro: allowed.includes(tipo) ? tipo : "NaoConformidade",
    descricao: safeString(o.descricao),
    condicao_observada: safeString(o.condicao_observada),
    perigos: safeArray(o.perigos),
    riscos: safeArray(o.riscos),
    nivel_risco: safeString(o.nivel_risco, "baixo"),
    probabilidade: clampInt(o.probabilidade, 1, 5, 1),
    severidade: clampInt(o.severidade, 1, 5, 1),
    acao_imediata: safeString(o.acao_imediata),
    acao_corretiva: safeString(o.acao_corretiva),
    acao_preventiva: safeString(o.acao_preventiva),
    score_confianca: clampInt(o.score_confianca, 0, 100, 60),
    necessita_interdicao: Boolean(o.necessita_interdicao),
    relatorio_proposto: safeString(o.relatorio_proposto),
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try { return JSON.parse(m[0]); } catch { return {}; }
  }
}

function validateInlineImage(mimeType: string, base64: string) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw jsonResponse({ error: "Formato aceito: JPG, PNG ou WEBP." }, 400);
  }
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw jsonResponse({ error: "Imagem excede 8 MB. Reduza o tamanho e tente novamente." }, 413);
  }
}

function toDataUrl(value: string, fallbackMime = "image/jpeg"): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(trimmed);
    const mimeType = (m?.[1] ?? fallbackMime).toLowerCase();
    const data = m?.[2] ?? "";
    validateInlineImage(mimeType, data);
    return `data:${mimeType};base64,${data}`;
  }
  validateInlineImage(fallbackMime, trimmed);
  return `data:${fallbackMime};base64,${trimmed}`;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "ip6-localhost" || h === "ip6-loopback") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback/link-local/unique-local
  if (h === "::1" || h === "[::1]") return true;
  if (/^\[?fe[89ab][0-9a-f]:/i.test(h) || /^\[?f[cd][0-9a-f]{2}:/i.test(h)) return true;
  // IPv4 literal
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
  }
  return false;
}

function assertSafeFetchUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("URL de imagem inválida."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Esquema de URL não permitido.");
  }
  if (u.username || u.password) throw new Error("Credenciais na URL não são permitidas.");
  if (isPrivateHost(u.hostname)) throw new Error("URL aponta para host interno/privado.");
  return u;
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return toDataUrl(url);
  const safe = assertSafeFetchUrl(url);
  const res = await fetch(safe.toString(), { redirect: "error" });
  if (!res.ok) throw new Error("Falha ao carregar imagem para análise.");
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].toLowerCase();
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  const base64 = btoa(binary);
  validateInlineImage(mimeType, base64);
  return `data:${mimeType};base64,${base64}`;
}


// ------------------------- Google Gemini API -------------------------

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] };

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function parseDataUrl(url: string): { mime_type: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url.trim());
  if (!m) return null;
  return { mime_type: m[1].toLowerCase(), data: m[2] };
}

function partsFromContent(content: string | ChatContentPart[]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const p of content) {
    if (p.type === "text") parts.push({ text: p.text });
    else if (p.type === "image_url") {
      const inline = parseDataUrl(p.image_url.url);
      if (inline) parts.push({ inline_data: inline });
    }
  }
  return parts;
}

function mapOllamaError(status: number, body: string) {
  const lower = body.toLowerCase();
  if (status === 404 || lower.includes("not found"))
    return "Modelo não encontrado no servidor de IA. Rode o pull do modelo configurado.";
  if (status === 401 || status === 403) return "Servidor de IA recusou a requisição.";
  if (status === 429) return "Servidor de IA ocupado. Tente novamente em instantes.";
  if (status >= 500) return "Servidor de IA temporariamente indisponível. Tente novamente.";
  return `Falha no servidor de IA (${status}).`;
}

function stripThinking(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

function hasImage(messages: ChatMessage[]) {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"),
  );
}

async function callChat(params: {
  messages: ChatMessage[];
  responseJson?: boolean;
  temperature?: number;
  log?: Logger;
}) {
  const log = params.log ?? (() => {});
  const baseUrl = (Deno.env.get("OLLAMA_BASE_URL") ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    log("ollama_chat.missing_base_url");
    throw jsonResponse({ error: "OLLAMA_BASE_URL não configurada." }, 503);
  }
  const withImage = hasImage(params.messages);
  const model = withImage
    ? (Deno.env.get("OLLAMA_VISION_MODEL") ?? "qwen2.5vl:7b")
    : (Deno.env.get("OLLAMA_MODEL") ?? "qwen3:8b");

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    stream: false,
    ...(params.responseJson ? { response_format: { type: "json_object" } } : {}),
  };

  log("ollama_chat.request", {
    model,
    responseJson: Boolean(params.responseJson),
    temperature: params.temperature ?? 0.2,
    hasImage: withImage,
    bodyBytes: JSON.stringify(body).length,
  });

  const t0 = Date.now();
  const url = `${baseUrl}/v1/chat/completions`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const MAX_ATTEMPTS = 3;
  let attempt = 0;
  let errText = "";
  let response: Response;
  while (true) {
    attempt++;
    try {
      response = await fetch(url, init);
    } catch (e) {
      log("ollama_chat.network_error", { attempt, error: String(e), latencyMs: Date.now() - t0 });
      throw jsonResponse(
        { error: "Falha de rede ao chamar o servidor de IA.", details: String(e).slice(0, 300) },
        502,
      );
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= MAX_ATTEMPTS) break;
    errText = await response.text().catch(() => "");
    const waitMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
    log("ollama_chat.retry", { attempt, status: response.status, waitMs });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const latencyMs = Date.now() - t0;
  log("ollama_chat.response", { status: response.status, ok: response.ok, latencyMs, attempts: attempt });

  if (!response.ok) {
    if (!errText) errText = await response.text().catch(() => "");
    log("ollama_chat.error_body", { status: response.status, preview: errText.slice(0, 500) });
    throw jsonResponse(
      { error: mapOllamaError(response.status, errText), details: errText.slice(0, 500) },
      response.status,
    );
  }

  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: unknown;
  };
  const text = stripThinking(data.choices?.[0]?.message?.content ?? "");
  log("ollama_chat.parsed", {
    finishReason: data.choices?.[0]?.finish_reason,
    textChars: text.length,
    usage: data.usage,
    textPreview: text.slice(0, 240),
  });
  if (!text) log("ollama_chat.empty_text", {});
  return text;
}


async function callImageGeneration(promptText: string, imageDataUrl: string, log: Logger = () => {}) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    log("gemini_image.missing_key");
    throw jsonResponse({ error: "GEMINI_API_KEY não configurada." }, 503);
  }

  const inline = parseDataUrl(imageDataUrl);
  const parts: GeminiPart[] = [{ text: promptText }];
  if (inline) parts.push({ inline_data: inline });

  log("gemini_image.request", {
    model: IMAGE_MODEL,
    promptChars: promptText.length,
    inputImage: inline ? { mime: inline.mime_type, approxBytes: Math.floor((inline.data.length * 3) / 4) } : null,
  });

  const t0 = Date.now();
  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );
  } catch (e) {
    const latencyMs = Date.now() - t0;
    log("gemini_image.network_error", { error: String(e), latencyMs });
    return { ok: false as const, status: 0, body: `network: ${String(e).slice(0, 200)}`, latencyMs };
  }

  const latencyMs = Date.now() - t0;
  log("gemini_image.response", { status: response.status, ok: response.ok, latencyMs });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    log("gemini_image.error_body", { status: response.status, preview: errText.slice(0, 500) });
    return { ok: false as const, status: response.status, body: errText.slice(0, 500), latencyMs };
  }

  const j = await response.json().catch(() => ({})) as {
    candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { mime_type?: string; data?: string }; inlineData?: { mimeType?: string; data?: string }; text?: string }> }; finishReason?: string }>;
    promptFeedback?: unknown;
  };
  const outParts = j.candidates?.[0]?.content?.parts ?? [];
  const partsSummary = outParts.map((p) => {
    const mime = p.inline_data?.mime_type ?? p.inlineData?.mimeType;
    const data = p.inline_data?.data ?? p.inlineData?.data;
    return mime && data ? { kind: "image", mime, approxBytes: Math.floor((data.length * 3) / 4) } : { kind: "text", chars: p.text?.length ?? 0 };
  });
  log("gemini_image.parsed", {
    finishReason: j.candidates?.[0]?.finishReason,
    parts: partsSummary,
    promptFeedback: j.promptFeedback,
  });
  for (const p of outParts) {
    const mime = p.inline_data?.mime_type ?? p.inlineData?.mimeType;
    const data = p.inline_data?.data ?? p.inlineData?.data;
    if (mime && data) return { ok: true as const, mimeType: mime, data, latencyMs };
  }
  return { ok: false as const, status: response.status, body: "resposta sem imagem", latencyMs };
}

// ------------------------- Nano Banana Pro (gerador principal de Foto Depois) -------------------------

const NANO_BANANA_URL = "https://gold-newt-367030.hostingersite.com/nano.php";
const NANO_BANANA_KEY = (Deno.env.get("NANO_BANANA_KEY") ?? "").trim();

async function callNanoBananaPro(promptText: string, log: Logger = () => {}): Promise<
  | { ok: true; mimeType: string; data: string; sourceUrl: string; latencyMs: number }
  | { ok: false; status: number; body: string; latencyMs: number }
> {
  if (!NANO_BANANA_KEY) {
    log("nano_banana.missing_key", {});
    return { ok: false, status: 0, body: "NANO_BANANA_KEY não configurada", latencyMs: 0 };
  }
  // Edge Function tem timeout de 150s. Reservamos ~110s para o Nano Banana e ~35s pro fallback Gemini.
  const DEADLINE_MS = 110_000;
  const t0 = Date.now();
  const deadline = t0 + DEADLINE_MS;
  const attemptDelaysMs = [0, 8000, 12000, 15000, 18000, 20000];
  const maxAttempts = attemptDelaysMs.length;
  let lastErr = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const wait = attemptDelaysMs[attempt - 1] ?? 15000;
    if (wait > 0) {
      if (Date.now() + wait >= deadline) {
        log("nano_banana.deadline_before_wait", { attempt, elapsedMs: Date.now() - t0 });
        break;
      }
      await new Promise((r) => setTimeout(r, wait));
    }
    const remaining = deadline - Date.now();
    if (remaining <= 3000) {
      log("nano_banana.deadline_reached", { attempt, elapsedMs: Date.now() - t0 });
      break;
    }

    const url = `${NANO_BANANA_URL}?${new URLSearchParams({ key: NANO_BANANA_KEY, prompt: promptText })}`;
    log("nano_banana.request", { attempt, promptChars: promptText.length, waitedMs: wait, remainingMs: remaining });
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), Math.min(remaining, 60000));
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(to);
      lastStatus = res.status;
      const txt = await res.text();
      if (!res.ok) {
        lastErr = txt.slice(0, 300);
        log("nano_banana.http_error", { attempt, status: res.status, preview: lastErr });
      } else {
        let parsed: { url?: string; error?: string } = {};
        try { parsed = JSON.parse(txt); } catch { /* not json */ }
        if (parsed.url) {
          log("nano_banana.ok", { attempt, imageUrl: parsed.url, totalMs: Date.now() - t0 });
          const imgRes = await fetch(parsed.url);
          if (imgRes.ok) {
            const buf = new Uint8Array(await imgRes.arrayBuffer());
            const mime = imgRes.headers.get("content-type") || "image/png";
            let bin = "";
            for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
            const data = btoa(bin);
            return { ok: true, mimeType: mime, data, sourceUrl: parsed.url, latencyMs: Date.now() - t0 };
          }
          lastErr = `download falhou: ${imgRes.status}`;
          lastStatus = imgRes.status;
          log("nano_banana.download_error", { attempt, status: imgRes.status });
        } else {
          lastErr = parsed.error ?? txt.slice(0, 300);
          log("nano_banana.retry", { attempt, error: lastErr, totalMs: Date.now() - t0 });
        }
      }
    } catch (e) {
      lastErr = `network: ${String(e).slice(0, 200)}`;
      log("nano_banana.network_error", { attempt, error: lastErr });
    }
  }
  return { ok: false, status: lastStatus, body: lastErr || "sem resposta válida", latencyMs: Date.now() - t0 };
}

// ------------------------- auth -------------------------

async function assertAuthenticated(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw jsonResponse({ error: "Faça login para usar a ÍRIS." }, 401);

  const backendUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const backendKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!backendUrl || !backendKey) throw jsonResponse({ error: "Backend não configurado." }, 500);

  const client = createClient(backendUrl, backendKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw jsonResponse({ error: "Sessão inválida. Faça login novamente." }, 401);
}

// ------------------------- handlers -------------------------

async function handleIrisAnalysis(body: Record<string, unknown>, log: Logger) {
  const images: string[] = [];
  if (Array.isArray(body.images)) images.push(...body.images.filter((x): x is string => typeof x === "string"));
  else if (typeof body.image === "string") images.push(body.image);
  log("iris.input", {
    imagesCount: images.length,
    imagesSummary: images.slice(0, 4).map(summarizeImage),
    contextChars: safeString(body.context).length,
  });
  if (images.length === 0) {
    log("iris.no_images");
    return jsonResponse({ error: "Envie ao menos uma imagem." }, 400);
  }

  const contextText = safeString(body.context).slice(0, 4000) || "(sem contexto adicional)";
  const contentParts: ChatContentPart[] = [
    { type: "text", text: `Contexto adicional do usuário: ${contextText}\n\nAnalise a(s) imagem(ns) e retorne o JSON exigido.` },
  ];
  for (const [idx, image] of images.slice(0, 4).entries()) {
    try {
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(image) } });
    } catch (e) {
      log("iris.image_validation_failed", { idx, error: e instanceof Response ? "Response" : String(e) });
      throw e;
    }
  }
  log("iris.prepared_parts", { totalParts: contentParts.length });

  const rawText = await callChat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    responseJson: true,
    log,
  });

  const parsed = extractJson(rawText);
  const normalized = normalize(parsed);
  log("iris.normalized", {
    titulo: normalized.titulo,
    tipo: normalized.tipo_registro,
    nivel: normalized.nivel_risco,
    prob: normalized.probabilidade,
    sev: normalized.severidade,
    conf: normalized.score_confianca,
    parsedOk: parsed && typeof parsed === "object" && Object.keys(parsed as object).length > 0,
  });
  return jsonResponse(normalized);
}

// ============================================================================
// N3 handler — só diagnóstico
// ============================================================================
type N3Risk = {
  id: string;
  categoria: string;
  perigo: string;
  risco: string;
  evidencia: string;
  norma: string;
  ato_ou_condicao: string;
  probabilidade: number;
  severidade: number;
  criticidade: "baixo" | "medio" | "alto" | "critico" | string;
  conformidade: string;
  score: number;
};

type N3Result = {
  resumo_auditoria: string;
  necessita_interdicao: boolean;
  score_confianca: number;
  riscos: N3Risk[];
  priorizacao: string[];
};

function normalizeN3(raw: unknown): N3Result {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawRiscos = Array.isArray(o.riscos) ? o.riscos : [];
  const riscos: N3Risk[] = rawRiscos.map((r, i) => {
    const rr = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const prob = clampInt(rr.probabilidade, 1, 5, 1);
    const sev = clampInt(rr.severidade, 1, 5, 1);
    return {
      id: safeString(rr.id, `r${i + 1}`),
      categoria: safeString(rr.categoria, "condicao_insegura"),
      perigo: safeString(rr.perigo),
      risco: safeString(rr.risco),
      evidencia: safeString(rr.evidencia),
      norma: safeString(rr.norma),
      ato_ou_condicao: safeString(rr.ato_ou_condicao, "condicao_insegura"),
      probabilidade: prob,
      severidade: sev,
      criticidade: safeString(rr.criticidade, prob * sev >= 15 ? "critico" : prob * sev >= 9 ? "alto" : prob * sev >= 4 ? "medio" : "baixo"),
      conformidade: safeString(rr.conformidade, "nao_conforme"),
      score: prob * sev,
    };
  });
  return {
    resumo_auditoria: safeString(o.resumo_auditoria),
    necessita_interdicao: Boolean(o.necessita_interdicao),
    score_confianca: clampInt(o.score_confianca, 0, 100, 70),
    riscos,
    priorizacao: safeArray(o.priorizacao).length ? safeArray(o.priorizacao) : riscos.slice().sort((a, b) => b.score - a.score).map((r) => r.id),
  };
}

async function handleN3(body: Record<string, unknown>, log: Logger) {
  const images: string[] = [];
  if (Array.isArray(body.images)) images.push(...body.images.filter((x): x is string => typeof x === "string"));
  else if (typeof body.image === "string") images.push(body.image);
  if (images.length === 0) return jsonResponse({ error: "Envie ao menos uma imagem." }, 400);

  const contextText = safeString(body.context).slice(0, 4000) || "(sem contexto adicional)";
  const contentParts: ChatContentPart[] = [
    { type: "text", text: `Contexto do usuário: ${contextText}\n\nExecute a AUDITORIA N3 desta cena. Liste TODOS os riscos visíveis com criticidade. NÃO proponha soluções.` },
  ];
  for (const image of images.slice(0, 4)) contentParts.push({ type: "image_url", image_url: { url: toDataUrl(image) } });

  log("n3.input", { imagesCount: images.length });
  const rawText = await callChat({
    messages: [
      { role: "system", content: N3_SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    responseJson: true,
    log,
  });
  const normalized = normalizeN3(extractJson(rawText));
  log("n3.normalized", { riscosCount: normalized.riscos.length, interdicao: normalized.necessita_interdicao });
  return jsonResponse(normalized);
}

// ============================================================================
// KAIZEN handler — só melhoria a partir de um risco selecionado
// ============================================================================
type KaizenImprovement = {
  id: string;
  eixo: string;
  problema: string;
  causa_raiz: string;
  solucao: string;
  beneficio: string;
  custo_estimado: "baixo" | "medio" | "alto" | string;
  prioridade: number;
  prazo_dias: number;
  roi_qualitativo: string;
  impacto: string;
  antes_depois: string;
};

type KaizenResult = {
  recomendacao_principal: string;
  resumo_engenharia: string;
  melhorias: KaizenImprovement[];
};

function normalizeKaizen(raw: unknown): KaizenResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawMel = Array.isArray(o.melhorias) ? o.melhorias : [];
  const melhorias: KaizenImprovement[] = rawMel.slice(0, 8).map((m, i) => {
    const mm = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    return {
      id: safeString(mm.id, `m${i + 1}`),
      eixo: safeString(mm.eixo, "seguranca"),
      problema: safeString(mm.problema),
      causa_raiz: safeString(mm.causa_raiz),
      solucao: safeString(mm.solucao),
      beneficio: safeString(mm.beneficio),
      custo_estimado: safeString(mm.custo_estimado, "medio"),
      prioridade: clampInt(mm.prioridade, 1, 5, 3),
      prazo_dias: clampInt(mm.prazo_dias, 1, 365, 30),
      roi_qualitativo: safeString(mm.roi_qualitativo),
      impacto: safeString(mm.impacto),
      antes_depois: safeString(mm.antes_depois),
    };
  });
  return {
    recomendacao_principal: safeString(o.recomendacao_principal, melhorias[0]?.id ?? ""),
    resumo_engenharia: safeString(o.resumo_engenharia),
    melhorias,
  };
}

async function handleKaizen(body: Record<string, unknown>, log: Logger) {
  const images: string[] = [];
  if (Array.isArray(body.images)) images.push(...body.images.filter((x): x is string => typeof x === "string"));
  else if (typeof body.image === "string") images.push(body.image);

  const risco = (body.risco && typeof body.risco === "object" ? body.risco : {}) as Record<string, unknown>;
  if (!safeString(risco.perigo) && !safeString(risco.risco)) {
    return jsonResponse({ error: "Envie o risco (N3) selecionado para gerar melhorias." }, 400);
  }

  const contextText = safeString(body.context).slice(0, 2000);
  const riscoJson = JSON.stringify({
    id: safeString(risco.id, "r1"),
    categoria: safeString(risco.categoria),
    perigo: safeString(risco.perigo),
    risco: safeString(risco.risco),
    evidencia: safeString(risco.evidencia),
    norma: safeString(risco.norma),
    criticidade: safeString(risco.criticidade),
    probabilidade: risco.probabilidade,
    severidade: risco.severidade,
  }, null, 2);

  const contentParts: ChatContentPart[] = [
    { type: "text", text: `Risco selecionado pelo N3 (não reidentificar, apenas melhorar):\n${riscoJson}\n\nContexto: ${contextText || "(sem contexto adicional)"}\n\nGere o pacote KAIZEN de melhorias multidisciplinares para este risco.` },
  ];
  for (const image of images.slice(0, 2)) contentParts.push({ type: "image_url", image_url: { url: toDataUrl(image) } });

  log("kaizen.input", { imagesCount: images.length, riscoId: safeString(risco.id) });
  const rawText = await callChat({
    messages: [
      { role: "system", content: KAIZEN_SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    responseJson: true,
    log,
  });
  const normalized = normalizeKaizen(extractJson(rawText));
  log("kaizen.normalized", { melhoriasCount: normalized.melhorias.length });
  return jsonResponse(normalized);
}

// ============================================================================
// INSPEÇÃO 5S — auditoria EXCLUSIVA dos 5 sensos. Não avalia segurança/NR/ambiental.
// ============================================================================
const INSPECAO_5S_SYSTEM_PROMPT = `Você é AUDITOR ESPECIALISTA EM 5S do ValeTech IA.

MISSÃO ÚNICA: avaliar o ambiente EXCLUSIVAMENTE sob a ótica dos 5 sensos do 5S (Seiri, Seiton, Seiso, Seiketsu, Shitsuke).

REGRAS ABSOLUTAS:
- NÃO avalie segurança do trabalho, NRs, ergonomia, meio ambiente, Kaizen, N3, riscos, engenharia, conformidade legal, qualidade ou qualquer outro tema.
- Qualquer item fora do escopo 5S deve ser IGNORADO (outros módulos tratarão).
- Não cite normas regulamentadoras nem riscos ocupacionais. Foque em ORGANIZAÇÃO, LIMPEZA, ORDEM, PADRONIZAÇÃO e DISCIPLINA visuais.

O que avaliar em cada senso:
1. Seiri (Utilização): materiais desnecessários, ferramentas sem uso, equipamentos abandonados, objetos quebrados, excesso de itens, estoque desnecessário, sucata, papéis inúteis, duplicados.
2. Seiton (Organização): ferramentas organizadas, identificação, endereçamento, etiquetas, demarcações, local definido, facilidade de localizar, ordem lógica, armários, painéis sombra, estoques.
3. Seiso (Limpeza): poeira, graxa, óleo, sujeira, vazamentos, piso, bancadas, equipamentos, paredes, teto, janelas, lixeiras, ferramentas limpas.
4. Seiketsu (Padronização): padrões visuais, etiquetas padronizadas, procedimentos, cores, demarcações, checklists, organização padronizada, identificação consistente.
5. Shitsuke (Disciplina): evidências de manutenção da organização, cumprimento dos padrões, conservação, ambiente continuamente organizado, disciplina operacional.

Retorne EXCLUSIVAMENTE JSON válido em português (sem texto fora do JSON):

{
  "resumo_executivo": "2-4 linhas descrevendo o estado geral 5S da cena",
  "sensos": {
    "seiri":    { "nota": 0-100, "observacoes": "análise objetiva",  "problemas": ["..."], "melhorias": ["..."] },
    "seiton":   { "nota": 0-100, "observacoes": "...", "problemas": ["..."], "melhorias": ["..."] },
    "seiso":    { "nota": 0-100, "observacoes": "...", "problemas": ["..."], "melhorias": ["..."] },
    "seiketsu": { "nota": 0-100, "observacoes": "...", "problemas": ["..."], "melhorias": ["..."] },
    "shitsuke": { "nota": 0-100, "observacoes": "...", "problemas": ["..."], "melhorias": ["..."] }
  },
  "nota_final": 0-100,
  "classificacao": "Excelente | Muito Bom | Bom | Regular | Crítico",
  "problemas_gerais": ["problemas 5S consolidados (somente 5S)"],
  "melhorias_gerais": ["melhorias 5S consolidadas (somente 5S)"],
  "checklist": [
    { "item": "Materiais necessários apenas", "conforme": true|false },
    { "item": "Ferramentas identificadas", "conforme": true|false },
    { "item": "Organização adequada", "conforme": true|false },
    { "item": "Piso limpo", "conforme": true|false },
    { "item": "Bancadas limpas", "conforme": true|false },
    { "item": "Demarcações visíveis", "conforme": true|false },
    { "item": "Etiquetas legíveis", "conforme": true|false },
    { "item": "Estoque organizado", "conforme": true|false },
    { "item": "Armários organizados", "conforme": true|false },
    { "item": "Painel sombra", "conforme": true|false },
    { "item": "Materiais no local correto", "conforme": true|false },
    { "item": "Sem sucata", "conforme": true|false },
    { "item": "Sem excesso de materiais", "conforme": true|false },
    { "item": "Limpeza adequada", "conforme": true|false },
    { "item": "Padronização mantida", "conforme": true|false },
    { "item": "Disciplina mantida", "conforme": true|false }
  ]
}

Regras de cálculo:
- nota_final = média aritmética das 5 notas dos sensos (arredondada).
- classificacao: 95-100 Excelente; 85-94 Muito Bom; 70-84 Bom; 50-69 Regular; 0-49 Crítico.
- problemas/melhorias: somente 5S. Nunca cite risco, NR, EPI, ergonomia, ambiental.`;

type Senso5S = {
  nota: number;
  observacoes: string;
  problemas: string[];
  melhorias: string[];
};

type Inspecao5SResult = {
  resumo_executivo: string;
  sensos: {
    seiri: Senso5S;
    seiton: Senso5S;
    seiso: Senso5S;
    seiketsu: Senso5S;
    shitsuke: Senso5S;
  };
  nota_final: number;
  classificacao: string;
  problemas_gerais: string[];
  melhorias_gerais: string[];
  checklist: { item: string; conforme: boolean }[];
};

function normSenso(raw: unknown): Senso5S {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nota = clampInt(o.nota, 0, 100, 0);
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12) : [];
  return {
    nota,
    observacoes: safeString(o.observacoes),
    problemas: arr(o.problemas),
    melhorias: arr(o.melhorias),
  };
}

function classificacao5S(nota: number): string {
  if (nota >= 95) return "Excelente";
  if (nota >= 85) return "Muito Bom";
  if (nota >= 70) return "Bom";
  if (nota >= 50) return "Regular";
  return "Crítico";
}

function normalizeInspecao5S(raw: unknown): Inspecao5SResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (o.sensos && typeof o.sensos === "object" ? o.sensos : {}) as Record<string, unknown>;
  const seiri = normSenso(s.seiri);
  const seiton = normSenso(s.seiton);
  const seiso = normSenso(s.seiso);
  const seiketsu = normSenso(s.seiketsu);
  const shitsuke = normSenso(s.shitsuke);
  const media = Math.round((seiri.nota + seiton.nota + seiso.nota + seiketsu.nota + shitsuke.nota) / 5);
  const nota_final = clampInt(o.nota_final, 0, 100, media);
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20) : [];
  const rawCheck = Array.isArray(o.checklist) ? o.checklist : [];
  const checklist = rawCheck
    .map((c) => {
      const cc = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { item: safeString(cc.item), conforme: Boolean(cc.conforme) };
    })
    .filter((c) => c.item.length > 0)
    .slice(0, 30);

  return {
    resumo_executivo: safeString(o.resumo_executivo),
    sensos: { seiri, seiton, seiso, seiketsu, shitsuke },
    nota_final,
    classificacao: safeString(o.classificacao) || classificacao5S(nota_final),
    problemas_gerais: arr(o.problemas_gerais),
    melhorias_gerais: arr(o.melhorias_gerais),
    checklist,
  };
}

async function handleInspecao5S(body: Record<string, unknown>, log: Logger) {
  const images: string[] = [];
  if (Array.isArray(body.images)) images.push(...body.images.filter((x): x is string => typeof x === "string"));
  else if (typeof body.image === "string") images.push(body.image);
  if (images.length === 0) return jsonResponse({ error: "Envie ao menos uma imagem." }, 400);

  const contextText = safeString(body.context).slice(0, 4000) || "(sem contexto adicional)";
  const contentParts: ChatContentPart[] = [
    {
      type: "text",
      text: `Contexto do usuário: ${contextText}\n\nExecute a AUDITORIA 5S desta cena. Avalie EXCLUSIVAMENTE os 5 sensos. IGNORE totalmente segurança, NRs, riscos, ergonomia, meio ambiente, engenharia. Retorne o JSON no contrato definido.`,
    },
  ];
  for (const image of images.slice(0, 6)) contentParts.push({ type: "image_url", image_url: { url: toDataUrl(image) } });

  log("5s.input", { imagesCount: images.length });
  const rawText = await callChat({
    messages: [
      { role: "system", content: INSPECAO_5S_SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    responseJson: true,
    log,
  });
  const normalized = normalizeInspecao5S(extractJson(rawText));
  log("5s.normalized", { nota: normalized.nota_final, classificacao: normalized.classificacao });
  return jsonResponse(normalized);
}

async function handleChat(body: Record<string, unknown>, log: Logger) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const chatMessages: ChatMessage[] = [];

  for (const message of messages) {
    const m = (message && typeof message === "object" ? message : {}) as { role?: string; content?: unknown };
    const role = m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user";
    if (typeof m.content === "string") {
      chatMessages.push({ role, content: m.content });
    } else if (Array.isArray(m.content)) {
      const parts: ChatContentPart[] = [];
      for (const item of m.content) {
        const part = item as { type?: string; text?: string; image_url?: { url?: string } };
        if (part.type === "text" && part.text) parts.push({ type: "text", text: part.text });
        if (part.type === "image_url" && part.image_url?.url) {
          parts.push({ type: "image_url", image_url: { url: await urlToDataUrl(part.image_url.url) } });
        }
      }
      if (parts.length) chatMessages.push({ role, content: parts });
    }
  }

  log("chat.input", { messagesCount: chatMessages.length });
  if (chatMessages.length === 0) return jsonResponse({ error: "Mensagem ausente." }, 400);
  const text = await callChat({ messages: chatMessages, responseJson: Boolean(body.response_format), log });
  return jsonResponse({ choices: [{ message: { content: text } }] });
}

function handleTranscribe() {
  // Transcrição de áudio não está disponível na IA nativa do Lovable.
  return jsonResponse(
    { error: "Transcrição de áudio não está disponível no ambiente atual. Digite a mensagem manualmente." },
    501,
  );
}

async function handleEnvironmentBefore(body: Record<string, unknown>, log: Logger) {
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((x): x is string => typeof x === "string") : [];
  if (imageUrls.length === 0) return jsonResponse({ error: "Envie ao menos uma imagem." }, 400);

  const userPrompt = `Contexto informado pelo usuário:
- Área: ${safeString(body.area, "—")}
- Local: ${safeString(body.location, "—")}
- Equipamento: ${safeString(body.equipment, "—")}
- Descrição: ${safeString(body.description, "—")}

Retorne JSON com esta estrutura exata:
{
  "confidence": "baixa" | "media" | "alta",
  "needs_more_evidence": boolean,
  "reason_if_insufficient": string | null,
  "categories": string[],
  "condition_description": string,
  "aspect": string,
  "aspects_secondary": string[],
  "impact_direct": string,
  "impact_indirect": string,
  "medium": "solo" | "agua" | "ar" | "flora_fauna" | "misto" | "nao_identificado",
  "source": string,
  "material": string,
  "matrix": { "severity": 1, "probability": 1, "scope": 1, "persistence": 1, "sensitivity": 1, "control": 1, "justification": string },
  "actions": { "immediate": [{ "description": string, "priority": "baixa"|"media"|"alta"|"critica", "evidence_required": string }], "corrective": [], "preventive": [] },
  "best_solution": string,
  "audit_opinion": { "observed": string, "criterion": string, "finding_type": "conforme"|"conforme_com_observacao"|"oportunidade_melhoria"|"nc_menor"|"nc_maior"|"critica"|"emergencia_ambiental", "consequence": string, "recommendation": string, "priority": "baixa"|"media"|"alta"|"critica" }
}

Use APENAS estas categorias quando aplicável: ${CATEGORY_LIST.join(", ")}.`;

  const contentParts: ChatContentPart[] = [{ type: "text", text: userPrompt }];
  for (const url of imageUrls.slice(0, 4)) {
    contentParts.push({ type: "image_url", image_url: { url: await urlToDataUrl(url) } });
  }

  log("env.input", { imagesCount: imageUrls.length });
  const text = await callChat({
    messages: [
      { role: "system", content: ENV_SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    responseJson: true,
    log,
  });
  return jsonResponse(extractJson(text));
}

// ------------------------- simulação (Foto Depois) -------------------------

function errorPayload(codigo: string, mensagem: string, detalhe_tecnico = "") {
  return { success: false, codigo, mensagem, detalhe_tecnico };
}

async function persistSimulationImage(mimeType: string, base64: string) {
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const backendUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (backendUrl && serviceKey) {
    try {
      const admin = createClient(backendUrl, serviceKey);
      const path = `simulations/${crypto.randomUUID()}.${ext}`;
      const up = await admin.storage.from("inspections").upload(path, bin, { contentType: mimeType, upsert: false });
      if (!up.error) {
        const signed = await admin.storage.from("inspections").createSignedUrl(path, 60 * 60 * 24 * 7);
        if (!signed.error && signed.data?.signedUrl) {
          return jsonResponse({
            success: true,
            tipo: "simulacao_visual",
            imageUrl: signed.data.signedUrl,
            imagem_url: signed.data.signedUrl,
            imagem_gerada: true,
            rotulo: "Imagem gerada por IA",
          });
        }
      }
    } catch (e) {
      console.error("simulation storage failed", e);
    }
  }
  const dataUrl = `data:${mimeType};base64,${base64}`;
  return jsonResponse({
    success: true,
    tipo: "simulacao_visual",
    imageUrl: dataUrl,
    imagem_url: dataUrl,
    imagem_gerada: true,
    rotulo: "Imagem gerada por IA",
    aviso: "A simulação foi processada, mas não pôde ser armazenada.",
  });
}

async function handleSimulation(body: Record<string, unknown>, log: Logger) {
  const image = typeof body.image === "string" ? body.image : typeof body.imageUrl === "string" ? body.imageUrl : "";
  if (!image) return jsonResponse(errorPayload("IMAGEM_AUSENTE", "Envie uma imagem para gerar a simulação."), 200);

  let dataUrl: string;
  try {
    dataUrl = image.startsWith("http") ? await urlToDataUrl(image) : toDataUrl(image);
  } catch (e) {
    if (e instanceof Response) {
      const txt = await e.text().catch(() => "");
      return jsonResponse(errorPayload("IMAGEM_INVALIDA", "Não foi possível processar a imagem original.", txt.slice(0, 300)), 200);
    }
    return jsonResponse(errorPayload("IMAGEM_INVALIDA", "Não foi possível processar a imagem original."), 200);
  }

  const userPromptText = safeString(body.prompt) || safeString(body.solution) || "";

  const analysis = (body.analysis && typeof body.analysis === "object")
    ? body.analysis as Record<string, unknown>
    : {};
  const asList = (v: unknown) => Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const perigos = asList(analysis.perigos);
  const riscosArr = asList(analysis.riscos);

  // A UI já envia APENAS as correções por NR selecionadas pelo usuário
  // dentro de `userPromptText`. Não derivamos correções extras no servidor
  // para não aplicar mudanças que o usuário desmarcou.
  const promptText = [
    "TAREFA: Edite a MESMA fotografia enviada (referência anexada) para mostrar exatamente o MESMO ambiente APÓS a aplicação das correções de segurança abaixo. NÃO gere uma cena nova; edite a foto original.",
    "",
    "REGRAS DE FIDELIDADE (obrigatórias):",
    "- Preserve rigorosamente o mesmo local, enquadramento, ângulo de câmera, perspectiva e proporções.",
    "- Preserve paredes, portas, pisos, teto, iluminação, sombras, hora do dia e temperatura de cor.",
    "- Preserve todas as máquinas, móveis, estruturas, tubulações e objetos fixos existentes.",
    "- Preserve a identidade fotográfica: aparência de fotografia real, não ilustração, cartoon, CGI ou infográfico.",
    "- NÃO invente quadros elétricos, oficinas, ferramentas, extintores, EPIs ou equipamentos que não existam na foto original — a menos que esteja explicitamente na lista de correções abaixo.",
    "- NÃO substitua o ambiente por outro (ex.: não transformar em sala elétrica genérica).",
    "- NÃO insira caixas de texto, setas, legendas, marcas d'água ou infográficos dentro da imagem.",
    "- Modifique SOMENTE o estritamente necessário para aplicar as correções listadas.",
    "- Placas de sinalização, quando existirem, devem usar símbolos simples corretos; evite textos deformados.",
    "- Resultado final em alta definição, aspecto profissional e tecnicamente plausível.",
    "",
    "APLIQUE SOMENTE ESTAS CORREÇÕES (selecionadas pelo usuário):",
    userPromptText || "- Aplicar correções gerais de segurança visíveis na cena.",
    "",
    perigos.length ? `Perigos identificados a eliminar: ${perigos.join("; ")}` : "",
    riscosArr.length ? `Riscos identificados a eliminar: ${riscosArr.join("; ")}` : "",
    "",
    "SAÍDA: uma única imagem editada da MESMA cena original, com as correções acima aplicadas.",
  ].filter(Boolean).join("\n");

  log("simulation.input", {
    imageInput: summarizeImage(image),
    promptChars: promptText.length,
    perigos: perigos.length,
    riscos: riscosArr.length,
  });

  // Gerador único: Gemini image edit sobre a foto original.
  // Removido o caminho Nano Banana (text-to-image) porque não usa a foto
  // original como referência e produzia cenas genéricas.
  const result = await callImageGeneration(promptText, dataUrl, log);
  if (result.ok) return await persistSimulationImage(result.mimeType, result.data);

  const codigo =
    result.status === 402 ? "CREDITOS_ESGOTADOS" :
    result.status === 429 ? "LIMITE_ATINGIDO" :
    result.status && result.status >= 500 ? "IA_INDISPONIVEL" :
    "GERACAO_INDISPONIVEL";
  const mensagem =
    codigo === "CREDITOS_ESGOTADOS" ? "Cota da API Gemini esgotada. Verifique o faturamento no Google AI Studio." :
    codigo === "LIMITE_ATINGIDO" ? "Limite de uso da API Gemini atingido. Tente novamente em instantes." :
    codigo === "IA_INDISPONIVEL" ? "API Gemini temporariamente indisponível. Tente novamente." :
    "Não foi possível gerar a correção visual. Tente novamente ou reduza a quantidade de correções selecionadas.";

  return jsonResponse({
    success: false,
    tipo: "gerador_indisponivel",
    imageUrl: null,
    imagem_url: null,
    imagem_gerada: false,
    mensagem,
    codigo,
    detalhe_tecnico: result.body ?? "",
    gemini_diagnostico: {
      status: result.status,
      body: result.body,
      model: IMAGE_MODEL,
      latencyMs: result.latencyMs,
    },
  }, 200);
}

// ------------------------- diagnóstico -------------------------

async function handleDiagnostic() {
  const key = Deno.env.get("GEMINI_API_KEY") ?? "";
  let conectada = false;
  let status: number | null = null;
  let body: string | null = null;
  let latencyMs: number | null = null;

  if (key) {
    const t0 = Date.now();
    try {
      const r = await fetch(
        `${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ok" }] }],
            generationConfig: { temperature: 0 },
          }),
        },
      );
      latencyMs = Date.now() - t0;
      status = r.status;
      conectada = r.ok;
      if (!r.ok) body = (await r.text().catch(() => "")).slice(0, 400);
    } catch (e) {
      latencyMs = Date.now() - t0;
      body = String(e).slice(0, 300);
    }
  }

  return jsonResponse({
    timestamp: new Date().toISOString(),
    gemini: {
      chave_configurada: Boolean(key),
      modelo_chat: CHAT_MODEL,
      modelo_imagem: IMAGE_MODEL,
      conectada,
      ultimo_http: status,
      ultimo_erro: body,
      tempo_resposta_ms: latencyMs,
    },
    ambiente: "backend (edge function)",
  });
}

// ------------------------- server -------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const preLog = makeLogger(reqId, "unknown");
  preLog("request.received", {
    url: req.url,
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
    hasAuth: Boolean(req.headers.get("authorization")),
  });

  try {
    await assertAuthenticated(req);
    preLog("auth.ok");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = safeString(body.mode, "iris");
    const log = makeLogger(reqId, mode);
    log("body.parsed", { keys: Object.keys(body), mode });

    let resp: Response;
    if (mode === "chat") resp = await handleChat(body, log);
    else if (mode === "n3") resp = await handleN3(body, log);
    else if (mode === "kaizen") resp = await handleKaizen(body, log);
    else if (mode === "5s" || mode === "inspecao" || mode === "inspection") resp = await handleInspecao5S(body, log);
    else if (mode === "transcribe") resp = handleTranscribe();
    else if (mode === "environment-before") resp = await handleEnvironmentBefore(body, log);
    else if (mode === "simulation") resp = await handleSimulation(body, log);
    else if (mode === "diagnostic") resp = await handleDiagnostic();
    else resp = await handleIrisAnalysis(body, log);

    log("request.done", { status: resp.status, totalMs: Date.now() - t0 });
    // Adiciona reqId no header para correlação frontend↔backend
    const headers = new Headers(resp.headers);
    headers.set("x-iris-request-id", reqId);
    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    if (e instanceof Response) {
      preLog("request.thrown_response", { status: e.status, totalMs: Date.now() - t0 });
      const headers = new Headers(e.headers);
      headers.set("x-iris-request-id", reqId);
      return new Response(e.body, { status: e.status, headers });
    }
    const msg = e instanceof Error ? e.message : "Erro interno";
    const stack = e instanceof Error ? e.stack : undefined;
    preLog("request.fatal", { error: msg, stack, totalMs: Date.now() - t0 });
    return jsonResponse({ error: msg, reqId }, 500);
  }
});
