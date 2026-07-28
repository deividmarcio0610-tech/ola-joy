import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

interface ModuleShellProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  status?: "operacional" | "beta" | "desenvolvimento";
  children?: ReactNode;
}

const statusMap = {
  operacional: { label: "Operacional", cls: "bg-neon/15 text-neon ring-neon/40" },
  beta: { label: "Beta", cls: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/40" },
  desenvolvimento: {
    label: "Em desenvolvimento",
    cls: "bg-muted text-muted-foreground ring-border",
  },
} as const;

export function ModuleShell({
  icon: Icon,
  title,
  subtitle,
  status = "desenvolvimento",
  children,
}: ModuleShellProps) {
  const s = statusMap[status];
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neon/10 ring-1 ring-neon/40">
            <Icon className="h-6 w-6 text-neon" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ring-1 ${s.cls}`}
              >
                {s.label}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </header>
      {children ?? <ComingSoon />}
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neon/10 ring-1 ring-neon/40">
          <Construction className="h-7 w-7 text-neon" />
        </div>
        <h2 className="font-display text-xl font-semibold text-foreground">
          Módulo em construção
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A estrutura desta área está pronta. Os fluxos de captura, análise pela IA
          IA e persistência serão habilitados nas próximas fases do VALETECH.
        </p>
      </div>
    </div>
  );
}

export function FeatureList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item}
          className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-4"
        >
          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neon shadow-[0_0_8px_var(--neon)]" />
          <span className="text-sm text-foreground/90">{item}</span>
        </div>
      ))}
    </div>
  );
}
