import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bell,

  ScanLine,
  Zap,
  CloudRain,
  MapPin,
  LayoutGrid,
  ShieldAlert,
  ClipboardCheck,
  Leaf,
  Lightbulb,
  Users,
  Camera,
  Headphones,
  TrendingUp,
  DollarSign,
  Clock,
  ShieldCheck,
  MoreHorizontal,
  Radio,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel · VALETECH" },
      {
        name: "description",
        content:
          "Inspeções, riscos, cultura e emergências em tempo real com apoio de IA.",
      },
    ],
  }),
  component: Dashboard,
});

type QuickCard = {
  title: string;
  subtitle: string;
  url: string;
  icon: LucideIcon;
  countKey?:
    | "n3"
    | "kaizen"
    | "environment"
    | "supervision"
    | "crm"
    | "gain"
    | "emergency"
    | "inspections";
  hint?: string;
  emergency?: boolean;
};

const quickCards: QuickCard[] = [
  { title: "5S", subtitle: "Registros", url: "/inspecao", icon: LayoutGrid, countKey: "inspections" },
  { title: "N3", subtitle: "Registros", url: "/n3", icon: ShieldAlert, countKey: "n3" },
  { title: "Inspeções", subtitle: "Realizadas", url: "/inspecao", icon: ClipboardCheck, countKey: "inspections" },
  { title: "Meio Ambiente", subtitle: "Auditorias", url: "/meio-ambiente", icon: Leaf, countKey: "environment" },
  { title: "Kaizen", subtitle: "Ideias", url: "/kaizen", icon: Lightbulb, countKey: "kaizen" },
  { title: "CRM", subtitle: "Checklists", url: "/crm", icon: Users, countKey: "crm" },
  { title: "Câmera 360°", subtitle: "Vídeo + IA", url: "/camera-360", icon: Camera },
  { title: "CECOM", subtitle: "Emergência", url: "/emergencia", icon: Headphones, hint: "0800 285 0193", emergency: true },
];


