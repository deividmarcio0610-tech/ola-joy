import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const KEY = "valetech.weather.notify";

export function useWeatherNotifier() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(localStorage.getItem(KEY) === "1");
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  const enable = async () => {
    let perm: NotificationPermission = "denied";
    if ("Notification" in window) {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    // desbloqueia audio (gesto do usuário)
    try {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioCtxRef.current = new Ctor();
      await audioCtxRef.current.resume();
    } catch { /* ignore */ }
    localStorage.setItem(KEY, "1");
    setEnabled(true);
    toast.success(perm === "granted" ? "Alertas ativados neste dispositivo" : "Alertas visuais ativos (notificação do sistema bloqueada)");
  };

  const disable = () => {
    localStorage.setItem(KEY, "0");
    setEnabled(false);
    toast.info("Alertas silenciados");
  };

  const beep = (severity: "info" | "warn" | "critical") => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const freqs = severity === "critical" ? [880, 660, 880] : severity === "warn" ? [660, 520] : [520];
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + i * 0.28);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.28 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.28);
      osc.stop(now + i * 0.28 + 0.28);
    });
  };

  const vibrate = (severity: "info" | "warn" | "critical") => {
    if (!("vibrate" in navigator)) return;
    const pattern = severity === "critical" ? [400, 120, 400, 120, 600] : severity === "warn" ? [250, 100, 250] : [200];
    navigator.vibrate(pattern);
  };

  const notify = (opts: { title: string; body: string; severity: "info" | "warn" | "critical"; tag?: string }) => {
    if (!enabled) return;
    beep(opts.severity);
    vibrate(opts.severity);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(opts.title, {
          body: opts.body,
          tag: opts.tag ?? "valetech-weather",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          silent: false,
          requireInteraction: opts.severity === "critical",
        });
      } catch { /* ignore */ }
    }
    // toast in-app garantido
    const fn = opts.severity === "critical" ? toast.error : opts.severity === "warn" ? toast.warning : toast.info;
    fn(opts.title, { description: opts.body, duration: opts.severity === "critical" ? 15000 : 8000 });
  };

  return { enabled, permission, enable, disable, notify };
}
