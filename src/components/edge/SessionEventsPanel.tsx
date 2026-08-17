import { useEffect, useRef } from "react";

import { Card } from "@/components/ui/card";
import type { ChatEntry } from "@/lib/engines/types";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<ChatEntry["tone"], string> = {
  info: "text-foreground/85",
  warn: "text-warn",
  alert: "text-bull",
  bull: "text-bull",
  bear: "text-bear",
};

/**
 * EVENTOS DA SESSÃO — console ao estilo Command Center. Cada linha é uma
 * entrada REAL do log do motor ([HH:MM:SS] do relógio local do evento), com a
 * cor do tom original. Auto-scroll para a última linha.
 */
export function SessionEventsPanel({ entries }: { entries: ChatEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  return (
    <Card className="border-border/70 bg-panel p-3">
      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground">
        EVENTOS DA SESSÃO
      </p>
      <div className="max-h-56 overflow-y-auto rounded bg-black/50 p-2 font-mono text-[11px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">Sessão ainda não iniciada.</p>
        ) : (
          entries.map((entry, index) => (
            <p key={`${entry.t}_${index}`} className={cn(TONE_CLASS[entry.tone])}>
              [{new Date(entry.t).toLocaleTimeString("pt-BR", { hour12: false })}] {entry.text}
            </p>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </Card>
  );
}
