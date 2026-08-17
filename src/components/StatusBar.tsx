import { useEffect, useState } from "react";

import { STRATEGY_VERSION } from "@/lib/engines/strategy";

/**
 * Conteúdo da barra superior NEXUS: identidade, aviso operacional, versão da
 * técnica e relógio local. Client-only para o relógio (SSR renderiza vazio).
 */
export function StatusBar() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="nexus-eyebrow shrink-0 text-primary/90">T4 EDGE COMMAND CENTER</span>
      <span className="nexus-eyebrow hidden min-w-0 truncate md:inline">
        Sem execução automática de ordens
      </span>
      <span className="nexus-eyebrow hidden shrink-0 sm:inline">{STRATEGY_VERSION}</span>
      <span className="nexus-value ml-auto shrink-0 text-xs text-muted-foreground">{now}</span>
    </div>
  );
}
