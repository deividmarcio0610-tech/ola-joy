import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Camera, Upload, Sparkles, X, MapPin, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { handleAiError } from "@/lib/ai-credits-error";
import { analisarAmbienteComIris, ensureFreshSession } from "@/lib/iris-analyze";
import { saveEnvironmentalRecord } from "@/lib/environmental/records.functions";

const CATEGORIES = [
  ["vazamento", "Vazamento"], ["derramamento", "Derramamento"],
  ["contaminacao_solo", "Contaminação do solo"], ["contaminacao_agua", "Contaminação da água"],
  ["emissao_atmosferica", "Emissão atmosférica"], ["poeira", "Poeira"], ["fumaca", "Fumaça"], ["gases", "Gases"],
  ["ruido", "Ruído ambiental"], ["vibracao", "Vibração"],
  ["residuo_perigoso", "Resíduo perigoso"], ["residuo_nao_perigoso", "Resíduo não perigoso"],
  ["segregacao_incorreta", "Segregação incorreta"], ["armazenamento_inadequado", "Armazenamento inadequado"],
  ["descarte_irregular", "Descarte irregular"], ["falha_contencao", "Falha em contenção"],
  ["falha_drenagem", "Falha em drenagem"], ["efluente", "Efluente"],
  ["produto_quimico", "Produto químico"], ["oleo", "Óleo"], ["combustivel", "Combustível"],
  ["material_contaminado", "Material contaminado"],
  ["supressao_vegetal", "Supressão vegetal"], ["danos_fauna", "Danos à fauna"], ["danos_flora", "Danos à flora"],
  ["assoreamento", "Assoreamento"], ["erosao", "Erosão"], ["obstrucao_canaleta", "Obstrução de canaleta"],
  ["desperdicio_agua", "Desperdício de água"], ["desperdicio_energia", "Desperdício de energia"],
  ["falha_organizacao", "Falha de organização"], ["falha_documental", "Falha documental"],
  ["nao_conformidade", "Não conformidade ambiental"], ["oportunidade_melhoria", "Oportunidade de melhoria"],
  ["boa_pratica", "Boa prática ambiental"], ["emergencia_ambiental", "Emergência ambiental"],
  ["outro", "Outro"],
] as const;

const LEVELS: Array<[number, string, string]> = [
  [10, "muito_baixo", "Muito baixo"],
  [15, "baixo", "Baixo"],
  [20, "moderado", "Moderado"],
  [25, "alto", "Alto"],
  [30, "critico", "Crítico"],
];

function scoreToLevel(score: number) {
  for (const [max, key, label] of LEVELS) if (score <= max) return { key, label };
  return { key: "critico", label: "Crítico" };
}

