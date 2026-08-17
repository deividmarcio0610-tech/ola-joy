import { createFileRoute } from "@tanstack/react-router";
import { Upload, CheckCircle2, Briefcase, Loader2, FileText } from "lucide-react";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/app-config";
import { getActiveResume, parseResume } from "@/lib/memory.functions";
import { ACCEPTED_RESUME_TYPES, extractResumeText } from "@/lib/resume-text";

export const Route = createFileRoute("/_authenticated/curriculo")({
  component: CurriculoPage,
});

type Stage = "idle" | "lendo" | "analisando";

function CurriculoPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);

  const parseResumeFn = useServerFn(parseResume);
  const getActiveResumeFn = useServerFn(getActiveResume);

  const resumeQuery = useQuery({
    queryKey: ["resume", "active"],
    queryFn: () => getActiveResumeFn(),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setStage("lendo");
      const contentText = await extractResumeText(file);
      setStage("analisando");
      return parseResumeFn({ data: { fileName: file.name, contentText } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Currículo analisado e salvo na sua conta.");
      queryClient.invalidateQueries({ queryKey: ["resume", "active"] });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setStage("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    uploadMutation.mutate(file);
  };

  const isBusy = stage !== "idle";
  const resume = resumeQuery.data;
  const parsed = resume?.parsed;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">IA de Currículos</h1>
        <p className="text-white/40">
          Envie seu currículo e o {APP_CONFIG.name} extrai competências e experiências para usar nas
          reuniões.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card
          className={cn(
            "p-12 border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-center space-y-6 transition-all bg-white/[0.02]",
            isBusy ? "bg-white/5 border-white/20" : "hover:border-white/10 hover:bg-white/5",
          )}
        >
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-white/40">
            <Upload className={cn("w-10 h-10", isBusy && "animate-bounce")} />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Envie seu currículo</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto">
              PDF com texto selecionável, TXT ou MD (até 10 MB). O conteúdo é lido no seu navegador
              e analisado pela IA.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_RESUME_TYPES}
            onChange={handleFileChange}
            className="hidden"
          />

          {isBusy ? (
            <div className="w-full max-w-xs space-y-3 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-white/40" />
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                {stage === "lendo" ? "Lendo o arquivo..." : "Analisando com IA..."}
              </p>
              {fileName && <p className="text-[10px] text-white/20 truncate">{fileName}</p>}
            </div>
          ) : (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white hover:bg-white/90 text-black rounded-full px-8 font-bold"
            >
              Selecionar arquivo
            </Button>
          )}
        </Card>

        {resumeQuery.isLoading ? (
          <div className="flex items-center justify-center p-8 border-2 border-dashed border-white/5 rounded-3xl">
            <Loader2 className="w-5 h-5 animate-spin text-white/20" />
          </div>
        ) : parsed ? (
          <Card className="p-8 border-white/5 bg-[#0A0A0A] animate-in slide-in-from-right-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Currículo analisado</h3>
                  <p className="text-[10px] text-white/20 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {resume?.fileName}
                  </p>
                </div>
              </div>
              {typeof parsed.experienceYears === "number" && parsed.experienceYears > 0 && (
                <Badge className="bg-white/10 text-white border-none">
                  {parsed.experienceYears} anos
                </Badge>
              )}
            </div>

            <div className="space-y-6">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  Nome e cargo
                </span>
                <p className="font-bold text-white">{parsed.name || "Não identificado"}</p>
                <p className="text-sm text-white/40">{parsed.role || "Cargo não identificado"}</p>
              </div>

              {parsed.summary && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    Resumo profissional
                  </span>
                  <p className="text-sm text-white/60 leading-relaxed">{parsed.summary}</p>
                </div>
              )}

              {(parsed.skills?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    Competências extraídas
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {parsed.skills?.map((skill) => (
                      <Badge
                        key={skill}
                        variant="outline"
                        className="text-white border-white/10 bg-white/5"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(parsed.experiences?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    Experiências
                  </span>
                  {parsed.experiences?.map((exp, index) => (
                    <div
                      key={`${exp.empresa}-${index}`}
                      className="rounded-xl border border-white/5 p-3"
                    >
                      <p className="text-sm font-bold text-white">{exp.cargo}</p>
                      <p className="text-xs text-white/40">
                        {exp.empresa} · {exp.periodo}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 space-y-6 border-2 border-dashed border-white/5 rounded-3xl">
            <Briefcase size={64} className="text-white/10" />
            <p className="text-white/20 text-sm">Nenhum currículo analisado ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
