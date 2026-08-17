import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Leaf,
  Send,
  Loader2,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Sheet,
  Video,
  Mic,
  Sparkles,
  ClipboardList,
  Download,
  Lightbulb,
} from "lucide-react";
import { downloadEnvReport } from "@/lib/environmental/pdf";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { ModuleShell } from "@/components/module-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  classifyAttachment,
  MAX_ATTACHMENT_MB,
  type EnvAttachmentKind,
  type EnvAnalysisResult,
} from "@/lib/environmental/schema";
import {
  analisarAmbientalN3,
  conversarAmbiental,
  fileToDataUrl,
  uploadEnvAttachment,
  type EnvChatTurn,
} from "@/lib/environmental/analyze";
import { saveEnvAudit, listEnvAudits, getEnvAudit } from "@/lib/environmental/audits.functions";
import { handleAiError } from "@/lib/ai-credits-error";

export const Route = createFileRoute("/_authenticated/ambiental")({
  head: () => ({
    meta: [
      { title: "Auditoria Ambiental N3 · ValeTech IA" },
      {
        name: "description",
        content:
          "Auditoria ambiental N3 automática com conselho multidisciplinar de especialistas, plano de ação 5W2H e histórico.",
      },
      { property: "og:title", content: "Auditoria Ambiental N3 · ValeTech IA" },
      { property: "og:description", content: "Módulo de auditoria ambiental N3 do ValeTech IA." },
    ],
  }),
  component: AmbientalPage,
});

function AmbientalPage() {
  return (
    <ModuleShell
      icon={Leaf}
      title="Auditoria Ambiental IA"
      subtitle="Chat ambiental contínuo, auditoria N3 com conselho de especialistas e histórico."
      status="beta"
    >
      <Tabs defaultValue="auditoria" className="w-full">
        <TabsList>
          <TabsTrigger value="chat">Chat Ambiental</TabsTrigger>
          <TabsTrigger value="auditoria">Nova Auditoria N3</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-6">
          <EnvChatPanel />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-6">
          <EnvAuditPanel />
        </TabsContent>
        <TabsContent value="historico" className="mt-6">
          <EnvHistoryPanel />
        </TabsContent>
      </Tabs>
    </ModuleShell>
  );
}

// ==================== CHAT AMBIENTAL (uma conversa contínua) ====================

