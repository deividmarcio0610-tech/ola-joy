import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  RefreshCw,
  Send,
  Tag,
} from "lucide-react";

export type HumanReviewAction =
  | "aprovada"
  | "editada"
  | "reclassificada"
  | "nova_analise_solicitada"
  | "erro_reportado"
  | "encaminhada"
  | "rascunho";

export function HumanReviewBar({
  onAction,
  disabled,
}: {
  onAction: (a: HumanReviewAction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={() => onAction("aprovada")}
        disabled={disabled}
        className="gap-1"
      >
        <CheckCircle2 className="h-4 w-4" />
        Aprovar análise
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onAction("editada")}
        disabled={disabled}
        className="gap-1"
      >
        <Edit3 className="h-4 w-4" />
        Editar
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onAction("reclassificada")}
        disabled={disabled}
        className="gap-1"
      >
        <Tag className="h-4 w-4" />
        Alterar classificação
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="gap-1" disabled={disabled}>
            Mais
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAction("nova_analise_solicitada")}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Solicitar nova análise
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("erro_reportado")}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Informar erro da IA
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onAction("rascunho")}>
            Salvar como rascunho
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("encaminhada")}>
            <Send className="mr-2 h-4 w-4" />
            Encaminhar para aprovação
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
