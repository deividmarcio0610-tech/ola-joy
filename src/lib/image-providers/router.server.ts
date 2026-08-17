// ImageProviderRouter: orquestra os provedores em cascata,
// atualiza circuit breaker, registra job/attempts e retorna a imagem final.
// Server-only — nunca importar do client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  isRecoverableError,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageProviderResult,
  type ProviderErrorType,
} from "./types";
import { GeminiImageProvider } from "./gemini.server";
import { StabilityImageProvider } from "./stability.server";
import { FalImageProvider } from "./fal.server";
import { ReplicateImageProvider } from "./replicate.server";
import { OpenAIImageProvider } from "./openai.server";

type AdminClient = SupabaseClient<Database>;

type ProviderRow = Database["public"]["Tables"]["image_providers"]["Row"];

const ADAPTERS: Record<string, ImageProvider> = {
  gemini: new GeminiImageProvider(),
  stability: new StabilityImageProvider(),
  fal: new FalImageProvider(),
  replicate: new ReplicateImageProvider(),
  openai: new OpenAIImageProvider(),
};

const CONSECUTIVE_FAILURES_THRESHOLD = 3;

export type RouterAttemptSummary = {
  provider: string;
  model: string;
  httpStatus?: number;
  errorType?: ProviderErrorType;
  errorMessage?: string;
  durationMs: number;
};

export type RouterFinalResult = {
  jobId: string;
  success: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  successfulProvider?: string;
  successfulModel?: string;
  totalAttempts: number;
  errorMessage?: string;
  attempts?: RouterAttemptSummary[];
  skipped?: Array<{ provider: string; reason: string; blockedUntil?: string | null }>;
};

export type RouterInput = ImageGenerationRequest & {
  originalImageHash: string;
  correctionsHash: string;
};