function EnvChatPanel() {
  const [messages, setMessages] = useState<EnvChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text && pending.length === 0) return;
    setLoading(true);
    try {
      const imgs: string[] = [];
      for (const f of pending) {
        if (f.type.startsWith("image/")) imgs.push(await fileToDataUrl(f));
      }
      const userTurn: EnvChatTurn = {
        role: "user",
        content: text || "(anexos enviados)",
        images: imgs,
      };
      const nextHistory = [...messages, userTurn];
      setMessages(nextHistory);
      setInput("");
      setPending([]);
      const reply = await conversarAmbiental(messages, text, imgs);
      setMessages([...nextHistory, { role: "assistant", content: reply }]);
      setTimeout(() => listRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }), 50);
    } catch (e) {
      handleAiError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chat Ambiental Contínuo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={listRef}
          className="max-h-[420px] min-h-[220px] overflow-y-auto rounded-lg border border-border bg-background/40 p-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Pergunte sobre ISO 14001, PNRS, CONAMA, licenciamento, resíduos, efluentes ou
              emergências. Anexe imagens para análise pontual.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[92%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}
              >
                <ReactMarkdown>{m.content}</ReactMarkdown>
                {m.images && m.images.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    {m.images.map((src, j) => (
                      <img
                        key={j}
                        src={src}
                        alt="anexo"
                        className="h-16 w-16 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-xs text-muted-foreground">Pensando…</div>}
        </div>
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pending.map((f, i) => (
              <Badge key={i} variant="outline" className="gap-1">
                {f.name}
                <button
                  onClick={() => setPending(pending.filter((_, k) => k !== i))}
                  className="ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer rounded-md border border-border p-2 hover:bg-accent">
            <Upload className="h-4 w-4" />
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter(
                  (f) => f.size <= MAX_ATTACHMENT_MB * 1024 * 1024,
                );
                setPending([...pending, ...files]);
                e.target.value = "";
              }}
            />
          </label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button onClick={send} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== NOVA AUDITORIA N3 ====================

const KIND_ICON: Record<EnvAttachmentKind, typeof ImageIcon> = {
  image: ImageIcon,
  pdf: FileText,
  spreadsheet: Sheet,
  video: Video,
  audio: Mic,
  other: FileText,
};

function EnvAuditPanel() {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<Array<{ file: File; kind: EnvAttachmentKind }>>(
    [],
  );
  const [analysis, setAnalysis] = useState<EnvAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const saveFn = useServerFn(saveEnvAudit);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    const kept: typeof attachments = [];
    for (const f of list) {
      if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`${f.name} excede ${MAX_ATTACHMENT_MB}MB.`);
        continue;
      }
      kept.push({ file: f, kind: classifyAttachment(f) });
    }
    setAttachments((prev) => [...prev, ...kept]);
  }

  async function analyze() {
    if (!description.trim() && attachments.length === 0) {
      toast.error("Descreva a situação ou anexe evidências.");
      return;
    }
    setAnalyzing(true);
    try {
      const imgs: string[] = [];
      for (const a of attachments) {
        if (a.kind === "image") imgs.push(await fileToDataUrl(a.file));
      }
      const extraCtx = attachments
        .filter((a) => a.kind !== "image")
        .map((a) => `- Anexo (${a.kind}): ${a.file.name}`)
        .join("\n");
      const result = await analisarAmbientalN3({
        description,
        area,
        location,
        images: imgs,
        extraContext: extraCtx || undefined,
      });
      setAnalysis(result);
      if (!title.trim()) setTitle(result.titulo || "Auditoria ambiental");
      toast.success("Análise concluída pelo Conselho Ambiental.");
    } catch (e) {
      handleAiError(e);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!analysis) return;
    setSaving(true);
    try {
      // Refresh session first so the bearer token isn't expired mid-save.
      const { ensureFreshSession } = await import("@/lib/iris-analyze");
      await ensureFreshSession();
      const tmpAuditId = crypto.randomUUID();
      const uploaded: Array<{
        kind: EnvAttachmentKind;
        path: string;
        signedUrl: string | null;
        filename: string;
        mime: string | null;
        size: number | null;
      }> = [];
      for (const a of attachments) {
        try {
          const up = await uploadEnvAttachment(tmpAuditId, a.file);
          uploaded.push({
            kind: a.kind,
            path: up.path,
            signedUrl: up.signedUrl,
            filename: a.file.name,
            mime: a.file.type || null,
            size: a.file.size,
          });
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : "Falha ao enviar anexo ambiental.");
        }
      }
      const firstImage = uploaded.find((u) => u.kind === "image");
      const res = await saveFn({
        data: {
          title: title || analysis.titulo,
          area: area || null,
          location: location || null,
          scope: analysis.categorias ?? [],
          environmentType: analysis.meio_afetado ?? null,
          criticality: mapCriticality(analysis.severidade),
          overallConfidence: mapConfidence(analysis.confianca),
          summary: analysis.resumo_executivo ?? null,
          aiPayload: analysis as unknown as Record<string, unknown>,
          originalPhotoUrl: firstImage?.signedUrl ?? null,
          findings: [
            {
              sortIndex: 0,
              l1: analysis.parecer_auditoria?.observado ?? null,
              l2: analysis.parecer_auditoria?.criterio ?? null,
              l3: analysis.parecer_auditoria?.consequencia ?? null,
              aspect: analysis.aspecto_principal ?? null,
              impact: analysis.impacto_direto ?? null,
              mediumAffected: analysis.meio_afetado ? [analysis.meio_afetado] : [],
              classification: mapFindingClassification(analysis.parecer_auditoria?.tipo_achado),
              criticality: mapCriticality(analysis.severidade),
              evidenceType: analysis.necessita_mais_evidencia ? "hipotese" : "fato",
              severity: analysis.matriz?.severidade ?? null,
              probability: analysis.matriz?.probabilidade ?? null,
              controlHierarchy: mapControl(analysis.acoes_corretivas?.[0]?.controle),
              proposals: analysis.requisitos_legais ?? [],
              skepticNotes: analysis.motivo_evidencia_insuficiente ?? null,
              indicators: [],
              requires: analysis.necessita_mais_evidencia ? ["evidencia_complementar"] : [],
            },
          ],
          actions: [
            ...(analysis.acoes_imediatas ?? []).map((a) => actionRow(a, "imediata")),
            ...(analysis.acoes_corretivas ?? []).map((a) => actionRow(a, "engenharia")),
            ...(analysis.acoes_preventivas ?? []).map((a) => actionRow(a, "kaisen")),
          ],
          attachments: uploaded,
        },
      });
      toast.success(`Auditoria ${res.code} salva.`);
      setTitle("");
      setArea("");
      setLocation("");
      setDescription("");
      setAttachments([]);
      setAnalysis(null);
      await qc.invalidateQueries({ queryKey: ["env-audits"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      const friendly = /Unauthorized|No authorization header|Invalid token/i.test(msg)
        ? "Sua sessão expirou. Faça login novamente e tente salvar."
        : msg;
      toast.error(friendly);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidências</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Área" value={area} onChange={(e) => setArea(e.target.value)} />
            <Input
              placeholder="Local / GPS"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <Textarea
            rows={4}
            placeholder="Descreva a condição, o contexto e o que precisa ser auditado."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />
              <span>
                Anexar fotos, PDFs, planilhas, vídeos ou áudios (até {MAX_ATTACHMENT_MB}MB cada)
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*,application/pdf,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,video/*,audio/*"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {attachments.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {attachments.map((a, i) => {
                  const Ic = KIND_ICON[a.kind];
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded border border-border bg-card/60 p-2 text-xs"
                    >
                      <Ic className="h-4 w-4 text-neon" />
                      <span className="truncate flex-1">{a.file.name}</span>
                      <button onClick={() => setAttachments(attachments.filter((_, k) => k !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={analyze} disabled={analyzing} className="flex-1">
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Analisar com Conselho N3
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Resultado da Auditoria</CardTitle>
          {analysis && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  downloadEnvReport(analysis, {
                    empresa: "ValeTech IA",
                    area: area || undefined,
                  })
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </Button>
              <Button size="sm" variant="outline" onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardList className="mr-2 h-4 w-4" />
                )}
                Salvar auditoria
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!analysis && (
            <p className="text-sm text-muted-foreground">
              Envie evidências e clique em analisar. O conselho multidisciplinar preencherá findings
              N3, matriz de risco, requisitos legais, cenários (econômica/recomendada/ideal), PDCA e
              ações 5W2H.
            </p>
          )}
          {analysis && <AnalysisView a={analysis} />}
        </CardContent>
      </Card>
    </div>
  );
}

function AnalysisView({ a }: { a: EnvAnalysisResult }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{a.titulo}</h3>
          <Badge variant="outline">{a.nivel}</Badge>
          <Badge className={severityClass(a.severidade)}>{a.severidade}</Badge>
          <Badge variant="outline">score {a.score}</Badge>
          <Badge variant="outline">confiança {a.confianca}</Badge>
        </div>
        <p className="mt-2 text-muted-foreground">{a.resumo_executivo}</p>
      </div>
      {a.necessita_mais_evidencia && (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200">
          Evidência insuficiente:{" "}
          {a.motivo_evidencia_insuficiente || "necessária validação em campo."}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Aspecto" value={a.aspecto_principal} />
        <Field label="Meio afetado" value={a.meio_afetado} />
        <Field label="Impacto direto" value={a.impacto_direto} />
        <Field label="Impacto indireto" value={a.impacto_indireto} />
        <Field label="Fonte" value={a.fonte} />
        <Field label="Material" value={a.material} />
      </div>
      {a.categorias?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.categorias.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
      )}
      <section>
        <h4 className="mb-1 font-semibold">Matriz</h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.entries(a.matriz ?? {})
            .filter(([k]) => k !== "justificativa")
            .map(([k, v]) => (
              <div key={k} className="rounded border border-border bg-card/40 p-2">
                <div className="text-muted-foreground">{k}</div>
                <div className="text-base font-semibold">{String(v)}</div>
              </div>
            ))}
        </div>
        {a.matriz?.justificativa && (
          <p className="mt-2 text-xs text-muted-foreground">{a.matriz.justificativa}</p>
        )}
      </section>
      {a.requisitos_legais?.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold">Requisitos legais</h4>
          <ul className="list-disc space-y-1 pl-4">
            {a.requisitos_legais.map((r, i) => (
              <li key={i}>
                <strong>{r.norma}</strong>
                {r.artigo ? ` · ${r.artigo}` : ""} — {r.descricao}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ActionBlock title="Ações imediatas" items={a.acoes_imediatas} />
      <ActionBlock title="Ações corretivas (engenharia)" items={a.acoes_corretivas} />
      <ActionBlock title="Ações preventivas" items={a.acoes_preventivas} />
      {a.melhor_solucao && (
        <section>
          <h4 className="mb-1 font-semibold">Melhor solução</h4>
          <p className="text-muted-foreground">{a.melhor_solucao}</p>
        </section>
      )}
      {a.parecer_auditoria && (
        <section className="rounded border border-border bg-card/40 p-3">
          <h4 className="font-semibold">Parecer de auditoria</h4>
          <p>
            <strong>Observado:</strong> {a.parecer_auditoria.observado}
          </p>
          <p>
            <strong>Critério:</strong> {a.parecer_auditoria.criterio}
          </p>
          <p>
            <strong>Achado:</strong> {a.parecer_auditoria.tipo_achado} · prioridade{" "}
            {a.parecer_auditoria.prioridade}
          </p>
          <p>
            <strong>Consequência:</strong> {a.parecer_auditoria.consequencia}
          </p>
          <p>
            <strong>Recomendação:</strong> {a.parecer_auditoria.recomendacao}
          </p>
        </section>
      )}
      {a.cenarios && (
        <section>
          <h4 className="mb-2 font-semibold">Cenários de solução</h4>
          <div className="grid gap-2 md:grid-cols-3">
            <ScenarioCard label="Econômica" tone="muted" s={a.cenarios.economica} />
            <ScenarioCard label="Recomendada" tone="accent" s={a.cenarios.recomendada} />
            <ScenarioCard label="Ideal" tone="primary" s={a.cenarios.ideal} />
          </div>
        </section>
      )}
      {a.pdca && (
        <section className="rounded border border-border bg-card/40 p-3">
          <h4 className="mb-1 font-semibold">PDCA Ambiental</h4>
          <p>
            <strong>P — Planejar:</strong> {a.pdca.planejar}
          </p>
          <p>
            <strong>D — Executar:</strong> {a.pdca.executar}
          </p>
          <p>
            <strong>C — Verificar:</strong> {a.pdca.verificar}
          </p>
          <p>
            <strong>A — Agir:</strong> {a.pdca.agir}
          </p>
        </section>
      )}
      {a.aspectos_impactos?.length ? (
        <section>
          <h4 className="mb-1 font-semibold">Matriz de aspectos e impactos</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-card/60">
                <tr>
                  <th className="p-1 text-left">Atividade</th>
                  <th className="p-1 text-left">Aspecto</th>
                  <th className="p-1 text-left">Impacto</th>
                  <th className="p-1">Cond.</th>
                  <th className="p-1">Freq.</th>
                  <th className="p-1">Sev.</th>
                  <th className="p-1">Signif.</th>
                </tr>
              </thead>
              <tbody>
                {a.aspectos_impactos.map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="p-1">{r.atividade}</td>
                    <td className="p-1">{r.aspecto}</td>
                    <td className="p-1">{r.impacto}</td>
                    <td className="p-1 text-center">{r.condicao}</td>
                    <td className="p-1 text-center">{r.frequencia}</td>
                    <td className="p-1 text-center">{r.severidade}</td>
                    <td className="p-1 text-center">{r.significancia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <KaisenTransformButton a={a} />
    </div>
  );
}

function ScenarioCard({
  label,
  s,
  tone,
}: {
  label: string;
  tone: "muted" | "accent" | "primary";
  s: NonNullable<EnvAnalysisResult["cenarios"]>["economica"];
}) {
  const toneClass =
    tone === "accent"
      ? "border-emerald-500/60 bg-emerald-500/5"
      : tone === "primary"
        ? "border-sky-500/60 bg-sky-500/5"
        : "border-border bg-card/40";
  return (
    <div className={`rounded border ${toneClass} p-2 text-xs`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        <Badge variant="outline" className="text-[10px]">
          {s?.prazo ?? "—"}
        </Badge>
      </div>
      <p className="font-medium">{s?.titulo}</p>
      <p className="mt-1 text-muted-foreground">{s?.descricao}</p>
      <div className="mt-2 space-y-0.5 text-muted-foreground">
        <div>
          <strong>Custo:</strong> {s?.custo_estimado}
        </div>
        <div>
          <strong>Eficiência:</strong> {s?.eficiencia}
        </div>
        <div>
          <strong>Risco residual:</strong> {s?.risco_residual}
        </div>
        <div>
          <strong>Vida útil:</strong> {s?.vida_util}
        </div>
      </div>
    </div>
  );
}

function KaisenTransformButton({ a }: { a: EnvAnalysisResult }) {
  const navigate = useNavigate();
  return (
    <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold">Transformar em Kaisen Ambiental</span>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={() => {
            try {
              sessionStorage.setItem(
                "kaizen:draft",
                JSON.stringify({
                  origem: "ambiental",
                  titulo: a.titulo,
                  problema: a.parecer_auditoria?.observado ?? a.resumo_executivo,
                  aspecto: a.aspecto_principal,
                  impacto: a.impacto_direto,
                  evidencia: a.parecer_auditoria?.criterio,
                  causa: a.matriz?.justificativa,
                  solucao: a.cenarios?.recomendada?.descricao ?? a.melhor_solucao,
                  meta: a.cenarios?.recomendada?.beneficio,
                  prazo: a.cenarios?.recomendada?.prazo,
                  custo: a.cenarios?.recomendada?.custo_estimado,
                  beneficio: a.cenarios?.recomendada?.beneficio,
                  indicador: a.aspectos_impactos?.[0]?.indicador,
                  status: "rascunho",
                }),
              );
              toast.success("Rascunho enviado ao módulo Kaisen.");
              navigate({ to: "/kaizen" }).catch(() => navigate({ to: "/" }));
            } catch {
              toast.error("Não foi possível abrir o Kaisen.");
            }
          }}
        >
          <Lightbulb className="mr-2 h-4 w-4" />
          Criar Kaisen
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Título, problema, aspecto, impacto, solução recomendada, meta e indicador são preenchidos
        automaticamente no módulo Kaisen.
      </p>
    </div>
  );
}

function ActionBlock({
  title,
  items,
}: {
  title: string;
  items?: Array<{
    descricao: string;
    o_que?: string;
    quem?: string;
    quando?: string;
    onde?: string;
    como?: string;
    prioridade?: string;
    controle?: string;
  }>;
}) {
  if (!items?.length) return null;
  return (
    <section>
      <h4 className="mb-1 font-semibold">{title}</h4>
      <ul className="space-y-2">
        {items.map((a, i) => (
          <li key={i} className="rounded border border-border bg-card/40 p-2 text-xs">
            <div className="font-medium">{a.descricao}</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground">
              {a.o_que && (
                <span>
                  <strong>O quê:</strong> {a.o_que}
                </span>
              )}
              {a.quem && (
                <span>
                  <strong>Quem:</strong> {a.quem}
                </span>
              )}
              {a.onde && (
                <span>
                  <strong>Onde:</strong> {a.onde}
                </span>
              )}
              {a.quando && (
                <span>
                  <strong>Quando:</strong> {a.quando}
                </span>
              )}
              {a.como && (
                <span className="col-span-2">
                  <strong>Como:</strong> {a.como}
                </span>
              )}
              {a.prioridade && (
                <Badge variant="outline" className="mt-1">
                  prioridade: {a.prioridade}
                </Badge>
              )}
              {a.controle && (
                <Badge variant="outline" className="mt-1">
                  controle: {a.controle}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded border border-border bg-card/40 p-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground">{value || "—"}</div>
    </div>
  );
}

// ==================== HISTÓRICO ====================

function EnvHistoryPanel() {
  const listFn = useServerFn(listEnvAudits);
  const getFn = useServerFn(getEnvAudit);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: audits = [], isLoading } = useQuery({
    queryKey: ["env-audits"],
    queryFn: () => listFn(),
  });
  const detail = useQuery({
    queryKey: ["env-audit", openId],
    queryFn: () => getFn({ data: { id: openId! } }),
    enabled: Boolean(openId),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditorias recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && audits.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma auditoria salva.</p>
          )}
          <ul className="space-y-2">
            {audits.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setOpenId(a.id)}
                  className={`w-full rounded border border-border p-2 text-left text-sm hover:bg-accent ${openId === a.id ? "bg-accent" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.title}</span>
                    <Badge variant="outline">{a.code}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.area || "—"} · criticidade {a.criticality || "—"} ·{" "}
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes</CardTitle>
        </CardHeader>
        <CardContent>
          {!openId && <p className="text-sm text-muted-foreground">Selecione uma auditoria.</p>}
          {openId && detail.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {openId &&
            detail.data &&
            (() => {
              const payload = detail.data.audit?.ai_payload as EnvAnalysisResult | null;
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <h3 className="text-base font-semibold">{detail.data.audit?.title}</h3>
                    <p className="text-xs text-muted-foreground">{detail.data.audit?.summary}</p>
                  </div>
                  <div className="text-xs">
                    Findings: {detail.data.findings.length} · Ações: {detail.data.actions.length} ·
                    Anexos: {detail.data.attachments.length}
                  </div>
                  {payload && <AnalysisView a={payload} />}
                </div>
              );
            })()}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== helpers ====================

function severityClass(sev: string) {
  return (
    {
      muito_baixo: "bg-green-500/15 text-green-300",
      baixo: "bg-teal-500/15 text-teal-300",
      moderado: "bg-yellow-500/15 text-yellow-300",
      alto: "bg-orange-500/15 text-orange-300",
      critico: "bg-red-500/15 text-red-300",
    }[sev] || "bg-muted"
  );
}

function mapCriticality(
  sev?: string,
): "controlada" | "baixa" | "moderada" | "alta" | "muito_alta" | "critica" | null {
  switch (sev) {
    case "muito_baixo":
      return "controlada";
    case "baixo":
      return "baixa";
    case "moderado":
      return "moderada";
    case "alto":
      return "alta";
    case "critico":
      return "critica";
    default:
      return null;
  }
}
function mapConfidence(c?: string): number | null {
  return c === "alta" ? 90 : c === "media" ? 65 : c === "baixa" ? 35 : null;
}
function mapControl(
  c?: string,
):
  | "eliminacao"
  | "substituicao"
  | "reducao_geracao"
  | "engenharia"
  | "contencao"
  | "monitoramento"
  | "administrativo"
  | "treinamento"
  | "emergencia"
  | "compensacao"
  | null {
  const allowed = ["eliminacao", "substituicao", "engenharia", "administrativo"];
  if (!c) return null;
  if (allowed.includes(c)) return c as never;
  if (c === "epi") return "administrativo";
  return null;
}
function mapFindingClassification(t?: string) {
  switch (t) {
    case "conforme":
      return "boa_pratica";
    case "conforme_com_observacao":
      return "observacao";
    case "oportunidade_melhoria":
      return "oportunidade";
    case "nc_menor":
      return "nc_documental";
    case "nc_maior":
      return "nc_operacional";
    case "critica":
      return "risco_critico";
    case "emergencia_ambiental":
      return "emergencia_potencial";
    default:
      return null;
  }
}
function actionRow(
  a: {
    descricao: string;
    o_que?: string;
    por_que?: string;
    onde?: string;
    quando?: string;
    quem?: string;
    como?: string;
    quanto?: string;
    controle?: string;
    prioridade?: string;
    evidencia_requerida?: string;
  },
  tier: "imediata" | "kaisen" | "engenharia" | "inovacao",
) {
  return {
    tier,
    what: a.descricao || a.o_que || "Ação",
    why: a.por_que ?? null,
    where_: a.onde ?? null,
    when_: a.quando ?? null,
    who: a.quem ?? null,
    how: a.como ?? null,
    howMuch: null as null,
    priority: (["baixa", "media", "alta", "critica"].includes(a.prioridade ?? "")
      ? a.prioridade
      : "media") as "baixa" | "media" | "alta" | "critica",
    indicator: a.evidencia_requerida ?? null,
  };
}
