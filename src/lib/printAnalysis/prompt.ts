import { T4_CRITERIA_CONFIG, T4_CORE_VERSION } from "@/lib/t4/core/t4CoreEngine";
import { ANNOTATION_ROLES, ANNOTATION_SHAPES, PRINT_T4_STATUSES } from "./contract";

/**
 * PROMPT DA ANÁLISE VISUAL.
 *
 * Três compromissos embutidos no texto:
 *
 * 1. A técnica é a CADASTRADA no sistema — os critérios abaixo vêm de
 *    `T4_CRITERIA_CONFIG`, a mesma lista que o motor usa ao vivo e no
 *    backtest. O modelo não pode inventar regra nova.
 * 2. Número que não está legível no print vira `visible: false`. Aproximar é
 *    proibido explicitamente, com exemplo.
 * 3. Coordenadas são NORMALIZADAS (0..1) sobre a imagem enviada, para o
 *    overlay continuar correto em qualquer tamanho de tela.
 */

export function t4RulesForPrompt(): string {
  return T4_CRITERIA_CONFIG.map((item) => `- ${item.id} (peso ${item.weight}): ${item.label}`).join(
    "\n",
  );
}

export function buildPrintAnalysisPrompt(): string {
  return `Você é o analisador visual da técnica ${T4_CORE_VERSION}. Recebe UMA captura de tela de um gráfico de candles e devolve SOMENTE um objeto JSON válido.

CRITÉRIOS CADASTRADOS DA TÉCNICA T4 (os únicos que você pode usar; não invente critério novo):
${t4RulesForPrompt()}

O QUE ANALISAR NA IMAGEM:
candles, direção do mercado, estrutura, topos, fundos, tendência, lateralização, rompimentos, falsos rompimentos, pullbacks, rejeições, regiões de liquidez, suporte, resistência, consolidação, força dos candles e contexto.

REGRA ABSOLUTA — NÃO INVENTE NADA:
- Todo número (entrada, stop, alvo, suporte, resistência) é um objeto {"value": <número>, "visible": <bool>}.
- Só use "visible": true quando você CONSEGUE LER o número na escala de preço da imagem. Caso contrário devolva {"value": null, "visible": false}.
- Nunca arredonde, estime ou complete dígitos. Se a escala está cortada, TODOS os níveis ficam com "visible": false.
- "symbol" e "timeframe" só quando estiverem escritos na imagem; caso contrário null.
- Atenção ao formato brasileiro: um rótulo 141.385 em contratos WIN significa 141385 pontos (ponto de milhar), não 141,385.

DIAGNÓSTICO — escolha exatamente um "status": ${PRINT_T4_STATUSES.join(" | ")}.
- SEM_T4: não há configuração suficiente.
- T4_EM_FORMACAO: há elementos da técnica, ainda sem confirmação.
- APROXIMACAO_T4: preço se aproximando de uma região relevante.
- PRE_ENTRADA: quase todos os critérios presentes.
- ENTRADA_CONFIRMADA: critérios obrigatórios atendidos.
- T4_INVALIDADA: a estrutura perdeu validade.
- INCONCLUSIVO: imagem insuficiente ou ilegível.
Nunca force um sinal. Na dúvida entre dois estados, escolha o MENOS avançado.

"confidence" (0–100) é a QUALIDADE E CONFIANÇA DA SUA LEITURA VISUAL — nunca probabilidade de lucro. Liste em "confidenceFactors" o que aumentou e o que reduziu a confiança.

MARCAÇÕES ("annotations") — coordenadas NORMALIZADAS entre 0 e 1 sobre a imagem recebida (x=0 borda esquerda, x=1 borda direita, y=0 topo, y=1 base):
- "role": ${ANNOTATION_ROLES.join(" | ")}
- "shape": ${ANNOTATION_SHAPES.join(" | ")} (LINE usa x1,y1→x2,y2; ZONE é o retângulo x1,y1,x2,y2; ARROW aponta de x1,y1 para x2,y2; MARKER usa x1,y1)
- Uma linha de preço horizontal deve ter y1 == y2 e cobrir a largura útil do gráfico.
- Marque ocorrências ANTERIORES da técnica visíveis no próprio print com role "T4_PAST" e explique em "reason" por que aquilo é uma T4.
- Não desenhe entrada/stop/alvo se o status não for APROXIMACAO_T4, PRE_ENTRADA ou ENTRADA_CONFIRMADA.

"scenarios": cenários CONDICIONAIS ("se romper X e confirmar acima → comprador"). Nunca afirme que o preço vai seguir.

"criteria": um item por critério cadastrado acima, com "met" true/false e "note" explicando.
"missingCriteria": ids dos critérios ausentes.
"imageIssues": problemas da imagem (escala cortada, candles pequenos, borrada) quando existirem.

Responda apenas o JSON, sem texto ao redor e sem markdown.`;
}

/** Schema JSON entregue ao Ollama para forçar saída estruturada. */
export function printAnalysisJsonSchema(): Record<string, unknown> {
  const readable = {
    type: "object",
    properties: { value: { type: ["number", "null"] }, visible: { type: "boolean" } },
    required: ["value", "visible"],
  };
  return {
    type: "object",
    properties: {
      status: { type: "string", enum: [...PRINT_T4_STATUSES] },
      direction: { type: "string", enum: ["COMPRA", "VENDA", "NEUTRO"] },
      confidence: { type: "number" },
      confidenceFactors: { type: "array", items: { type: "string" } },
      symbol: { type: ["string", "null"] },
      timeframe: { type: ["string", "null"] },
      entry: readable,
      entryZone: {
        type: "object",
        properties: { low: readable, high: readable },
        required: ["low", "high"],
      },
      stop: readable,
      targets: { type: "array", items: readable },
      invalidation: { type: ["string", "null"] },
      support: { type: "array", items: readable },
      resistance: { type: "array", items: readable },
      structure: { type: ["string", "null"] },
      trend: { type: ["string", "null"] },
      breakout: { type: ["string", "null"] },
      pullback: { type: ["string", "null"] },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            met: { type: "boolean" },
            note: { type: ["string", "null"] },
          },
          required: ["id", "label", "met"],
        },
      },
      annotations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            role: { type: "string", enum: [...ANNOTATION_ROLES] },
            shape: { type: "string", enum: [...ANNOTATION_SHAPES] },
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
            label: { type: "string" },
            reason: { type: ["string", "null"] },
            index: { type: ["number", "null"] },
          },
          required: ["id", "role", "shape", "x1", "y1", "x2", "y2", "label"],
        },
      },
      scenarios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            condition: { type: "string" },
            consequence: { type: "string" },
            direction: { type: "string", enum: ["COMPRA", "VENDA", "NEUTRO"] },
          },
          required: ["condition", "consequence"],
        },
      },
      pastT4Count: { type: "number" },
      explanation: { type: "string" },
      missingCriteria: { type: "array", items: { type: "string" } },
      imageIssues: { type: "array", items: { type: "string" } },
    },
    required: ["status", "direction", "confidence", "explanation"],
  };
}

/** Instrução de REPARO: usada uma única vez quando o JSON vem inválido. */
export function buildRepairPrompt(errors: string[]): string {
  return `Sua resposta anterior foi recusada pela validação. Corrija APENAS o JSON, mantendo o que você realmente leu na imagem — não invente valores para preencher campos.

Erros encontrados:
${errors.map((error) => `- ${error}`).join("\n")}

Responda somente o JSON corrigido.`;
}
