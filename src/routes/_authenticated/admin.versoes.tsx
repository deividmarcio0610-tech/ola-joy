import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Users } from "lucide-react";
import {
  createVersion,
  getInstallStats,
  listVersions,
  updateVersion,
} from "@/lib/version.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/versoes")({
  head: () => ({
    meta: [
      { title: "Central de Versões · VALETECH" },
      { name: "description", content: "Publicação e monitoramento de versões do sistema." },
    ],
  }),
  component: AdminVersoes,
});

function AdminVersoes() {
  const qc = useQueryClient();
  const list = useServerFn(listVersions);
  const stats = useServerFn(getInstallStats);
  const create = useServerFn(createVersion);
  const patch = useServerFn(updateVersion);

  const versions = useQuery({ queryKey: ["app-versions"], queryFn: () => list() });
  const installs = useQuery({ queryKey: ["app-installs"], queryFn: () => stats() });

  const createMut = useMutation({
    mutationFn: (data: {
      version: string;
      title: string;
      description: string;
      release_notes: string[];
      is_mandatory: boolean;
      minimum_supported_version: string | null;
      rollout_percent: number;
      is_active: boolean;
    }) => create({ data: data as never }),
    onSuccess: () => {
      toast.success("Versão publicada.");
      qc.invalidateQueries({ queryKey: ["app-versions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: (data: {
      id: string;
      is_active?: boolean;
      is_mandatory?: boolean;
      rollout_percent?: number;
    }) => patch({ data: data as never }),
    onSuccess: () => {
      toast.success("Versão atualizada.");
      qc.invalidateQueries({ queryKey: ["app-versions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [rollout, setRollout] = useState(100);
  const [minSupported, setMinSupported] = useState("");

  const submit = () => {
    if (!version || !title) {
      toast.error("Preencha versão e título.");
      return;
    }
    createMut.mutate({
      version,
      title,
      description,
      release_notes: notes.split("\n").map((s) => s.trim()).filter(Boolean),
      is_mandatory: mandatory,
      minimum_supported_version: minSupported || null,
      rollout_percent: rollout,
      is_active: true,
    });
    setVersion("");
    setTitle("");
    setDescription("");
    setNotes("");
    setMandatory(false);
    setRollout(100);
    setMinSupported("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-glow">Central de Versões</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publique atualizações, controle rollout gradual e monitore adoção.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card/50 p-4">
        <h2 className="font-semibold">Publicar nova versão</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <Label>Versão (semver)</Label>
            <Input
              placeholder="ex: 2.1.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div>
            <Label>Título</Label>
            <Input
              placeholder="Nome da atualização"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição resumida</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notas (uma por linha)</Label>
            <Textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Novo módulo X\nCorrigido bug Y\nMelhoria em Z"
            />
          </div>
          <div>
            <Label>Rollout gradual (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={rollout}
              onChange={(e) => setRollout(Math.min(100, Math.max(0, Number(e.target.value))))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              0 = ninguém recebe · 100 = todos recebem
            </p>
          </div>
          <div>
            <Label>Versão mínima suportada</Label>
            <Input
              placeholder="ex: 2.0.0 (opcional)"
              value={minSupported}
              onChange={(e) => setMinSupported(e.target.value)}
            />
          </div>
          <label className="col-span-full flex items-center gap-3 rounded border border-border p-3">
            <Switch checked={mandatory} onCheckedChange={setMandatory} />
            <div>
              <div className="text-sm font-medium">Atualização obrigatória</div>
              <div className="text-xs text-muted-foreground">
                Bloqueia o uso do sistema até o usuário atualizar.
              </div>
            </div>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending ? "Publicando…" : "Publicar versão"}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">
          <Users className="mr-1 inline h-4 w-4" />
          Adoção por versão
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Versão</th>
                <th className="px-3 py-2">Usuários totais</th>
                <th className="px-3 py-2">Ativos últimas 24h</th>
              </tr>
            </thead>
            <tbody>
              {(installs.data ?? []).map((s) => (
                <tr key={s.version} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">v{s.version}</td>
                  <td className="px-3 py-2">{s.total}</td>
                  <td className="px-3 py-2 text-neon">{s.active24h}</td>
                </tr>
              ))}
              {installs.data?.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                    Nenhum registro ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Versões publicadas</h2>
        <ul className="mt-3 space-y-3">
          {versions.data?.map((v) => (
            <li key={v.id} className="rounded-lg border border-border bg-card/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-semibold">v{v.version}</span>
                <span className="text-sm text-muted-foreground">{v.title}</span>
                {v.is_mandatory && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    obrigatória
                  </span>
                )}
                {!v.is_active && (
                  <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                    retirada
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(v.published_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patchMut.mutate({ id: v.id, is_active: !v.is_active })}
                >
                  {v.is_active ? "Retirar (rollback)" : "Reativar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patchMut.mutate({ id: v.id, is_mandatory: !v.is_mandatory })
                  }
                >
                  {v.is_mandatory ? "Tornar opcional" : "Marcar obrigatória"}
                </Button>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Rollout</Label>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={v.rollout_percent}
                    onBlur={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)));
                      if (val !== v.rollout_percent) {
                        patchMut.mutate({ id: v.id, rollout_percent: val });
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
