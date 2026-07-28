import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { ModuleShell } from "@/components/module-shell";
import { EnablePushButton } from "@/components/push/enable-push-button";
import { listMyPushSubscriptions, listMyPushDeliveries } from "@/lib/push/push.functions";
import { canUsePush } from "@/lib/push/sw-registration";

function DiagRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-black/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
      </span>
    </div>
  );
}

function NotificacoesPage() {
  const listSubs = useServerFn(listMyPushSubscriptions);
  const listDelivs = useServerFn(listMyPushDeliveries);

  const [diag, setDiag] = useState({
    https: false,
    sw: false,
    notification: false,
    push: false,
    vibration: false,
    standalone: false,
    userAgent: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDiag({
      https: window.location.protocol === "https:" || window.location.hostname === "localhost",
      sw: "serviceWorker" in navigator,
      notification: "Notification" in window,
      push: "PushManager" in window,
      vibration: "vibrate" in navigator,
      standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      userAgent: navigator.userAgent,
    });
  }, []);

  const subs = useQuery({ queryKey: ["push-subs"], queryFn: () => listSubs({}) });
  const delivs = useQuery({ queryKey: ["push-delivs"], queryFn: () => listDelivs({}) });

  return (
    <ModuleShell icon={Bell} title="Notificações · Diagnóstico" subtitle="Configure Push, teste seu telefone e veja o histórico de entregas." status="operacional">
      <div className="space-y-4 p-3 sm:p-4">
        <Link to="/intemperies" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> voltar para Intempéries
        </Link>

        <div className="rounded-xl border border-border bg-black/30 p-4">
          <div className="mb-3 text-sm font-bold">Ativação neste dispositivo</div>
          <EnablePushButton />
          {!canUsePush() && (
            <div className="mt-2 text-[11px] text-amber-300">
              Push não está disponível no preview do Lovable ou fora de HTTPS. Abra a URL publicada no seu telefone.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-black/30 p-4 space-y-2">
          <div className="mb-1 text-sm font-bold">Diagnóstico do dispositivo</div>
          <DiagRow label="HTTPS" ok={diag.https} />
          <DiagRow label="Service Worker API" ok={diag.sw} />
          <DiagRow label="Notification API" ok={diag.notification} detail={typeof Notification !== "undefined" ? Notification.permission : ""} />
          <DiagRow label="Push API" ok={diag.push} />
          <DiagRow label="Vibration API" ok={diag.vibration} />
          <DiagRow label="Modo standalone (PWA instalada)" ok={diag.standalone} />
          <div className="pt-1 text-[10px] text-muted-foreground break-all">User Agent: {diag.userAgent}</div>
        </div>

        <div className="rounded-xl border border-border bg-black/30 p-4">
          <div className="mb-2 text-sm font-bold">Dispositivos cadastrados</div>
          {subs.isLoading ? (
            <div className="text-xs text-muted-foreground">Carregando…</div>
          ) : (subs.data?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhum dispositivo. Clique em "Ativar alertas de raios" acima.</div>
          ) : (
            <div className="space-y-2">
              {subs.data!.map((s) => (
                <div key={s.id} className="rounded-md border border-border bg-background/50 p-2 text-xs">
                  <div className="font-medium">{s.platform || "Dispositivo"}</div>
                  <div className="text-[10px] text-muted-foreground break-all">{s.user_agent}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span>Status: {s.enabled ? "ativo" : "desativado"}</span>
                    {s.last_success_at && <span>Último sucesso: {new Date(s.last_success_at).toLocaleString("pt-BR")}</span>}
                    {s.last_failure_at && <span>Última falha: {new Date(s.last_failure_at).toLocaleString("pt-BR")}</span>}
                    <span>Falhas: {s.failure_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-black/30 p-4">
          <div className="mb-2 text-sm font-bold">Últimas entregas</div>
          {delivs.isLoading ? (
            <div className="text-xs text-muted-foreground">Carregando…</div>
          ) : (delivs.data?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhuma entrega registrada ainda.</div>
          ) : (
            <div className="space-y-1 text-xs">
              {delivs.data!.map((d) => (
                <div key={d.id} className="flex items-start justify-between rounded-md border border-border bg-background/40 px-2 py-1">
                  <div>
                    <div className="font-medium">{d.title} {d.is_test && <span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">TESTE</span>}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString("pt-BR")} · {d.severity ?? "-"} · HTTP {d.http_status ?? "-"}</div>
                    {d.error && <div className="text-[10px] text-red-300">{d.error}</div>}
                  </div>
                  <div className={`text-[10px] font-bold ${d.status === "sent" ? "text-emerald-400" : "text-red-400"}`}>{d.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-amber-500/5 p-3 text-[11px] text-amber-200/90">
          <b>Importante:</b> vibração e som personalizados dependem do sistema operacional do celular. Em iOS, notificações web push só chegam quando o app está <b>instalado como PWA</b> (Adicionar à Tela Inicial). Em Android, funcionam com o navegador aberto ou fechado, desde que a permissão tenha sido concedida.
        </div>
      </div>
    </ModuleShell>
  );
}

export const Route = createFileRoute("/_authenticated/intemperies/notificacoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notificações · Diagnóstico · VALETECH" },
      { name: "description", content: "Configuração e diagnóstico de notificações Push para alertas de raios e clima." },
    ],
  }),
  component: NotificacoesPage,
});
