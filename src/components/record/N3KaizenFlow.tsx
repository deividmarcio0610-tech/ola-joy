// Orquestrador do fluxo Foto → N3 → Escolha de risco → Kaizen.
// Cada etapa é claramente separada: N3 só diagnostica, Kaizen só melhora.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { analisarN3, gerarKaizen, type N3Result, type N3Risk, type KaizenResult } from "@/lib/n3-kaizen";
import { N3RiskList } from "./N3RiskList";
import { KaizenImprovementList } from "./KaizenImprovementList";

interface Props {
  images: string[]; // data URLs
  context?: string;
  initialN3?: N3Result | null;
  initialSelectedRiskId?: string | null;
  initialKaizen?: KaizenResult | null;
  onChange?: (state: {
    n3: N3Result | null;
    selectedRisk: N3Risk | null;
    kaizen: KaizenResult | null;
  }) => void;
}

export function N3KaizenFlow({
  images,
  context,
  initialN3 = null,
  initialSelectedRiskId = null,
  initialKaizen = null,
  onChange,
}: Props) {
  const [n3, setN3] = useState<N3Result | null>(initialN3);
  const [selectedRisk, setSelectedRisk] = useState<N3Risk | null>(
    initialN3 && initialSelectedRiskId
      ? initialN3.riscos.find((r) => r.id === initialSelectedRiskId) ?? null
      : null,
  );
  const [kaizen, setKaizen] = useState<KaizenResult | null>(initialKaizen);
  const [running, setRunning] = useState<"none" | "n3" | "kaizen">("none");

  function emit(next: { n3: N3Result | null; selectedRisk: N3Risk | null; kaizen: KaizenResult | null }) {
    onChange?.(next);
  }

  async function runN3() {
    if (images.length === 0) {
      toast.error("Anexe pelo menos uma foto.");
      return;
    }
    setRunning("n3");
    setKaizen(null);
    setSelectedRisk(null);
    try {
      const result = await analisarN3({ images, context });
      setN3(result);
      emit({ n3: result, selectedRisk: null, kaizen: null });
      toast.success(`N3 identificou ${result.riscos.length} risco(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na auditoria N3.");
    } finally {
      setRunning("none");
    }
  }

  async function runKaizen(risk: N3Risk) {
    setSelectedRisk(risk);
    setRunning("kaizen");
    setKaizen(null);
    try {
      const result = await gerarKaizen({ risco: risk, images, context });
      setKaizen(result);
      emit({ n3, selectedRisk: risk, kaizen: result });
      toast.success(`Kaizen propôs ${result.melhorias.length} melhoria(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar Kaizen.");
    } finally {
      setRunning("none");
    }
  }

  // Estado inicial: só o botão de Analisar
  if (!n3) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg bg-muted/30">
        <Sparkles className="w-8 h-8 text-primary" />
        <div className="text-center">
          <div className="font-bold">Fluxo N3 → Kaizen</div>
          <div className="text-xs text-muted-foreground">O N3 identifica os riscos. Você escolhe 1. O Kaizen propõe melhorias.</div>
        </div>
        <Button size="lg" disabled={running !== "none" || images.length === 0} onClick={runN3}>
          {running === "n3" ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Auditando…</>
          ) : (
            <>Analisar riscos (N3)</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={runN3} disabled={running !== "none"}>
          {running === "n3" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          Reauditar N3
        </Button>
        {kaizen && (
          <Button size="sm" variant="ghost" onClick={() => { setKaizen(null); setSelectedRisk(null); emit({ n3, selectedRisk: null, kaizen: null }); }}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Voltar aos riscos
          </Button>
        )}
      </div>

      {!kaizen && (
        <N3RiskList
          result={n3}
          selectedId={selectedRisk?.id ?? null}
          onSelect={(r) => {
            if (running !== "none") return;
            if (selectedRisk?.id === r.id) void runKaizen(r);
            else setSelectedRisk(r);
          }}
        />
      )}

      {selectedRisk && !kaizen && running !== "kaizen" && (
        <div className="flex justify-end">
          <Button onClick={() => runKaizen(selectedRisk)} disabled={running !== "none"}>
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Kaizen para "{selectedRisk.perigo.slice(0, 40)}"
          </Button>
        </div>
      )}

      {running === "kaizen" && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Engenharia Kaizen preparando melhorias multidisciplinares…
        </div>
      )}

      {kaizen && <KaizenImprovementList result={kaizen} />}
    </div>
  );
}