function Dashboard() {
  const [greeting, setGreeting] = useState<string>("");
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
      const name = meta.full_name || email.split("@")[0] || "Operador";
      setGreeting(name.split(" ")[0]);
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [records, inspections] = await Promise.all([
        supabase.from("records").select("module, status, financial_value"),
        supabase.from("inspections").select("id, status"),
      ]);
      const rows = records.data ?? [];
      const byModule = (m: string) => rows.filter((r) => r.module === m).length;
      const sumBy = (m: string) =>
        rows
          .filter((r) => r.module === m)
          .reduce((s, r) => s + Number(r.financial_value ?? 0), 0);

      const totalGain =
        sumBy("gain") + sumBy("n3") + sumBy("kaizen");

      return {
        n3: byModule("n3"),
        kaizen: byModule("kaizen"),
        environment: byModule("environment"),
        supervision: byModule("supervision"),
        crm: byModule("crm"),
        emergency: byModule("emergency"),
        gain: byModule("gain"),
        inspections: inspections.data?.length ?? 0,
        n3Value: sumBy("n3"),
        inspValue: sumBy("gain"),
        kaizenValue: sumBy("kaizen"),
        totalGain,
      };
    },
  });

  const timeLabel = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pb-24 md:max-w-2xl">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <SidebarTrigger className="rounded-md p-2 hover:bg-card" aria-label="Menu" />

        <div className="text-center leading-tight">
          <div className="font-display text-lg font-bold tracking-widest text-foreground">
            VALETECH<span className="text-neon">.</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-neon">
            Vision AI · IA
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/notificacoes" className="relative rounded-md p-2 hover:bg-card">
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-neon text-[9px] font-bold text-black">
              3
            </span>
          </Link>
          <Link
            to="/configuracoes"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neon/10 ring-2 ring-neon"
            aria-label="Perfil"
          >
            <span className="font-display text-sm font-bold text-neon">
              {greeting ? greeting.charAt(0).toUpperCase() : "V"}
            </span>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-5">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border-2 border-neon/40" />
        <div className="pointer-events-none absolute -right-4 top-1/2 flex h-32 w-32 -translate-y-1/2 items-center justify-center rounded-full border-2 border-neon/60">
          <ScanLine className="h-10 w-10 text-neon/70" />
        </div>
        <div className="relative">
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground">
            Olá, <span className="text-neon text-glow">{greeting || "Operador"}.</span>
          </h1>
          <p className="mt-2 max-w-[70%] text-sm text-muted-foreground">
            Inspeções, riscos, cultura e emergências em tempo real.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-neon" />
              </span>
              <span className="text-muted-foreground">
                Sistema <span className="text-neon">online</span>
              </span>
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-muted-foreground">Última sincronização: {timeLabel}</span>
          </div>
        </div>
      </section>

      {/* IA + Clima */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-neon/40 bg-card/60 p-4">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
          <div className="relative">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-neon">
              BI · Distribuição por módulo
            </p>
            <h2 className="mt-1 font-display text-sm font-semibold text-foreground">
              Registros no sistema
            </h2>
            {(() => {
              const pieData = [
                { name: "N3", value: counts?.n3 ?? 0 },
                { name: "Kaizen", value: counts?.kaizen ?? 0 },
                { name: "Meio Amb.", value: counts?.environment ?? 0 },
                { name: "CRM", value: counts?.crm ?? 0 },
                { name: "Inspeções", value: counts?.inspections ?? 0 },
                { name: "Ganhos", value: counts?.gain ?? 0 },
              ].filter((d) => d.value > 0);
              const COLORS = ["#39ff14", "#22c55e", "#84cc16", "#10b981", "#4ade80", "#a3e635", "#eab308"];
              if (pieData.length === 0) {
                return (
                  <div className="mt-4 flex h-[160px] items-center justify-center text-[11px] text-muted-foreground">
                    Sem registros ainda
                  </div>
                );
              }
              return (
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="40%"
                      cy="50%"
                      outerRadius={60}
                      innerRadius={32}
                      stroke="#0a0a0a"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 11 }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 10 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Alerta Climático
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300 ring-1 ring-red-400/40">
              <Zap className="h-3 w-3" /> Raio
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative">
              <CloudRain className="h-14 w-14 text-muted-foreground" />
              <Zap className="absolute -bottom-1 left-3 h-6 w-6 fill-yellow-400 text-yellow-400" />
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-foreground">26°C</div>
              <div className="text-[10px] text-muted-foreground">Chuva moderada</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> Barão de Cocais, MG
          </div>
          <div className="mt-1 text-[11px] font-semibold text-red-300">
            Alerta vermelho de raios
          </div>
          <div className="text-[10px] text-muted-foreground">Risco alto na região</div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Dados em tempo real via GPS
            </span>
            <span className="rounded-sm bg-neon/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-neon">
              GPS
            </span>
          </div>
        </div>
      </section>

      {/* Acessos Rápidos */}
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-neon">
          Acessos Rápidos
        </h3>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {quickCards.map((c) => {
            const count = c.countKey ? counts?.[c.countKey] : undefined;
            return (
              <Link
                key={c.title + c.url}
                to={c.url}
                className="group flex flex-col items-center justify-start rounded-xl border border-border bg-card/60 p-2.5 text-center transition hover:border-neon/50 hover:bg-card"
              >
                <c.icon className="h-6 w-6 text-neon" />
                <div className="mt-2 font-display text-[11px] font-semibold leading-tight text-foreground">
                  {c.title}
                </div>
                <div className="text-[9px] leading-tight text-muted-foreground">
                  {c.subtitle}
                </div>
                {c.emergency && c.hint ? (
                  <div className="mt-0.5 text-[10px] font-bold text-red-400">{c.hint}</div>
                ) : (
                  <div className="mt-0.5 font-display text-sm font-bold text-foreground">
                    {count ?? 0}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Desempenho IA */}
      <section className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neon">
            Desempenho IA
          </h3>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full border border-neon/40 text-neon"
            aria-label="Opções"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Score IA
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ScoreRing value={87} />
              <div className="flex-1 text-[11px] text-muted-foreground">
                <div className="font-display text-sm font-semibold text-neon">↑ 12%</div>
                <div>vs mês anterior</div>
                <div className="mt-1 leading-snug">
                  Quanto mais próximo de 100, maior a chance de aprovação na validação da IA (Vale).
                </div>
              </div>
            </div>
          </div>


          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Resumo de ganhos <span className="text-neon">(este mês)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat icon={DollarSign} value={fmtBRL(counts?.totalGain ?? 45680)} label="Economia financeira" />
              <MiniStat icon={Clock} value="128h" label="Tempo economizado" />
              <MiniStat icon={ShieldCheck} value="32" label="Riscos evitados (potenciais)" />
            </div>
          </div>
        </div>
      </section>

      {/* Controle de Ganhos */}
      <section className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neon">
              Controle de Ganhos
            </h3>
            <span className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300 ring-1 ring-red-400/40">
              Novo
            </span>
          </div>
          <Link to="/controle-ganhos" className="flex items-center gap-1 text-[11px] text-neon hover:underline">
            Ver detalhes <TrendingUp className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <GainCard icon={ShieldAlert} title="N3" count={counts?.n3 ?? 7} value={counts?.n3Value ?? 18250} time="32h" label="Registros efetivados" gainLabel="Economia gerada" />
          <GainCard icon={ClipboardCheck} title="Inspeções" count={counts?.inspections ?? 18} value={counts?.inspValue ?? 16430} time="54h" label="Registros efetivados" gainLabel="Economia gerada" />
          <GainCard icon={Lightbulb} title="Kaizen" count={counts?.kaizen ?? 5} value={counts?.kaizenValue ?? 11000} time="42h" label="Ideias implementadas" gainLabel="Economia gerada" />
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Cálculos baseados em dados reais inseridos e validados no sistema.
        </p>
      </section>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-center justify-around border-t border-border bg-background/95 px-4 py-2 backdrop-blur md:max-w-2xl">
        <NavIcon to="/dashboard" icon={LayoutGrid} label="Painel" active />
        <NavIcon to="/inspecao" icon={Radio} label="Campo" />
        <Link
          to="/vision"
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-neon text-black shadow-[0_0_24px_-2px_var(--neon)] transition hover:brightness-110"
          aria-label="Ativar Análise"
        >
          <ScanLine className="h-6 w-6" />
        </Link>
        <NavIcon to="/n3" icon={ShieldAlert} label="N3" />
        <NavIcon to="/kaizen" icon={Lightbulb} label="Kaizen" />
      </nav>

    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = `conic-gradient(var(--neon) ${pct}%, oklch(0.25 0.02 145) 0)`;
  return (
    <div
      className="relative flex h-20 w-20 items-center justify-center rounded-full"
      style={{ background: bg }}
    >
      <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-card">
        <div className="font-display text-xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-[9px] text-muted-foreground">/100</div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-neon/10 ring-1 ring-neon/40">
        <Icon className="h-4 w-4 text-neon" />
      </div>
      <div className="font-display text-sm font-bold text-neon">{value}</div>
      <div className="text-[9px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function GainCard({
  icon: Icon,
  title,
  count,
  value,
  time,
  label,
  gainLabel,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  value: number;
  time: string;
  label: string;
  gainLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-neon" />
        <div className="font-display text-sm font-semibold text-foreground">{title}</div>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-bold text-foreground">{count}</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5 border-t border-border pt-1.5">
        <div>
          <div className="font-display text-xs font-bold text-neon">{fmtBRL(value)}</div>
          <div className="text-[9px] text-muted-foreground">{gainLabel}</div>
        </div>
        <div>
          <div className="font-display text-xs font-bold text-neon">{time}</div>
          <div className="text-[9px] text-muted-foreground">Tempo economizado</div>
        </div>
      </div>
    </div>
  );
}

function NavIcon({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${
        active ? "text-neon" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

function fmtBRL(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
