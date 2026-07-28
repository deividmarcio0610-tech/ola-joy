import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { StatusHistoryEntry } from "@/lib/analysis-v2";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function StatusTimeline({ entries }: { entries: StatusHistoryEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Ainda não há alterações de status registradas.
        </CardContent>
      </Card>
    );
  }

  const sorted = [...entries].sort((a, b) => (a.at > b.at ? -1 : 1));

  return (
    <Card>
      <CardContent className="p-4">
        <ol className="space-y-3">
          {sorted.map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">
                    {(e.from ?? "—").replace(/_/g, " ")} → {e.to.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
                {e.note && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
        <Separator className="my-3" />
        <div className="text-xs text-muted-foreground">
          {sorted.length} alteração(ões) registrada(s).
        </div>
      </CardContent>
    </Card>
  );
}
