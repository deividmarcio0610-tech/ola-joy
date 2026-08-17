import { AlertTriangle } from "lucide-react";

export function LegalDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 ${compact ? "" : "sm:text-sm"}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
      <div className="space-y-1">
        <p className="font-semibold">Ferramenta de apoio operacional.</p>
        <p>
          Não substitui sistemas certificados de detecção de raios, procedimentos internos, SESMT
          nem o plano de emergência da empresa.
        </p>

        <p className="text-amber-200/80">
          Distinção obrigatória: <b>raio observado</b> ≠ <b>previsão de tempestade</b> ≠{" "}
          <b>aviso meteorológico oficial</b>.
        </p>
      </div>
    </div>
  );
}
