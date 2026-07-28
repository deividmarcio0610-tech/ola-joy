export type InterventionPriority = "baixa" | "média" | "alta" | "crítica";
export type InterventionStatus =
  | "proposta"
  | "aprovada"
  | "em_execucao"
  | "executada"
  | "reprovada"
  | "nao_aplicavel";

export type ShapeKind =
  | "arrow"
  | "line"
  | "rect"
  | "circle"
  | "polyline"
  | "text"
  | "remove"
  | "relocate"
  | "icon";

export type IconKey =
  | "cone"
  | "extintor"
  | "hidrante"
  | "saida"
  | "epi"
  | "rota"
  | "eletrico"
  | "proibido"
  | "advertencia"
  | "guarda-corpo"
  | "linha-de-vida"
  | "barreira"
  | "placa";

export type CategoryKey =
  | "isolamento"
  | "queda"
  | "incendio"
  | "sinalizacao"
  | "circulacao"
  | "eletrica"
  | "mecanica";

export interface ProjectIntervention {
  id: string;
  number: number;
  category: CategoryKey | string;
  elementType: ShapeKind;
  iconKey?: IconKey;
  standard?: string;
  title: string;
  description: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  position: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    rotation?: number;
    points?: number[];
  };
  style: {
    stroke: string;
    fill?: string;
    opacity?: number;
    strokeWidth?: number;
  };
  text?: string;
  createdAt: string;
}

export interface SafetyPlanState {
  interventions: ProjectIntervention[];
  meta: {
    local?: string;
    responsavel?: string;
    data?: string;
    observacoes?: string;
  };
}

export const PALETTE: Record<string, string> = {
  vermelho: "#ef4444",
  amarelo: "#eab308",
  verde: "#22c55e",
  azul: "#3b82f6",
  laranja: "#f97316",
  roxo: "#a855f7",
};

export const PRIORITY_COLOR: Record<InterventionPriority, string> = {
  baixa: PALETTE.verde,
  média: PALETTE.amarelo,
  alta: PALETTE.laranja,
  crítica: PALETTE.vermelho,
};

export const TECHNICAL_WARNING =
  "Este projeto visual é uma representação conceitual das intervenções propostas. Dimensionamentos, especificações e instalações devem ser validados por profissionais legalmente habilitados.";
