import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  savePushSubscription,
  deletePushSubscription,
  sendTestPushToMe,
} from "@/lib/push/push.functions";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push/vapid-public-key";
import { ensureServiceWorker, canUsePush } from "@/lib/push/sw-registration";

type PushState = "unsupported" | "denied" | "granted" | "default" | "unavailable";

export function EnablePushButton({ compact }: { compact?: boolean }) {
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(deletePushSubscription);
  const test = useServerFn(sendTestPushToMe);

  const [state, setState] = useState<PushState>("unavailable");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!canUsePush()) {
        setState("unsupported");
        return;
      }
      setState(Notification.permission as PushState);
      const reg = await ensureServiceWorker();
      if (!reg) {
        setState("unavailable");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    })();
  }, []);

  async function enable() {
    setLoading(true);
    try {
      if (!canUsePush()) {
        toast.error(
          "Este navegador não suporta notificações push. Abra a versão publicada em HTTPS.",
        );
        return;
      }
      const perm = await Notification.requestPermission();
      setState(perm as PushState);
      if (perm !== "granted") {
        toast.error("Permissão de notificação negada.");
        return;
      }
      const reg = await ensureServiceWorker();
      if (!reg) {
        toast.error(
          "Service Worker indisponível. Notificações push só funcionam no app publicado.",
        );
        return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      const json = sub.toJSON();
      await save({
        data: {
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      });
      setSubscribed(true);
      toast.success("Alertas de raios ativados neste dispositivo.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao ativar alertas.");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    try {
      const reg = await ensureServiceWorker();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await remove({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Alertas desativados neste dispositivo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desativar.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setLoading(true);
    try {
      const res = await test({});
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "unsupported" || state === "unavailable") {
    return (
      <Button variant="outline" size={compact ? "sm" : "default"} disabled>
        <BellOff className="h-4 w-4" />
        {compact ? "Push indisponível" : "Notificações push indisponíveis neste navegador"}
      </Button>
    );
  }

  if (subscribed) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          onClick={sendTest}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BellRing className="h-4 w-4" />
          )}
          {compact ? "Testar" : "Enviar teste para este telefone"}
        </Button>
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          onClick={disable}
          disabled={loading}
        >
          <BellOff className="h-4 w-4" />
          Desativar
        </Button>
      </div>
    );
  }

  return (
    <Button size={compact ? "sm" : "default"} onClick={enable} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
      Ativar alertas de raios
    </Button>
  );
}