const levelColor: Record<string, string> = {
  muito_baixo: "bg-green-500/15 text-green-300 ring-green-500/40",
  baixo: "bg-teal-500/15 text-teal-300 ring-teal-500/40",
  moderado: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40",
  alto: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  critico: "bg-red-500/15 text-red-300 ring-red-500/40",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type ActionItem = {
  description: string;
  responsible: string;
  deadline: string;
  priority: "baixa" | "media" | "alta" | "critica";
  evidence_required: string;
};

export function EnvRecordDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const saveRecordFn = useServerFn(saveEnvironmentalRecord);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<{ path: string; url: string }[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [location, setLocation] = useState("");
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("");
  const [source, setSource] = useState("");

  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [aspect, setAspect] = useState("");
  const [impactDirect, setImpactDirect] = useState("");
  const [impactIndirect, setImpactIndirect] = useState("");
  const [medium, setMedium] = useState("");

  const [severity, setSeverity] = useState(2);
  const [probability, setProbability] = useState(2);
  const [scope, setScope] = useState(2);
  const [persistence, setPersistence] = useState(2);
  const [sensitivity, setSensitivity] = useState(2);
  const [control, setControl] = useState(2);

  const [immediate, setImmediate] = useState<ActionItem[]>([]);
  const [corrective, setCorrective] = useState<ActionItem[]>([]);
  const [preventive, setPreventive] = useState<ActionItem[]>([]);

  const [aiRaw, setAiRaw] = useState<Record<string, unknown> | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const score = severity + probability + scope + persistence + sensitivity + control;
  const lvl = scoreToLevel(score);

  function reset() {
    setStep(1);
    setFiles([]); setPreviews([]); setUploaded([]); setGeo(null);
    setTitle(""); setArea(""); setLocation(""); setEquipment("");
    setDescription(""); setMaterial(""); setSource("");
    setSelectedCats([]); setAspect(""); setImpactDirect(""); setImpactIndirect(""); setMedium("");
    setSeverity(2); setProbability(2); setScope(2);
    setPersistence(2); setSensitivity(2); setControl(2);
    setImmediate([]); setCorrective([]); setPreventive([]);
    setAiRaw(null); setAiNotice(null);
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 6);
    setFiles((prev) => [...prev, ...arr].slice(0, 6));
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setPreviews((p) => [...p, r.result as string]);
      r.readAsDataURL(f);
    });
  }

  function captureGeo() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("Não foi possível obter localização"),
      { timeout: 5000 }
    );
  }

  const analyze = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Anexe ao menos uma imagem");
      await ensureFreshSession();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (userError || !uid) throw new Error("Sessão inválida. Faça login novamente.");
      // upload
      const up: { path: string; url: string }[] = [];
      for (const f of files) {
        const path = `${uid}/env/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const upR = await supabase.storage.from("inspections").upload(path, f);
        if (upR.error) throw upR.error;
        const s = await supabase.storage.from("inspections").createSignedUrl(path, 60 * 60);
        up.push({ path, url: s.data?.signedUrl ?? "" });
      }
      setUploaded(up);

      const result = await analisarAmbienteComIris({
        imageUrls: up.map((u) => u.url).filter(Boolean),
        area: area || null,
        location: location || null,
        equipment: equipment || null,
        description: description || null,
      });
      return result;
    },
    onSuccess: (r) => {
      setAiRaw(r);
      if (r.needs_more_evidence) {
        setAiNotice(String(r.reason_if_insufficient ?? "A IA pediu evidências complementares."));
      } else {
        setAiNotice(null);
      }
      const cats = Array.isArray(r.categories) ? (r.categories as string[]).slice(0, 3) : [];
      setSelectedCats(cats);
      setAspect(String(r.aspect ?? ""));
      setImpactDirect(String(r.impact_direct ?? ""));
      setImpactIndirect(String(r.impact_indirect ?? ""));
      setMedium(String(r.medium ?? ""));
      const m = (r.matrix ?? {}) as Record<string, number>;
      if (m.severity) setSeverity(m.severity);
      if (m.probability) setProbability(m.probability);
      if (m.scope) setScope(m.scope);
      if (m.persistence) setPersistence(m.persistence);
      if (m.sensitivity) setSensitivity(m.sensitivity);
      if (m.control) setControl(m.control);
      if (!title) setTitle(String(r.condition_description ?? "").slice(0, 80));
      if (!description) setDescription(String(r.condition_description ?? ""));
      if (!source) setSource(String(r.source ?? ""));
      if (!material) setMaterial(String(r.material ?? ""));
      const acts = (r.actions ?? {}) as Record<string, Array<Record<string, string>>>;
      const toItems = (arr?: Array<Record<string, string>>): ActionItem[] =>
        (arr ?? []).map((a) => ({
          description: a.description ?? "",
          responsible: "",
          deadline: "",
          priority: (a.priority as ActionItem["priority"]) ?? "media",
          evidence_required: a.evidence_required ?? "",
        }));
      setImmediate(toItems(acts.immediate));
      setCorrective(toItems(acts.corrective));
      setPreventive(toItems(acts.preventive));
      setStep(3);
    },
    onError: (e: Error) => handleAiError(e, "Falha na análise por IA"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const photoUrl = uploaded[0]?.path ? uploaded[0].path : null;

      await saveRecordFn({
        data: {
          title: title || "Registro ambiental",
          description,
          area: area || null,
          location: location || null,
          equipment: equipment || null,
          priority: score >= 21 ? "critica" : score >= 16 ? "alta" : score >= 11 ? "media" : "baixa",
          photoUrl,
          categories: selectedCats,
          aspect: aspect || null,
          impactDirect: impactDirect || null,
          impactIndirect: impactIndirect || null,
          medium: medium || null,
          source: source || null,
          material: material || null,
          severity,
          probability,
          scope,
          persistence,
          sensitivity,
          control,
          scoreBefore: score,
          levelBefore: lvl.key,
          actions: { immediate, corrective, preventive },
          aiBefore: aiRaw,
        },
      });
    },
    onSuccess: () => {
      toast.success("Registro ambiental salvo");
      qc.invalidateQueries({ queryKey: ["env-records"] });
      qc.invalidateQueries({ queryKey: ["env-kpis"] });
      onOpenChange(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Registrar condição ambiental
            <Badge variant="outline" className="text-xs">Passo {step}/4</Badge>
          </DialogTitle>
          <DialogDescription>
            Inspeção, auditoria e análise de impactos com apoio da IA.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => cameraRef.current?.click()} className="h-24 flex-col">
                <Camera className="w-6 h-6 mb-1" /> Tirar foto
              </Button>
              <Button variant="outline" onClick={() => galleryRef.current?.click()} className="h-24 flex-col">
                <Upload className="w-6 h-6 mb-1" /> Galeria / vídeo / documento
              </Button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPickFiles(e.target.files)} />
            <input ref={galleryRef} type="file" accept="image/*,video/*,.pdf,.xls,.xlsx,.doc,.docx" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />

            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative group aspect-square rounded-md overflow-hidden ring-1 ring-border">
                    <img src={src} alt={`ev-${i}`} className="w-full h-full object-cover" />
                    <button onClick={() => { setPreviews((p) => p.filter((_, j) => j !== i)); setFiles((p) => p.filter((_, j) => j !== i)); }} className="absolute top-1 right-1 rounded-full bg-black/70 p-1 opacity-0 group-hover:opacity-100 transition"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Área</Label><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Oficina Mecânica" /></div>
              <div><Label>Local</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Baia 03" /></div>
              <div><Label>Equipamento / estrutura</Label><Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Ex.: Escavadeira 320" /></div>
              <div>
                <Label>Localização GPS</Label>
                <Button type="button" variant="outline" size="sm" onClick={captureGeo} className="w-full">
                  <MapPin className="w-4 h-4 mr-1" />
                  {geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : "Capturar"}
                </Button>
              </div>
            </div>
            <div>
              <Label>Descrição inicial (opcional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva brevemente o que você observou..." />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-md border border-neon/30 bg-neon/5 p-4 text-sm">
              A IA analisará todas as evidências, sugerirá categorias, aspecto/impacto, matriz de criticidade e plano de ação. Você poderá ajustar tudo antes de salvar.
            </div>
            {analyze.isPending && (
              <div className="flex items-center gap-3 justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Analisando evidências ambientais...</span>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            {aiNotice && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-200">
                {aiNotice}
              </div>
            )}
            <div>
              <Label>Categorias identificadas</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-32 overflow-y-auto p-1">
                {CATEGORIES.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setSelectedCats((c) => c.includes(v) ? c.filter((x) => x !== v) : [...c, v])} className={`text-xs px-2 py-1 rounded-full ring-1 transition ${selectedCats.includes(v) ? "bg-neon/20 text-neon ring-neon/40" : "bg-muted/40 text-muted-foreground ring-border hover:bg-muted"}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Aspecto ambiental</Label><Input value={aspect} onChange={(e) => setAspect(e.target.value)} /></div>
              <div>
                <Label>Meio afetado</Label>
                <select value={medium} onChange={(e) => setMedium(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  <option value="solo">Solo</option>
                  <option value="agua">Água</option>
                  <option value="ar">Ar</option>
                  <option value="flora_fauna">Flora/Fauna</option>
                  <option value="misto">Misto</option>
                </select>
              </div>
              <div><Label>Impacto direto</Label><Textarea rows={2} value={impactDirect} onChange={(e) => setImpactDirect(e.target.value)} /></div>
              <div><Label>Impacto indireto</Label><Textarea rows={2} value={impactIndirect} onChange={(e) => setImpactIndirect(e.target.value)} /></div>
              <div><Label>Fonte geradora</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
              <div><Label>Material</Label><Input value={material} onChange={(e) => setMaterial(e.target.value)} /></div>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Matriz de criticidade ambiental</span>
                <div className={`px-2 py-0.5 rounded-full text-xs ring-1 ${levelColor[lvl.key]}`}>
                  {score}/30 · {lvl.label}
                </div>
              </div>
              {[
                { l: "Severidade", v: severity, s: setSeverity },
                { l: "Probabilidade", v: probability, s: setProbability },
                { l: "Abrangência", v: scope, s: setScope },
                { l: "Persistência", v: persistence, s: setPersistence },
                { l: "Sensibilidade do meio", v: sensitivity, s: setSensitivity },
                { l: "Controle existente", v: control, s: setControl },
              ].map((row) => (
                <div key={row.l} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{row.l}</span>
                      <span className="font-mono">{row.v}</span>
                    </div>
                    <Slider min={1} max={5} step={1} value={[row.v]} onValueChange={(v) => row.s(v[0])} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md border border-neon/30 bg-neon/5 p-3 text-xs">
              Plano de ação sugerido pela IA. Defina responsável e prazo antes de salvar.
            </div>
            {([
              ["Ação imediata", immediate, setImmediate],
              ["Ação corretiva", corrective, setCorrective],
              ["Ação preventiva", preventive, setPreventive],
            ] as const).map(([title, arr, setArr]) => (
              <div key={title} className="border border-border rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium">{title}</div>
                {arr.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma ação sugerida.</div>}
                {arr.map((a, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2 items-start">
                    <Textarea rows={2} value={a.description} onChange={(e) => setArr(arr.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} className="col-span-6 text-xs" />
                    <Input placeholder="Responsável" value={a.responsible} onChange={(e) => setArr(arr.map((x, j) => j === i ? { ...x, responsible: e.target.value } : x))} className="col-span-3 h-8 text-xs" />
                    <Input placeholder="Prazo" type="date" value={a.deadline} onChange={(e) => setArr(arr.map((x, j) => j === i ? { ...x, deadline: e.target.value } : x))} className="col-span-2 h-8 text-xs" />
                    <Button variant="ghost" size="sm" onClick={() => setArr(arr.filter((_, j) => j !== i))} className="col-span-1 h-8 p-0"><X className="w-3 h-3" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setArr([...arr, { description: "", responsible: "", deadline: "", priority: "media", evidence_required: "" }])} className="w-full h-7 text-xs">+ Adicionar</Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}><ChevronLeft className="w-4 h-4 mr-1" />Voltar</Button>}
          {step === 1 && <Button onClick={() => { if (files.length === 0) { toast.error("Anexe ao menos uma imagem"); return; } setStep(2); analyze.mutate(); }} disabled={files.length === 0}><Sparkles className="w-4 h-4 mr-1" />Analisar com a IA</Button>}
          {step === 2 && <Button disabled variant="outline"><Loader2 className="w-4 h-4 mr-1 animate-spin" />Aguarde</Button>}
          {step === 3 && <Button onClick={() => setStep(4)}>Plano de ação<ChevronRight className="w-4 h-4 ml-1" /></Button>}
          {step === 4 && <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}<Check className="w-4 h-4 mr-1" />Salvar registro</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
