// Cliente da análise ambiental N3.
// Passa por chamarIrisChat → /api/vps/analisar (modo chat) com
// response_format = json_object e o system prompt N3 deste módulo.

import { supabase } from "@/integrations/supabase/client";
import { chamarIrisChat, type IrisChatMessage } from "@/lib/iris-analyze";
import { ENV_N3_SYSTEM_PROMPT, ENV_CHAT_SYSTEM_PROMPT } from "./prompts";
import type { EnvAnalysisResult } from "./schema";

function extractJson(text: string): unknown {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* try again */
  }
  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}

export type EnvAnalyzeInput = {
  description: string;
  area?: string | null;
  location?: string | null;
  images: string[]; // data URLs ou http(s) URLs
  extraContext?: string; // ex.: transcrição de áudio, texto do PDF
};

export async function analisarAmbientalN3(input: EnvAnalyzeInput): Promise<EnvAnalysisResult> {
  const userPrompt = [
    "Realize uma auditoria ambiental N3 aprofundada com base nas evidências abaixo.",
    "",
    `Descrição do usuário: ${input.description || "—"}`,
    input.area ? `Área: ${input.area}` : "",
    input.location ? `Local: ${input.location}` : "",
    input.extraContext ? `\nContexto adicional extraído dos anexos:\n${input.extraContext}` : "",
    "",
    "Analise cada imagem citando o que é observável. Preencha o contrato JSON completo.",
  ]
    .filter(Boolean)
    .join("\n");

  const content: IrisChatMessage["content"] = [{ type: "text", text: userPrompt }];
  for (const url of input.images.slice(0, 6)) {
    (content as Array<{ type: string }>).push({ type: "image_url", image_url: { url } } as never);
  }

  const messages: IrisChatMessage[] = [
    { role: "system", content: ENV_N3_SYSTEM_PROMPT },
    { role: "user", content },
  ];

  const resp = await chamarIrisChat({
    messages,
    response_format: { type: "json_object" },
  });
  const text = resp.choices?.[0]?.message?.content ?? "";
  return extractJson(text) as EnvAnalysisResult;
}

export type EnvChatTurn = { role: "user" | "assistant"; content: string; images?: string[] };

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

export async function conversarAmbiental(
  history: EnvChatTurn[],
  userText: string,
  images: string[] = [],
): Promise<string> {
  const messages: IrisChatMessage[] = [{ role: "system", content: ENV_CHAT_SYSTEM_PROMPT }];
  for (const t of history) {
    messages.push({ role: t.role, content: t.content });
  }
  const uc: IrisChatMessage["content"] = images.length
    ? [
        { type: "text", text: userText || "(sem texto)" },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ]
    : userText;
  messages.push({ role: "user", content: uc });
  const resp = await chamarIrisChat({ messages });
  return resp.choices?.[0]?.message?.content ?? "";
}

// Upload de anexo ambiental para o bucket privado `environmental`.
export async function uploadEnvAttachment(
  auditId: string,
  file: File,
): Promise<{ path: string; signedUrl: string | null }> {
  const userId = await getFreshAuthenticatedUserId();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${auditId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage
    .from("environmental")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  const signed = await supabase.storage
    .from("environmental")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return { path, signedUrl: signed.data?.signedUrl ?? null };
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}
