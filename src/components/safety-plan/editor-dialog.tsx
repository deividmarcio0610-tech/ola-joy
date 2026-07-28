import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Square,
  Type,
  Trash2,
  Undo2,
  Redo2,
  Save,
  Download,
  FileText,
  MoveRight,
  X,
  Waypoints,
  Ban,
  Upload,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IconSvg, LIBRARY, CATEGORY_LABEL } from "@/lib/safety-plan/icons";
import {
  PALETTE,
  PRIORITY_COLOR,
  TECHNICAL_WARNING,
  type CategoryKey,
  type IconKey,
  type InterventionPriority,
  type InterventionStatus,
  type ProjectIntervention,
  type SafetyPlanState,
  type ShapeKind,
} from "@/lib/safety-plan/types";
import { exportPlanToPdf, renderPlanToPng, downloadBlob, downloadDataUrl } from "@/lib/safety-plan/export";
import { saveSafetyPlan } from "@/lib/safety-plan/safety-plans.functions";

const VB_W = 1600;
const VB_H = 1000;

type Tool =
  | { kind: "select" }
  | { kind: "rect"; color: string }
  | { kind: "arrow"; color: string }
  | { kind: "remove" }
  | { kind: "relocate" }
  | { kind: "route"; color: string }
  | { kind: "text"; color: string }
  | { kind: "icon"; iconKey: IconKey; color: string; category: CategoryKey };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  photoUrl?: string;
  recordId?: string | null;
  moduleKey?: string | null;
  title?: string;
}

