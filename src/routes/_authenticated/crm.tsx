import { validateFile } from "@/lib/validation";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Users, Camera, Sparkles, Loader2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RecordModule } from "@/components/record-module";
import {
  EquipAreaFields,
  emptyEquipArea,
  equipAreaPromptSuffix,
} from "@/components/equip-area-fields";
import { toast } from "sonner";
import { chamarIrisChat } from "@/lib/iris-analyze";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [{ title: "CRM · VisionGuard AI" }] }),
  component: CrmPage,
});

type Risk = {
  id: number;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  correction: string;
};
type OMAnalysis = {
  summary: string;
  risks: Risk[];
};

function CrmPage() {
  return (
    <div className="flex flex-col gap-8">
      <OMAnalyzer />
      <RecordModule
        moduleKey="crm"
        icon={Users}
        title="CRM · Ordens de Manutenção"
        subtitle="Gestão de OMs, análise de riscos por foto e oportunidades."
        showFinancial
        createLabel="Analisar"
      />
    </div>
  );
}

function OMAnalyzer() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ctx, setCtx] = useState(emptyEquipArea);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OMAnalysis | null>(null);

  function onPick(f: File | undefined) {
    if (!f) return;
    const v = validateFile(f, "image");
    if (!v.ok) return toast.error(v.error);
    const r = new FileReader();
    r.onload = () => setImage(r.result as string);
    r.readAsDataURL(f);
  }

  async function analyze() {
    if (!image) return toast.error("Anexe a foto da OM primeiro.");
    setLoading(true);
    setResult(null);
    try {
      const data = await chamarIrisChat({
        messages: [
          {
            role: "system",
            content:
              'Você é IA, IA de análise de OM (Ordem de Manutenção) industrial. Analise a foto e liste TODOS os riscos operacionais, de segurança, EPI, meio ambiente e mecânicos visíveis. Retorne EXCLUSIVAMENTE JSON no formato: {"summary":"resumo técnico da OM","risks":[{"id":1,"severity":"critical|warning|info","title":"...","description":"...","correction":"..."}]}. Máx 10 riscos. Sem texto fora do JSON.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: (note || "Analise esta OM.") + equipAreaPromptSuffix(ctx) },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      const text = (data.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim();
      setResult(JSON.parse(text) as OMAnalysis);
    } catch (e) {
      handleAiError(e, "Erro ao analisar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-neon" />
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Foto da OM · Levantamento de riscos por IA
          </h2>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {image ? (
            <div className="relative">
              <img
                src={image}
                alt="OM"
                className="w-full rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute right-2 top-2 rounded-full bg-background/80 p-1 ring-1 ring-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-black/30 text-sm text-muted-foreground hover:border-neon/50 hover:text-foreground">
              <Camera className="h-8 w-8" />
              Tirar / anexar foto da OM
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </label>
          )}
          <EquipAreaFields value={ctx} onChange={setCtx} className="mt-3" />
          <Textarea
            className="mt-3"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contexto opcional (número da OM, observações…)"
          />
          <Button onClick={analyze} disabled={loading || !image} className="mt-3 w-full gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Levantar riscos com IA
          </Button>
        </div>

        <div className="min-h-[12rem] rounded-lg border border-border bg-black/30 p-4">
          {!result && !loading && (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
              Riscos identificados aparecerão aqui após a análise.
            </div>
          )}
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-neon" /> IA analisando OM…
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <p className="text-sm text-foreground/90">{result.summary}</p>
              <ul className="space-y-2">
                {result.risks.map((r) => {
                  const color =
                    r.severity === "critical"
                      ? "border-red-500/50 bg-red-500/10 text-red-300"
                      : r.severity === "warning"
                        ? "border-yellow-400/50 bg-yellow-500/10 text-yellow-300"
                        : "border-neon/40 bg-neon/5 text-neon";
                  return (
                    <li key={r.id} className={`rounded-lg border p-3 ${color}`}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="font-display text-[10px] font-bold uppercase tracking-widest">
                          #{r.id} · {r.severity}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{r.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/80">{r.description}</p>
                      <p className="mt-1 text-xs">
                        <span className="font-semibold">Correção:</span>{" "}
                        <span className="text-foreground/80">{r.correction}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] italic text-muted-foreground">
                AVISO: As ações propostas pela IA devem ser validadas pelos responsáveis antes da
                execução.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
