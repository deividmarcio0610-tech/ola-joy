const BANDS = [
  { label: "Baixo", range: "0–24", tone: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-300" },
  { label: "Médio", range: "25–49", tone: "bg-amber-500", text: "text-amber-600 dark:text-amber-300" },
  { label: "Alto", range: "50–74", tone: "bg-orange-500", text: "text-orange-600 dark:text-orange-300" },
  { label: "Crítico", range: "75–100", tone: "bg-rose-500", text: "text-rose-600 dark:text-rose-300" },
];

/**
 * Faixa 0-24 Baixo · 25-49 Médio · 50-74 Alto · 75-100 Crítico.
 * Score = 100 - probabilidade_aprovacao (quanto maior, mais crítico).
 */
export function riskBandForScore(score: number): (typeof BANDS)[number] {
  if (score >= 75) return BANDS[3];
  if (score >= 50) return BANDS[2];
  if (score >= 25) return BANDS[1];
  return BANDS[0];
}

export function RiskScoreLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-border/60 bg-muted/30 p-2 ${className}`}
    >
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Legenda do score de risco
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        {BANDS.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${b.tone}`} />
            <span className={`font-semibold ${b.text}`}>{b.label}</span>
            <span className="font-mono text-muted-foreground">{b.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
