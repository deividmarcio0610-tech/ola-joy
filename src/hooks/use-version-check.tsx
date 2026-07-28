import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION, bucketFromId, compareVersions } from "@/lib/version";
import {
  getLatestVersion,
  recordInstall,
  type AppVersion,
} from "@/lib/version.functions";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 min
const DISMISS_KEY = "app-version:dismissed";
const NOTIFIED_KEY = "app-version:notified";

async function notifyNewVersion(version: string, title: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === version) return;
  } catch {
    /* ignore */
  }
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (perm !== "granted") return;

  const options: NotificationOptions = {
    body: `v${version} — ${title}. Toque para atualizar.`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `app-update-${version}`,
    data: { url: "/", type: "app-update", version },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification("Nova versão disponível", options);
      } else {
        new Notification("Nova versão disponível", options);
      }
    } else {
      new Notification("Nova versão disponível", options);
    }
    localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    /* ignore */
  }
}

export type VersionState = {
  latest: AppVersion | null;
  hasUpdate: boolean;
  isMandatory: boolean;
  dismissed: boolean;
  applyUpdate: () => void;
  dismiss: () => void;
  showNotes: () => void;
};

/** Aplica a atualização: limpa caches do SW e recarrega. Preserva localStorage/sessionStorage. */
export async function applyAppUpdate() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => null)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
  // Reload forçado (busca HTML/JS novos do servidor)
  window.location.reload();
}

export function useVersionCheck(onNotes?: () => void): VersionState {
  const fetchLatest = useServerFn(getLatestVersion);
  const ping = useServerFn(recordInstall);
  const [latest, setLatest] = useState<AppVersion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    try {
      const v = await fetchLatest();
      setLatest(v);
    } catch {
      // silencioso — falha de rede não deve incomodar o usuário
    }
  }, [fetchLatest]);

  const pingInstall = useCallback(async () => {
    try {
      await ping({ data: { version: APP_VERSION, userAgent: navigator.userAgent } });
    } catch {
      // ignore
    }
  }, [ping]);

  useEffect(() => {
    let mounted = true;
    let interval: number | undefined;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !mounted) return;
      userIdRef.current = data.user.id;
      await Promise.all([check(), pingInstall()]);
      interval = window.setInterval(check, POLL_INTERVAL);
    })();

    const onFocus = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        check();
        pingInstall();
      }
    });

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "apply-app-update") {
        applyAppUpdate();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      mounted = false;
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
      sub.subscription.unsubscribe();
    };
  }, [check, pingInstall]);

  // Reset dismiss quando a versão remota muda
  useEffect(() => {
    if (!latest) return;
    try {
      const dismissedVer = localStorage.getItem(DISMISS_KEY);
      setDismissed(dismissedVer === latest.version);
    } catch {
      setDismissed(false);
    }
  }, [latest?.version]);

  const isNewer = latest ? compareVersions(latest.version, APP_VERSION) > 0 : false;
  const uid = userIdRef.current;
  const inRollout =
    latest && uid ? bucketFromId(uid) < latest.rollout_percent : latest?.rollout_percent === 100;
  const hasUpdate = Boolean(isNewer && inRollout);

  // Dispara notificação do SO (uma vez por versão)
  useEffect(() => {
    if (hasUpdate && latest) {
      notifyNewVersion(latest.version, latest.title || "Atualização disponível");
    }
  }, [hasUpdate, latest?.version, latest?.title]);

  // Atualização obrigatória se: is_mandatory=true, ou versão atual < minimum_supported_version
  const belowMin =
    latest?.minimum_supported_version
      ? compareVersions(APP_VERSION, latest.minimum_supported_version) < 0
      : false;
  const isMandatory = Boolean(hasUpdate && (latest?.is_mandatory || belowMin));

  const dismiss = useCallback(() => {
    if (!latest || isMandatory) return;
    try {
      localStorage.setItem(DISMISS_KEY, latest.version);
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, [latest, isMandatory]);

  const showNotes = useCallback(() => onNotes?.(), [onNotes]);

  return {
    latest,
    hasUpdate,
    isMandatory,
    dismissed,
    applyUpdate: applyAppUpdate,
    dismiss,
    showNotes,
  };
}