export async function runImageRouter(
  admin: AdminClient,
  input: RouterInput,
): Promise<RouterFinalResult> {
  // 1) Reuso idempotente por hash.
  const { data: cached } = await admin
    .from("image_generation_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("original_image_hash", input.originalImageHash)
    .eq("corrections_hash", input.correctionsHash)
    .eq("generation_mode", input.generationMode)
    .eq("final_status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.corrected_image_url) {
    return {
      jobId: cached.id,
      success: true,
      imageBase64: undefined,
      imageMimeType: undefined,
      successfulProvider: cached.successful_provider ?? undefined,
      successfulModel: cached.successful_model ?? undefined,
      totalAttempts: cached.total_attempts ?? 0,
    };
  }

  // 2) Cria o job.
  const { data: job, error: jobErr } = await admin
    .from("image_generation_jobs")
    .insert({
      user_id: input.userId,
      original_image_hash: input.originalImageHash,
      corrections_hash: input.correctionsHash,
      generation_mode: input.generationMode,
      final_status: "processing",
      scene_description: input.sceneDescription,
      detected_risks: input.detectedRisks,
      selected_corrections: input.selectedCorrections,
    })
    .select()
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Falha ao criar job.");

  // 3) Carrega provedores habilitados.
  const { data: providers, error: providersErr } = await admin
    .from("image_providers")
    .select("*")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  const attemptSummaries: RouterAttemptSummary[] = [];
  const skipped: Array<{ provider: string; reason: string; blockedUntil?: string | null }> = [];

  if (providersErr) {
    const message = `Falha ao carregar provedores: ${providersErr.message}`;
    await admin
      .from("image_generation_jobs")
      .update({
        final_status: "failed",
        total_attempts: 0,
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return {
      jobId: job.id,
      success: false,
      totalAttempts: 0,
      errorMessage: message,
      attempts: attemptSummaries,
      skipped,
    };
  }

  const now = new Date();
  const available: ProviderRow[] = (providers ?? []).filter((p) => {
    if (p.current_status === "open" && p.blocked_until && new Date(p.blocked_until) > now) {
      skipped.push({
        provider: p.provider_name,
        reason: `Circuit breaker aberto até ${new Date(p.blocked_until).toLocaleString("pt-BR")}. Último erro: ${p.last_error_type ?? "desconhecido"}.`,
        blockedUntil: p.blocked_until,
      });
      return false;
    }
    return true;
  });

  let attemptNumber = 0;
  let finalResult: ImageProviderResult | null = null;
  let lastError: string | undefined;

  for (const row of available) {
    const adapter = ADAPTERS[row.provider_name];
    if (!adapter) {
      skipped.push({ provider: row.provider_name, reason: "Sem adaptador implementado." });
      continue;
    }
    if (!adapter.isConfigured()) {
      skipped.push({ provider: row.provider_name, reason: "Chave de API ausente no backend." });
      continue;
    }
    attemptNumber += 1;

    const model =
      (input.generationMode === "preview" ? row.preview_model : row.final_model) ||
      row.default_model ||
      undefined;

    const started = new Date().toISOString();
    const result = await adapter.generateAfterImage({ ...input, modelHint: model ?? undefined });
    const completed = new Date().toISOString();

    attemptSummaries.push({
      provider: row.provider_name,
      model: result.model,
      httpStatus: result.httpStatus,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    });

    await admin.from("image_generation_attempts").insert({
      job_id: job.id,
      provider_name: row.provider_name,
      model: result.model,
      attempt_number: attemptNumber,
      status: result.success ? "success" : "failed",
      http_status: result.httpStatus ?? null,
      error_type: result.errorType ?? null,
      sanitized_error_message: result.errorMessage ? result.errorMessage.slice(0, 500) : null,
      estimated_cost_cents: result.estimatedCostCents ?? 0,
      duration_ms: result.durationMs,
      started_at: started,
      completed_at: completed,
    });

    if (result.success) {
      await updateProviderOnSuccess(admin, row);
      finalResult = result;
      break;
    }

    await updateProviderOnFailure(admin, row, result.errorType, result.retryAfterSeconds);
    lastError = result.errorMessage ?? result.errorType ?? "Falha desconhecida.";
    if (!isRecoverableError(result.errorType)) break;
  }

  if (finalResult?.success && finalResult.imageBase64) {
    const publicUrl = await saveToStorage(
      admin,
      input.userId,
      finalResult.imageBase64,
      finalResult.imageMimeType ?? "image/png",
    );

    await admin
      .from("image_generation_jobs")
      .update({
        final_status: "completed",
        successful_provider: finalResult.provider,
        successful_model: finalResult.model,
        total_attempts: attemptNumber,
        internal_credits_used: 1,
        corrected_image_url: publicUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return {
      jobId: job.id,
      success: true,
      imageBase64: finalResult.imageBase64,
      imageMimeType: finalResult.imageMimeType,
      successfulProvider: finalResult.provider,
      successfulModel: finalResult.model,
      totalAttempts: attemptNumber,
      attempts: attemptSummaries,
      skipped,
    };
  }

  await admin
    .from("image_generation_jobs")
    .update({
      final_status: "failed",
      total_attempts: attemptNumber,
      error_message: lastError ?? "Todos os provedores falharam.",
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    jobId: job.id,
    success: false,
    totalAttempts: attemptNumber,
    errorMessage: lastError ?? "Todos os provedores falharam.",
    attempts: attemptSummaries,
    skipped,
  };
}

async function updateProviderOnSuccess(admin: AdminClient, row: ProviderRow) {
  await admin
    .from("image_providers")
    .update({
      current_status: "closed",
      consecutive_failures: 0,
      blocked_until: null,
      last_success_at: new Date().toISOString(),
      total_success: (row.total_success ?? 0) + 1,
      last_error_type: null,
    })
    .eq("id", row.id);
}

async function updateProviderOnFailure(
  admin: AdminClient,
  row: ProviderRow,
  errorType: ProviderErrorType | undefined,
  retryAfterSeconds: number | undefined,
) {
  const failures = (row.consecutive_failures ?? 0) + 1;
  let blockedUntil: string | null = null;
  let status: "closed" | "open" | "half_open" = row.current_status as
    | "closed"
    | "open"
    | "half_open";

  if (errorType === "RATE_LIMIT") {
    const secs = retryAfterSeconds ?? 5 * 60;
    blockedUntil = new Date(Date.now() + secs * 1000).toISOString();
    status = "open";
  } else if (errorType === "NO_CREDITS" || errorType === "DAILY_LIMIT") {
    blockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15min — admin pode resetar manualmente
    status = "open";
  } else if (errorType === "AUTHENTICATION_ERROR") {
    blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    status = "open";
  } else if (errorType === "TEMPORARY_UNAVAILABLE") {
    blockedUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    status = "open";
  } else if (failures >= CONSECUTIVE_FAILURES_THRESHOLD) {
    blockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    status = "open";
  }

  await admin
    .from("image_providers")
    .update({
      current_status: status,
      consecutive_failures: failures,
      blocked_until: blockedUntil,
      last_failure_at: new Date().toISOString(),
      last_error_type: errorType ?? "UNKNOWN_ERROR",
      total_failure: (row.total_failure ?? 0) + 1,
    })
    .eq("id", row.id);
}

async function saveToStorage(
  admin: AdminClient,
  userId: string,
  imageBase64: string,
  mime: string,
): Promise<string> {
  const bin = atob(imageBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `records/${userId}/after-${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage.from("inspections").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`Storage upload falhou: ${error.message}`);

  const { data: signed } = await admin.storage
    .from("inspections")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias
  return signed?.signedUrl ?? path;
}
