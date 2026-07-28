import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(500).optional(),
  platform: z.string().max(100).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SubscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", data.endpoint)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("push_subscriptions")
        .update({
          user_id: userId,
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
          user_agent: data.userAgent ?? null,
          platform: data.platform ?? null,
          enabled: true,
          failure_count: 0,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, updated: true };
    }

    const { data: inserted, error } = await supabase
      .from("push_subscriptions")
      .insert({
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        user_agent: data.userAgent ?? null,
        platform: data.platform ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ endpoint: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyPushSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, platform, enabled, last_success_at, last_failure_at, failure_count, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const sendTestPushToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    if (!subs || subs.length === 0) return { sent: 0, failed: 0, message: "Nenhum dispositivo cadastrado" };

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");

    const vapid = {
      subject: process.env.VAPID_SUBJECT || "mailto:alertas@valetech.app",
      publicKey: process.env.VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
    };

    const payloadData = {
      title: "TESTE — ALERTA VALETECH IA",
      body: "Teste de notificação, som e vibração realizado com sucesso.",
      severity: "critical",
      tag: "valetech-test",
      test: true,
      url: "/intemperies/notificacoes",
      timestamp: Date.now(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      try {
        const built = await buildPushPayload(
          { data: payloadData, options: { ttl: 60, urgency: "high" } },
          { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          vapid,
        );
        const res = await fetch(sub.endpoint, {
          method: built.method,
          headers: built.headers as unknown as Record<string, string>,
          body: built.body as unknown as BodyInit,
        });
        const ok = res.status >= 200 && res.status < 300;
        if (ok) {
          sent += 1;
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", sub.id);
        } else {
          failed += 1;
          await supabaseAdmin
            .from("push_subscriptions")
            .update({
              last_failure_at: new Date().toISOString(),
              failure_count: 1,
              enabled: res.status === 404 || res.status === 410 ? false : true,
            })
            .eq("id", sub.id);
        }
        await supabaseAdmin.from("push_deliveries").insert({
          subscription_id: sub.id,
          user_id: userId,
          title: "TESTE — ALERTA VALETECH IA",
          body: "Teste de notificação",
          severity: "critical",
          tag: "valetech-test",
          is_test: true,
          status: ok ? "sent" : "failed",
          http_status: res.status,
          error: ok ? null : await res.text().catch(() => null),
        });
      } catch (err) {
        failed += 1;
        await supabaseAdmin.from("push_deliveries").insert({
          subscription_id: sub.id,
          user_id: userId,
          title: "TESTE — ALERTA VALETECH IA",
          severity: "critical",
          tag: "valetech-test",
          is_test: true,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { sent, failed, message: `${sent} enviada(s), ${failed} falha(s)` };
  });

export const listMyPushDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("push_deliveries")
      .select("id, title, severity, is_test, status, http_status, error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
