import { useVpsHealth } from "@/lib/vps-ai/hooks";
import { AlertTriangle } from "lucide-react";

export function VpsHealthBanner() {
  const { health, loading } = useVpsHealth(45_000);
  if (loading || !health) return null;
  if (health.online && health.ollama.online) return null;
  return (
    <div className="bg-destructive/10 border-b border-destructive/40 text-destructive px-4 py-2 flex items-center gap-2 text-sm">
      <AlertTriangle className="h-4 w-4" />
      <span>
        Servidor de IA local indisponível. A análise não pôde ser executada neste momento.
      </span>
    </div>
  );
}