export function SafetyPlanEditorDialog({
  open,
  onOpenChange,
  photoUrl: initialPhoto,
  recordId,
  moduleKey,
  title,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(initialPhoto);
  const [interventions, setInterventions] = useState<ProjectIntervention[]>([]);
  const [meta, setMeta] = useState<SafetyPlanState["meta"]>({
    data: new Date().toLocaleDateString("pt-BR"),
  });
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"projeto" | "antes">("projeto");
  const [saving, setSaving] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<null | { start: { x: number; y: number }; id: string }>(null);
  const [routePoints, setRoutePoints] = useState<number[]>([]);
  const [history, setHistory] = useState<ProjectIntervention[][]>([]);
  const [future, setFuture] = useState<ProjectIntervention[][]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const save = useServerFn(saveSafetyPlan);

  useEffect(() => {
    if (open) {
      setPhotoUrl(initialPhoto);
      setInterventions([]);
      setPlanId(null);
      setSelectedId(null);
      setHistory([]);
      setFuture([]);
      setRoutePoints([]);
      setTool({ kind: "select" });
    }
  }, [open, initialPhoto]);

  const pushHistory = useCallback((next: ProjectIntervention[]) => {
    setHistory((h) => [...h, interventions]);
    setFuture([]);
    setInterventions(next);
  }, [interventions]);

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [interventions, ...f]);
      setInterventions(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h, interventions]);
      setInterventions(next);
      return f.slice(1);
    });
  };

  const nextNumber = () => (interventions.reduce((m, i) => Math.max(m, i.number), 0) || 0) + 1;

  const svgToUser = (evt: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const addSimpleAt = (x: number, y: number) => {
    const t = tool;
    if (t.kind === "icon") {
      const size = 80;
      const it: ProjectIntervention = {
        id: cryptoId(),
        number: nextNumber(),
        category: t.category,
        elementType: "icon",
        iconKey: t.iconKey,
        title: LIBRARY.find((l) => l.key === t.iconKey)?.label ?? "Elemento",
        description: "",
        priority: "média",
        status: "proposta",
        position: { x: x - size / 2, y: y - size / 2, width: size, height: size },
        style: { stroke: t.color, opacity: 1, strokeWidth: 4 },
        createdAt: new Date().toISOString(),
      };
      pushHistory([...interventions, it]);
      setSelectedId(it.id);
    } else if (t.kind === "text") {
      const it: ProjectIntervention = {
        id: cryptoId(),
        number: nextNumber(),
        category: "sinalizacao",
        elementType: "text",
        title: "Anotação",
        description: "",
        text: "TEXTO",
        priority: "média",
        status: "proposta",
        position: { x, y, width: 200, height: 40 },
        style: { stroke: t.color, fill: "#ffffffcc", strokeWidth: 1 },
        createdAt: new Date().toISOString(),
      };
      pushHistory([...interventions, it]);
      setSelectedId(it.id);
    }
  };

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tab !== "projeto") return;
    const { x, y } = svgToUser(e);
    if (tool.kind === "select") return;
    if (tool.kind === "icon" || tool.kind === "text") {
      addSimpleAt(x, y);
      setTool({ kind: "select" });
      return;
    }
    if (tool.kind === "route") {
      const next = [...routePoints, x, y];
      setRoutePoints(next);
      return;
    }
    if (tool.kind === "rect" || tool.kind === "remove" || tool.kind === "relocate" || tool.kind === "arrow") {
      const id = cryptoId();
      setDrawing({ start: { x, y }, id });
      const color = tool.kind === "remove" ? PALETTE.vermelho : tool.kind === "relocate" ? PALETTE.laranja : tool.color;
      const kind: ShapeKind =
        tool.kind === "remove" ? "remove" : tool.kind === "relocate" ? "relocate" : tool.kind === "arrow" ? "arrow" : "rect";
      const it: ProjectIntervention = {
        id,
        number: nextNumber(),
        category: kind === "remove" ? "circulacao" : "sinalizacao",
        elementType: kind,
        title: kind === "remove" ? "Remover item" : kind === "relocate" ? "Realocar item" : kind === "arrow" ? "Indicação" : "Área",
        description: "",
        text: kind === "remove" ? "REMOVER" : kind === "relocate" ? "REALOCAR" : undefined,
        priority: kind === "remove" ? "alta" : "média",
        status: "proposta",
        position: { x, y, width: 1, height: 1 },
        style: { stroke: color, fill: color + "55", opacity: 0.4, strokeWidth: 4 },
        createdAt: new Date().toISOString(),
      };
      pushHistory([...interventions, it]);
    }
  };

  const onSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const { x, y } = svgToUser(e);
    setInterventions((list) =>
      list.map((it) =>
        it.id === drawing.id
          ? {
              ...it,
              position: {
                ...it.position,
                x: Math.min(drawing.start.x, x),
                y: Math.min(drawing.start.y, y),
                width: Math.abs(x - drawing.start.x),
                height: Math.abs(y - drawing.start.y),
              },
            }
          : it,
      ),
    );
  };

  const onSvgMouseUp = () => {
    if (drawing) {
      setSelectedId(drawing.id);
      setDrawing(null);
      setTool({ kind: "select" });
    }
  };

  const finishRoute = () => {
    if (routePoints.length < 4) {
      setRoutePoints([]);
      return;
    }
    const xs = routePoints.filter((_, i) => i % 2 === 0);
    const ys = routePoints.filter((_, i) => i % 2 === 1);
    const it: ProjectIntervention = {
      id: cryptoId(),
      number: nextNumber(),
      category: "circulacao",
      elementType: "polyline",
      title: "Rota / Circulação",
      description: "",
      priority: "média",
      status: "proposta",
      position: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        points: routePoints,
      },
      style: { stroke: (tool as { color?: string }).color ?? PALETTE.verde, strokeWidth: 6, opacity: 0.9 },
      createdAt: new Date().toISOString(),
    };
    pushHistory([...interventions, it]);
    setRoutePoints([]);
    setTool({ kind: "select" });
  };

  const selected = interventions.find((i) => i.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<ProjectIntervention>) => {
    if (!selected) return;
    setInterventions((list) => list.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)));
  };

  const deleteSelected = () => {
    if (!selected) return;
    pushHistory(interventions.filter((i) => i.id !== selected.id).map((i, idx) => ({ ...i, number: idx + 1 })));
    setSelectedId(null);
  };

  const svgMarkup = useMemo(() => renderSvgString(interventions), [interventions]);

  const handleExportPng = async () => {
    if (!photoUrl) return toast.error("Carregue uma fotografia primeiro.");
    try {
      const dataUrl = await renderPlanToPng(photoUrl, svgMarkup, VB_W, VB_H);
      downloadDataUrl(dataUrl, `projeto-executivo-${Date.now()}.png`);
    } catch (e) {
      toast.error("Falha ao exportar PNG. A foto deve permitir CORS.");
    }
  };

  const handleExportPdf = async (format: "a4-portrait" | "a4-landscape" | "a3-landscape") => {
    if (!photoUrl) return toast.error("Carregue uma fotografia primeiro.");
    try {
      const blob = await exportPlanToPdf(photoUrl, svgMarkup, VB_W, VB_H, { interventions, meta }, {
        title: title ?? "Projeto Executivo",
        local: meta.local,
        responsavel: meta.responsavel,
        data: meta.data,
        format,
      });
      downloadBlob(blob, `projeto-executivo-${Date.now()}.pdf`);
    } catch (e) {
      toast.error("Falha ao gerar PDF.");
    }
  };

  const handleSave = async () => {
    if (!photoUrl) return toast.error("Carregue uma fotografia primeiro.");
    setSaving(true);
    try {
      const row = await save({
        data: {
          id: planId ?? undefined,
          recordId: recordId ?? null,
          moduleKey: moduleKey ?? null,
          title: title ?? "Projeto Executivo",
          photoUrl,
          interventions,
          state: { interventions, meta },
        },
      });
      const rowObj = row as { id?: string } | null;
      if (rowObj?.id) setPlanId(rowObj.id);
      toast.success("Projeto salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-2 border-b">
          <DialogTitle className="text-base">
            Projeto Executivo de Segurança{title ? ` — ${title}` : ""}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "projeto" | "antes")} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2 flex items-center gap-2 flex-wrap">
            <TabsList>
              <TabsTrigger value="antes">Antes</TabsTrigger>
              <TabsTrigger value="projeto">Projeto</TabsTrigger>
            </TabsList>
            <Separator orientation="vertical" className="h-6" />
            <Toolbar
              tool={tool}
              setTool={setTool}
              onUndo={undo}
              onRedo={redo}
              canUndo={history.length > 0}
              canRedo={future.length > 0}
              onSave={handleSave}
              saving={saving}
              onExportPng={handleExportPng}
              onExportPdf={handleExportPdf}
              onFinishRoute={finishRoute}
              routeActive={tool.kind === "route" && routePoints.length > 0}
            />
            {!photoUrl && (
              <label className="ml-auto cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
                <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Carregar fotografia
                </span>
              </label>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[220px_1fr_320px] gap-0">
            <TabsContent value="projeto" className="contents">
              <Library onPick={(li) => setTool({ kind: "icon", iconKey: li.key, color: li.color, category: li.category })} />
              <Canvas
                svgRef={svgRef}
                photoUrl={photoUrl}
                interventions={interventions}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMouseDown={onSvgMouseDown}
                onMouseMove={onSvgMouseMove}
                onMouseUp={onSvgMouseUp}
                previewRoute={routePoints}
              />
              <PropertiesPanel
                selected={selected}
                onChange={updateSelected}
                onDelete={deleteSelected}
                meta={meta}
                onMetaChange={setMeta}
                interventions={interventions}
              />
            </TabsContent>
            <TabsContent value="antes" className="col-span-full h-full">
              <BeforeView photoUrl={photoUrl} />
            </TabsContent>
          </div>
        </Tabs>

        <div className="px-4 py-2 border-t text-[11px] text-muted-foreground italic">
          {TECHNICAL_WARNING}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cryptoId() {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
}

/* ---------------- subcomponents ---------------- */

function Toolbar({
  tool,
  setTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  saving,
  onExportPng,
  onExportPdf,
  onFinishRoute,
  routeActive,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  saving: boolean;
  onExportPng: () => void;
  onExportPdf: (fmt: "a4-portrait" | "a4-landscape" | "a3-landscape") => void;
  onFinishRoute: () => void;
  routeActive: boolean;
}) {
  const btn = (active: boolean) => `h-8 px-2 ${active ? "bg-primary text-primary-foreground" : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="outline" className={btn(tool.kind === "select")} onClick={() => setTool({ kind: "select" })}>
        Selecionar
      </Button>
      <Button size="sm" variant="outline" className={btn(tool.kind === "rect")} onClick={() => setTool({ kind: "rect", color: PALETTE.amarelo })}>
        <Square className="h-4 w-4" /> Área
      </Button>
      <Button size="sm" variant="outline" className={btn(tool.kind === "arrow")} onClick={() => setTool({ kind: "arrow", color: PALETTE.azul })}>
        <ArrowRight className="h-4 w-4" /> Seta
      </Button>
      <Button size="sm" variant="outline" className={btn(tool.kind === "remove")} onClick={() => setTool({ kind: "remove" })}>
        <Ban className="h-4 w-4" /> Remover
      </Button>
      <Button size="sm" variant="outline" className={btn(tool.kind === "relocate")} onClick={() => setTool({ kind: "relocate" })}>
        <MoveRight className="h-4 w-4" /> Realocar
      </Button>
      <Button size="sm" variant="outline" className={btn(tool.kind === "route")} onClick={() => setTool({ kind: "route", color: PALETTE.verde })}>
        <Waypoints className="h-4 w-4" /> Rota
      </Button>
      {routeActive && (
        <Button size="sm" onClick={onFinishRoute}>Concluir rota</Button>
      )}
      <Button size="sm" variant="outline" className={btn(tool.kind === "text")} onClick={() => setTool({ kind: "text", color: "#111827" })}>
        <Type className="h-4 w-4" /> Texto
      </Button>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo}><Undo2 className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={onRedo} disabled={!canRedo}><Redo2 className="h-4 w-4" /></Button>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Button size="sm" onClick={onSave} disabled={saving}>
        <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
      </Button>
      <Button size="sm" variant="outline" onClick={onExportPng}>
        <Download className="h-4 w-4" /> PNG
      </Button>
      <Select onValueChange={(v) => onExportPdf(v as "a4-portrait" | "a4-landscape" | "a3-landscape")}>
        <SelectTrigger className="h-8 w-[130px]"><SelectValue placeholder="Exportar PDF" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="a4-landscape">PDF A4 paisagem</SelectItem>
          <SelectItem value="a4-portrait">PDF A4 retrato</SelectItem>
          <SelectItem value="a3-landscape">PDF A3 paisagem</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Library({ onPick }: { onPick: (li: (typeof LIBRARY)[number]) => void }) {
  const grouped = LIBRARY.reduce<Record<CategoryKey, typeof LIBRARY>>((acc, i) => {
    (acc[i.category] ||= [] as typeof LIBRARY).push(i);
    return acc;
  }, {} as Record<CategoryKey, typeof LIBRARY>);
  return (
    <ScrollArea className="border-r hidden md:block">
      <div className="p-2 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Biblioteca</p>
        {(Object.keys(grouped) as CategoryKey[]).map((cat) => (
          <div key={cat}>
            <p className="text-[11px] font-medium mb-1">{CATEGORY_LABEL[cat]}</p>
            <div className="grid grid-cols-2 gap-1">
              {grouped[cat].map((li) => (
                <button
                  key={li.key}
                  onClick={() => onPick(li)}
                  className="border rounded p-1 hover:bg-muted flex flex-col items-center text-[10px]"
                  title={li.label}
                >
                  <svg viewBox="0 0 100 100" className="h-9 w-9">
                    <IconSvg k={li.key} color={li.color} />
                  </svg>
                  <span className="leading-tight text-center line-clamp-2">{li.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function Canvas({
  svgRef,
  photoUrl,
  interventions,
  selectedId,
  onSelect,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  previewRoute,
}: {
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  photoUrl?: string;
  interventions: ProjectIntervention[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  previewRoute: number[];
}) {
  return (
    <div className="bg-neutral-900 flex items-center justify-center min-h-0 overflow-hidden">
      {!photoUrl ? (
        <p className="text-white/70 text-sm p-6 text-center">
          Carregue uma fotografia para começar o projeto.
        </p>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="max-h-full max-w-full w-full h-full touch-none select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          <image href={photoUrl} x={0} y={0} width={VB_W} height={VB_H} preserveAspectRatio="xMidYMid slice" />
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <polygon points="0 0, 10 5, 0 10" fill="context-stroke" />
            </marker>
            <pattern id="hatchRed" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="14" stroke="#ef4444" strokeWidth="4" />
            </pattern>
          </defs>
          {interventions.map((it) => (
            <ShapeNode key={it.id} it={it} selected={it.id === selectedId} onSelect={() => onSelect(it.id)} />
          ))}
          {previewRoute.length >= 2 && (
            <polyline
              points={pointsToStr(previewRoute)}
              fill="none"
              stroke={PALETTE.verde}
              strokeWidth={6}
              strokeDasharray="10 6"
              opacity={0.9}
            />
          )}
        </svg>
      )}
    </div>
  );
}

function ShapeNode({ it, selected, onSelect }: { it: ProjectIntervention; selected: boolean; onSelect: () => void }) {
  const { x, y, width = 0, height = 0, points } = it.position;
  const stroke = it.style.stroke;
  const sw = it.style.strokeWidth ?? 4;
  const label = String(it.number).padStart(2, "0");
  const num = (
    <g>
      <circle cx={x + 18} cy={y + 18} r={16} fill="#111" stroke="#fff" strokeWidth={2} />
      <text x={x + 18} y={y + 22} fontSize={16} textAnchor="middle" fill="#fff" fontWeight={700}>
        {label}
      </text>
    </g>
  );
  const outline = selected ? { filter: "drop-shadow(0 0 4px #22d3ee)" } : {};
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };
  if (it.elementType === "rect") {
    return (
      <g onClick={click} style={outline}>
        <rect x={x} y={y} width={width} height={height} fill={it.style.fill ?? stroke + "55"} stroke={stroke} strokeWidth={sw} opacity={it.style.opacity ?? 0.4} />
        {num}
      </g>
    );
  }
  if (it.elementType === "remove") {
    return (
      <g onClick={click} style={outline}>
        <rect x={x} y={y} width={width} height={height} fill="url(#hatchRed)" opacity={0.5} />
        <rect x={x} y={y} width={width} height={height} fill="none" stroke={PALETTE.vermelho} strokeWidth={sw} />
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fontSize={26} fontWeight={800} fill={PALETTE.vermelho} stroke="#fff" strokeWidth={4} paintOrder="stroke">
          REMOVER
        </text>
        {num}
      </g>
    );
  }
  if (it.elementType === "relocate") {
    return (
      <g onClick={click} style={outline}>
        <rect x={x} y={y} width={width} height={height} fill={PALETTE.laranja + "44"} stroke={PALETTE.laranja} strokeWidth={sw} strokeDasharray="10 6" />
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fontSize={22} fontWeight={800} fill={PALETTE.laranja} stroke="#fff" strokeWidth={3} paintOrder="stroke">
          REALOCAR
        </text>
        {num}
      </g>
    );
  }
  if (it.elementType === "arrow") {
    return (
      <g onClick={click} style={outline}>
        <line x1={x} y1={y} x2={x + width} y2={y + height} stroke={stroke} strokeWidth={sw} markerEnd="url(#arrowhead)" />
        {num}
      </g>
    );
  }
  if (it.elementType === "polyline" && points) {
    return (
      <g onClick={click} style={outline}>
        <polyline points={pointsToStr(points)} fill="none" stroke={stroke} strokeWidth={sw} />
        {num}
      </g>
    );
  }
  if (it.elementType === "text") {
    return (
      <g onClick={click} style={outline}>
        <rect x={x} y={y} width={width} height={height} fill="#ffffffcc" stroke={stroke} strokeWidth={1} rx={4} />
        <text x={x + 10} y={y + (height ?? 30) / 2 + 6} fontSize={18} fill="#111">
          {it.text || it.title}
        </text>
        {num}
      </g>
    );
  }
  if (it.elementType === "icon" && it.iconKey) {
    const size = width || 80;
    return (
      <g onClick={click} style={outline} transform={`translate(${x} ${y}) scale(${size / 100})`}>
        <IconSvg k={it.iconKey} color={stroke} />
        <g transform={`scale(${100 / size})`}>{num}</g>
      </g>
    );
  }
  return null;
}

function pointsToStr(points: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(" ");
}

function PropertiesPanel({
  selected,
  onChange,
  onDelete,
  meta,
  onMetaChange,
  interventions,
}: {
  selected: ProjectIntervention | null;
  onChange: (p: Partial<ProjectIntervention>) => void;
  onDelete: () => void;
  meta: SafetyPlanState["meta"];
  onMetaChange: (m: SafetyPlanState["meta"]) => void;
  interventions: ProjectIntervention[];
}) {
  return (
    <ScrollArea className="border-l hidden md:block">
      <div className="p-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Cabeçalho</p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-[11px]">Local</Label>
              <Input className="h-8" value={meta.local ?? ""} onChange={(e) => onMetaChange({ ...meta, local: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">Responsável</Label>
              <Input className="h-8" value={meta.responsavel ?? ""} onChange={(e) => onMetaChange({ ...meta, responsavel: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">Data</Label>
              <Input className="h-8" value={meta.data ?? ""} onChange={(e) => onMetaChange({ ...meta, data: e.target.value })} />
            </div>
          </div>
        </div>

        <Separator />

        {selected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Intervenção #{String(selected.number).padStart(2, "0")}</p>
              <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
            <div>
              <Label className="text-[11px]">Título</Label>
              <Input className="h-8" value={selected.title} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">Descrição</Label>
              <Textarea rows={3} value={selected.description} onChange={(e) => onChange({ description: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">Norma (referência a validar pelo responsável técnico)</Label>
              <Input className="h-8" placeholder="Ex.: NR-35 item 3.2" value={selected.standard ?? ""} onChange={(e) => onChange({ standard: e.target.value })} />
            </div>
            {selected.elementType === "text" && (
              <div>
                <Label className="text-[11px]">Texto exibido</Label>
                <Input className="h-8" value={selected.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Prioridade</Label>
                <Select value={selected.priority} onValueChange={(v) => onChange({ priority: v as InterventionPriority, style: { ...selected.style, stroke: PRIORITY_COLOR[v as InterventionPriority] } })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["baixa", "média", "alta", "crítica"] as InterventionPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Status</Label>
                <Select value={selected.status} onValueChange={(v) => onChange({ status: v as InterventionStatus })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["proposta", "aprovada", "em_execucao", "executada", "reprovada", "nao_aplicavel"] as InterventionStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Selecione uma intervenção no desenho ou insira um elemento.</p>
        )}

        <Separator />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Memorial ({interventions.length})</p>
          <ol className="space-y-1 text-[11px]">
            {interventions.map((i) => (
              <li key={i.id} className="border-l-2 pl-2" style={{ borderColor: i.style.stroke }}>
                <div className="flex items-center gap-1">
                  <span className="font-bold">{String(i.number).padStart(2, "0")}</span>
                  <Badge variant="outline" className="h-4 text-[9px]">{i.standard ?? "ref."}</Badge>
                  <span className="truncate">{i.title}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </ScrollArea>
  );
}

function BeforeView({ photoUrl }: { photoUrl?: string }) {
  return (
    <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
      {photoUrl ? (
        <img src={photoUrl} alt="Antes" className="max-h-full max-w-full object-contain" />
      ) : (
        <p className="text-white/60 text-sm">Carregue a fotografia original.</p>
      )}
    </div>
  );
}

/* ---------------- SVG string renderer for export ---------------- */

function renderSvgString(items: ProjectIntervention[]): string {
  const parts: string[] = [
    `<defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill="context-stroke"/>
      </marker>
      <pattern id="hatchRed" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="14" stroke="#ef4444" stroke-width="4"/>
      </pattern>
    </defs>`,
  ];
  for (const it of items) {
    const { x, y, width = 0, height = 0, points } = it.position;
    const s = it.style.stroke;
    const sw = it.style.strokeWidth ?? 4;
    const num = String(it.number).padStart(2, "0");
    const numBadge = `<circle cx="${x + 18}" cy="${y + 18}" r="16" fill="#111" stroke="#fff" stroke-width="2"/><text x="${x + 18}" y="${y + 22}" font-size="16" text-anchor="middle" fill="#fff" font-weight="700">${num}</text>`;
    if (it.elementType === "rect")
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${it.style.fill ?? s + "55"}" stroke="${s}" stroke-width="${sw}" opacity="${it.style.opacity ?? 0.4}"/>${numBadge}`);
    else if (it.elementType === "remove")
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#hatchRed)" opacity="0.5"/><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="#ef4444" stroke-width="${sw}"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" font-size="26" font-weight="800" fill="#ef4444" stroke="#fff" stroke-width="4" paint-order="stroke">REMOVER</text>${numBadge}`);
    else if (it.elementType === "relocate")
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f9731644" stroke="#f97316" stroke-width="${sw}" stroke-dasharray="10 6"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" font-size="22" font-weight="800" fill="#f97316" stroke="#fff" stroke-width="3" paint-order="stroke">REALOCAR</text>${numBadge}`);
    else if (it.elementType === "arrow")
      parts.push(`<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y + height}" stroke="${s}" stroke-width="${sw}" marker-end="url(#arrowhead)"/>${numBadge}`);
    else if (it.elementType === "polyline" && points)
      parts.push(`<polyline points="${pointsToStr(points)}" fill="none" stroke="${s}" stroke-width="${sw}"/>${numBadge}`);
    else if (it.elementType === "text")
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffffcc" stroke="${s}" stroke-width="1" rx="4"/><text x="${x + 10}" y="${y + (height || 30) / 2 + 6}" font-size="18" fill="#111">${escapeXml(it.text || it.title)}</text>${numBadge}`);
    else if (it.elementType === "icon" && it.iconKey) {
      const size = width || 80;
      const iconMarkup = iconToString(it.iconKey, s);
      parts.push(`<g transform="translate(${x} ${y}) scale(${size / 100})">${iconMarkup}</g>${numBadge}`);
    }
  }
  return parts.join("");
}

function iconToString(k: IconKey, color: string): string {
  const sw = 6;
  const common = `stroke="${color}" fill="none" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
  switch (k) {
    case "cone":
      return `<g ${common}><polygon points="50,10 80,90 20,90"/><line x1="30" y1="60" x2="70" y2="60"/><line x1="10" y1="95" x2="90" y2="95"/></g>`;
    case "extintor":
      return `<g ${common}><rect x="35" y="30" width="30" height="55" rx="4"/><rect x="42" y="15" width="16" height="15"/><line x1="65" y1="35" x2="85" y2="20"/><circle cx="85" cy="20" r="4"/></g>`;
    case "hidrante":
      return `<g ${common}><rect x="35" y="35" width="30" height="55" rx="4"/><circle cx="50" cy="55" r="6"/><line x1="25" y1="55" x2="35" y2="55"/><line x1="65" y1="55" x2="75" y2="55"/><line x1="20" y1="90" x2="80" y2="90"/></g>`;
    case "saida":
      return `<g ${common}><rect x="15" y="20" width="70" height="60" rx="4"/><polyline points="35,50 65,50 55,40"/><polyline points="65,50 55,60"/></g>`;
    case "epi":
      return `<g ${common}><path d="M20,60 Q50,10 80,60 L80,75 L20,75 Z"/><line x1="20" y1="75" x2="80" y2="75"/></g>`;
    case "rota":
      return `<g ${common}><polyline points="15,80 40,50 60,60 85,25"/><polygon points="85,25 78,28 82,35" fill="${color}"/></g>`;
    case "eletrico":
      return `<g ${common}><polygon points="55,10 25,55 50,55 40,90 75,45 50,45 60,10" fill="${color}"/></g>`;
    case "proibido":
      return `<g ${common}><circle cx="50" cy="50" r="35"/><line x1="25" y1="25" x2="75" y2="75"/></g>`;
    case "advertencia":
      return `<g ${common}><polygon points="50,10 90,85 10,85"/><line x1="50" y1="35" x2="50" y2="65"/><circle cx="50" cy="77" r="3" fill="${color}"/></g>`;
    case "guarda-corpo":
      return `<g ${common}><line x1="10" y1="25" x2="90" y2="25"/><line x1="10" y1="50" x2="90" y2="50"/><line x1="10" y1="88" x2="90" y2="88" stroke-width="${sw + 2}"/><line x1="20" y1="25" x2="20" y2="88"/><line x1="50" y1="25" x2="50" y2="88"/><line x1="80" y1="25" x2="80" y2="88"/></g>`;
    case "linha-de-vida":
      return `<g ${common}><line x1="10" y1="40" x2="90" y2="40" stroke-dasharray="6 6"/><circle cx="15" cy="40" r="6" fill="${color}"/><circle cx="50" cy="40" r="6" fill="${color}"/><circle cx="85" cy="40" r="6" fill="${color}"/><line x1="10" y1="88" x2="90" y2="88"/></g>`;
    case "barreira":
      return `<g ${common}><rect x="15" y="45" width="70" height="15" fill="${color}" opacity="0.4"/><line x1="15" y1="45" x2="85" y2="45"/><line x1="15" y1="60" x2="85" y2="60"/><line x1="20" y1="60" x2="15" y2="85"/><line x1="80" y1="60" x2="85" y2="85"/></g>`;
    default:
      return `<g ${common}><rect x="20" y="20" width="60" height="45" rx="4"/><line x1="50" y1="65" x2="50" y2="90"/><line x1="35" y1="90" x2="65" y2="90"/></g>`;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
}
