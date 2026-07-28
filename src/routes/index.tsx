import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles, ShieldAlert, ClipboardCheck, Activity, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "VALETECH Vision AI · IA — Inteligência operacional" },
      {
        name: "description",
        content:
          "Plataforma corporativa de segurança, supervisão, meio ambiente e ganhos com IA para análise visual em tempo real.",
      },
      { property: "og:title", content: "VALETECH Vision AI · IA — Inteligência operacional" },
      {
        property: "og:description",
        content:
          "Plataforma corporativa de segurança, supervisão, meio ambiente e ganhos com IA para análise visual em tempo real.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center gap-16">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card/40 p-10 md:p-16">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-neon/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/5 px-3 py-1 font-display text-[10px] uppercase tracking-[0.3em] text-neon">
            <Activity className="h-3 w-3" /> Vision AI · IA
          </span>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-semibold leading-tight md:text-6xl">
            Inteligência operacional em{" "}
            <span className="text-neon text-glow">tempo real</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Segurança, supervisão, meio ambiente e ganhos consolidados numa única
            plataforma. Análise visual e linguagem pela IA, feita para mineração,
            siderurgia, energia e indústria pesada.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-md bg-neon px-5 py-3 font-display text-sm font-semibold text-neon-foreground transition hover:bg-neon/90"
            >
              Entrar na plataforma
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#modulos"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background/50 px-5 py-3 font-display text-sm font-semibold text-foreground transition hover:border-neon/40"
            >
              Conhecer módulos
            </a>
          </div>
        </div>
      </section>

      <section id="modulos" className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: ClipboardCheck,
            title: "Inspeção 5S com IA",
            desc: "Foto de campo → análise automática de risco, EPI, organização e plano de ação.",
          },
          {
            icon: Sparkles,
            title: "Assistente IA",
            desc: "Chat corporativo com visão computacional para dúvidas técnicas e classificação.",
          },
          {
            icon: ShieldAlert,
            title: "N3 · Kaizen · Ganhos",
            desc: "Fluxos completos de não conformidade, melhoria contínua e retorno financeiro.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card/50 p-6 transition hover:border-neon/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/30">
              <f.icon className="h-5 w-5 text-neon" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
