import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { vpsAI } from "@/lib/vps-ai/api";
import { useVpsHealth, useVpsJob, vpsAuthFetch } from "@/lib/vps-ai/hooks";
import { toast } from "sonner";

type Props = {
  analysisId: string;
  imageUrl: string;
  corrections?: string[];
  prompt?: string;
  onComplete?: (afterUrl: string) => void;
  className?: string;
};

export function GenerateAfterButton({
  analysisId,
  imageUrl,
  corrections,
  prompt,
  onComplete,
  className,
}: Props) {
  const { health } = useVpsHealth(60_000);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { job } = useVpsJob(jobId);

  const genOffline = health?.imageGenerator?.online === false;
  const busy =
    starting || Boolean(job && !["completed", "failed", "cancelled"].includes(job.status));

  const start = async () => {
    setStarting(true);
    try {
      const r = await vpsAuthFetch(() =>
        vpsAI.startGenerateAfter({ analysisId, imageUrl, corrections, prompt }),
      );
      setJobId(r.jobId);
      toast.success("Job criado. Aguardando geração...");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar geração");
    } finally {
      setStarting(false);
    }
  };

  if (job?.status === "completed" && job.resultUrl) {
    onComplete?.(job.resultUrl);
  }

  return (
    <div className={className}>
      <Button
        onClick={start}
        disabled={genOffline || busy}
        title={genOffline ? "Gerador da VPS indisponível" : undefined}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="mr-2 h-4 w-4" />
        )}
        {job?.status && job.status !== "queued"
          ? `${job.status}${job.progress ? ` ${job.progress}%` : ""}`
          : "Gerar Depois"}
      </Button>
      {job?.status === "failed" && (
        <p className="text-xs text-destructive mt-1">{job.error ?? "Falhou"}</p>
      )}
    </div>
  );
}
