import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SimilarRecord = {
  id: string;
  internal_code: string | null;
  title: string | null;
  area: string | null;
  location: string | null;
  status: string | null;
  photo_url: string | null;
  created_at: string;
  score: number; // 0..1
};

export function DuplicateDialog({
  open,
  onOpenChange,
  candidates,
  onOpen,
  onComplement,
  onCreateAnyway,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidates: SimilarRecord[];
  onOpen: (r: SimilarRecord) => void;
  onComplement: (r: SimilarRecord) => void;
  onCreateAnyway: () => void;
}) {
  const top = candidates[0];
  const pct = top ? Math.round(top.score * 100) : 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Registro semelhante encontrado</AlertDialogTitle>
          <AlertDialogDescription>
            {top
              ? `Encontramos um registro ${pct}% semelhante. Deseja abrir, complementar ou criar mesmo assim?`
              : "Nenhum registro semelhante foi encontrado."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-72 pr-3">
          <ul className="space-y-2">
            {candidates.slice(0, 3).map((c) => (
              <li key={c.id} className="flex gap-3 rounded-lg border p-2">
                {c.photo_url ? (
                  <img
                    src={c.photo_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{Math.round(c.score * 100)}%</Badge>
                    {c.internal_code && (
                      <span className="truncate text-xs font-mono text-muted-foreground">
                        {c.internal_code}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm font-medium">
                    {c.title ?? "(sem título)"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[c.area, c.location].filter(Boolean).join(" — ")}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => onOpen(c)}>
                      Abrir
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onComplement(c)}>
                      Complementar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onCreateAnyway}>
            Criar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
