import type { IconKey, CategoryKey } from "./types";

// Ícones vetoriais próprios (paths simples, sem assets de terceiros).
// Cada ícone é um <g> desenhado em uma caixa 100x100 e pode ser escalado.
export function IconSvg({ k, color = "#111" }: { k: IconKey; color?: string }) {
  const stroke = color;
  const fill = "none";
  const sw = 6;
  const common = {
    stroke,
    fill,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  switch (k) {
    case "cone":
      return (
        <g {...common}>
          <polygon points="50,10 80,90 20,90" />
          <line x1="30" y1="60" x2="70" y2="60" />
          <line x1="10" y1="95" x2="90" y2="95" />
        </g>
      );
    case "extintor":
      return (
        <g {...common}>
          <rect x="35" y="30" width="30" height="55" rx="4" />
          <rect x="42" y="15" width="16" height="15" />
          <line x1="65" y1="35" x2="85" y2="20" />
          <circle cx="85" cy="20" r="4" />
        </g>
      );
    case "hidrante":
      return (
        <g {...common}>
          <rect x="35" y="35" width="30" height="55" rx="4" />
          <circle cx="50" cy="55" r="6" />
          <line x1="25" y1="55" x2="35" y2="55" />
          <line x1="65" y1="55" x2="75" y2="55" />
          <line x1="20" y1="90" x2="80" y2="90" />
        </g>
      );
    case "saida":
      return (
        <g {...common}>
          <rect x="15" y="20" width="70" height="60" rx="4" />
          <polyline points="35,50 65,50 55,40" />
          <polyline points="65,50 55,60" />
        </g>
      );
    case "epi":
      return (
        <g {...common}>
          <path d="M20,60 Q50,10 80,60 L80,75 L20,75 Z" />
          <line x1="20" y1="75" x2="80" y2="75" />
        </g>
      );
    case "rota":
      return (
        <g {...common}>
          <polyline points="15,80 40,50 60,60 85,25" />
          <polygon points="85,25 78,28 82,35" fill={color} />
        </g>
      );
    case "eletrico":
      return (
        <g {...common}>
          <polygon points="55,10 25,55 50,55 40,90 75,45 50,45 60,10" fill={color} />
        </g>
      );
    case "proibido":
      return (
        <g {...common}>
          <circle cx="50" cy="50" r="35" />
          <line x1="25" y1="25" x2="75" y2="75" />
        </g>
      );
    case "advertencia":
      return (
        <g {...common}>
          <polygon points="50,10 90,85 10,85" />
          <line x1="50" y1="35" x2="50" y2="65" />
          <circle cx="50" cy="77" r="3" fill={color} />
        </g>
      );
    case "guarda-corpo":
      return (
        <g {...common}>
          <line x1="10" y1="25" x2="90" y2="25" />
          <line x1="10" y1="50" x2="90" y2="50" />
          <line x1="10" y1="88" x2="90" y2="88" strokeWidth={sw + 2} />
          <line x1="20" y1="25" x2="20" y2="88" />
          <line x1="50" y1="25" x2="50" y2="88" />
          <line x1="80" y1="25" x2="80" y2="88" />
        </g>
      );
    case "linha-de-vida":
      return (
        <g {...common}>
          <line x1="10" y1="40" x2="90" y2="40" strokeDasharray="6 6" />
          <circle cx="15" cy="40" r="6" fill={color} />
          <circle cx="50" cy="40" r="6" fill={color} />
          <circle cx="85" cy="40" r="6" fill={color} />
          <line x1="10" y1="88" x2="90" y2="88" />
        </g>
      );
    case "barreira":
      return (
        <g {...common}>
          <rect x="15" y="45" width="70" height="15" fill={color} opacity="0.4" />
          <line x1="15" y1="45" x2="85" y2="45" />
          <line x1="15" y1="60" x2="85" y2="60" />
          <line x1="20" y1="60" x2="15" y2="85" />
          <line x1="80" y1="60" x2="85" y2="85" />
        </g>
      );
    case "placa":
    default:
      return (
        <g {...common}>
          <rect x="20" y="20" width="60" height="45" rx="4" />
          <line x1="50" y1="65" x2="50" y2="90" />
          <line x1="35" y1="90" x2="65" y2="90" />
        </g>
      );
  }
}

export interface LibraryItem {
  key: IconKey;
  label: string;
  category: CategoryKey;
  color: string;
}

export const LIBRARY: LibraryItem[] = [
  { key: "barreira", label: "Barreira / Isolamento", category: "isolamento", color: "#ef4444" },
  { key: "cone", label: "Cone / Balizador", category: "isolamento", color: "#f97316" },
  { key: "proibido", label: "Área proibida", category: "isolamento", color: "#ef4444" },
  { key: "guarda-corpo", label: "Guarda-corpo", category: "queda", color: "#22c55e" },
  { key: "linha-de-vida", label: "Linha de vida", category: "queda", color: "#3b82f6" },
  { key: "extintor", label: "Extintor", category: "incendio", color: "#ef4444" },
  { key: "hidrante", label: "Hidrante", category: "incendio", color: "#ef4444" },
  { key: "saida", label: "Saída de emergência", category: "incendio", color: "#22c55e" },
  { key: "advertencia", label: "Placa de advertência", category: "sinalizacao", color: "#eab308" },
  { key: "epi", label: "EPI obrigatório", category: "sinalizacao", color: "#3b82f6" },
  { key: "placa", label: "Placa (genérica)", category: "sinalizacao", color: "#3b82f6" },
  { key: "rota", label: "Rota / Circulação", category: "circulacao", color: "#22c55e" },
  { key: "eletrico", label: "Risco elétrico", category: "eletrica", color: "#eab308" },
];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  isolamento: "Isolamento",
  queda: "Proteção contra queda",
  incendio: "Combate a incêndio",
  sinalizacao: "Sinalização",
  circulacao: "Circulação",
  eletrica: "Elétrica",
  mecanica: "Mecânica",
};
