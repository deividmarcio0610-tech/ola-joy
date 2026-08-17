import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "login"
  | "logout"
  | "idle_logout"
  | "ai_analysis"
  | "record_create"
  | "record_update"
  | "record_delete"
  | "file_upload"
  | "export_report"
  | "role_change"
  | "sensitive_view";

export async function logAudit(
  action: AuditAction,
  opts: {
    module?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("audit_log").insert({
      user_id: data.user.id,
      action,
      module: opts.module ?? null,
      target_id: opts.targetId ?? null,
      metadata: (opts.metadata ?? {}) as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // audit failure must never break the UX
  }
}
