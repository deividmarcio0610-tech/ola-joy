// Mapeia perigos/riscos/ações → correções específicas por Norma Regulamentadora.
// Mesma lógica usada no edge function `analisar-com-iris` (handleSimulation)
// para que o usuário veja, antes de gerar a Foto Depois, o que a IA vai corrigir.

export type NrCorrection = {
  codigo: string; // ex.: "NR-6"
  texto: string;
};

export type NrDerivation = {
  perigos: string[];
  riscos: string[];
  acoes: string[];
  correcoes: NrCorrection[];
};

const RULES: Array<{ re: RegExp; codigo: string; texto: string }> = [
  { re: /capacete|epi|helmet|cabe[çc]a/i, codigo: "NR-6", texto: "Todos os trabalhadores usando capacete de segurança e EPI completo (NR-6)." },
  { re: /fia[çc]|el[eé]tric|cabo|energ|nr-?10|nr10/i, codigo: "NR-10", texto: "Fiação totalmente isolada, painéis fechados e aterramento adequado (NR-10)." },
  { re: /m[áa]quina|prote[çc][ãa]o|guard|nr-?12|nr12|parte m[óo]vel/i, codigo: "NR-12", texto: "Máquinas com proteções fixas/enclausuradas sobre partes móveis (NR-12)." },
  { re: /altura|guarda[- ]?corpo|queda|nr-?35|nr35/i, codigo: "NR-35", texto: "Guarda-corpos, rodapés e sistemas antiqueda para trabalho em altura (NR-35)." },
  { re: /piso|escorreg|derrap|limpeza|5s|organiza/i, codigo: "5S / Piso", texto: "Piso limpo, seco, antiderrapante com faixas de circulação e organização 5S." },
  { re: /sinaliza|placa|faixa|delimit/i, codigo: "NBR 7195", texto: "Sinalização de segurança com placas e faixas conforme ABNT NBR 7195." },
  { re: /inc[êe]ndio|extintor|rota de fuga|emerg[êe]ncia/i, codigo: "Emergência", texto: "Extintores e rotas de fuga corretamente posicionados e desobstruídos." },
  { re: /ergon|postura|nr-?17|nr17/i, codigo: "NR-17", texto: "Posto de trabalho ergonômico conforme NR-17." },
];

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim()) {
    return v.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Aceita tanto o formato bruto da IA (`perigos`, `riscos`, `acao_*`)
 * quanto o formato do IrisResult usado na tela (`consequences_list`, `risk`, `*_action`).
 */
export function deriveNrCorrections(input: Record<string, unknown> | null | undefined): NrDerivation {
  const src = input ?? {};
  const perigos = [
    ...toArr(src.perigos),
    ...toArr(src.consequences_list),
    ...toArr(src.consequence),
  ];
  const riscos = [
    ...toArr(src.riscos),
    ...toArr(src.risk),
  ];
  const acoes = [
    ...toArr(src.acao_imediata),
    ...toArr(src.acao_corretiva),
    ...toArr(src.acao_preventiva),
    ...toArr(src.immediate_action),
    ...toArr(src.final_action),
    ...toArr(src.preventive_action),
  ];

  const blob = [...perigos, ...riscos, ...acoes].join(" ");
  const correcoes: NrCorrection[] = [];
  for (const rule of RULES) {
    if (rule.re.test(blob) && !correcoes.some((c) => c.codigo === rule.codigo)) {
      correcoes.push({ codigo: rule.codigo, texto: rule.texto });
    }
  }

  // Dedup preservando ordem
  const dedup = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

  return {
    perigos: dedup(perigos),
    riscos: dedup(riscos),
    acoes: dedup(acoes),
    correcoes,
  };
}
