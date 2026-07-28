// Constrói o prompt padrão passado a todos os provedores de edição de imagem.
// A regra é preservar o mesmo ambiente e aplicar apenas as correções selecionadas.

import type { ImageGenerationRequest } from "./types";

export function buildEditPrompt(req: ImageGenerationRequest): string {
  const risks = req.detectedRisks.filter(Boolean);
  const corrections = req.selectedCorrections.filter(Boolean);

  const risksBlock = risks.length
    ? risks.map((r) => `- ${r}`).join("\n")
    : "- Nenhum risco relevante indicado.";

  const correctionsBlock = corrections.length
    ? corrections.map((c) => `- ${c}`).join("\n")
    : "- Aplicar boas práticas gerais de segurança do trabalho.";

  return [
    "Você é um editor fotográfico técnico de segurança do trabalho.",
    "Edite a fotografia ANTES fornecida para representar a mesma cena após a aplicação das correções de segurança selecionadas.",
    "",
    "REGRAS OBRIGATÓRIAS:",
    "1. Mantenha exatamente o MESMO ambiente, ângulo, perspectiva, iluminação geral, cores, objetos fixos, equipamentos e pessoas presentes.",
    "2. NÃO crie uma cena nova; NÃO troque local; NÃO altere paredes, piso, máquinas, objetos ou pessoas que não estejam na lista de correções.",
    "3. Aplique APENAS as correções listadas abaixo, de forma visualmente realista, fotográfica, coerente com o cenário original.",
    "4. Produza uma imagem fotorrealista, sem texto sobreposto, sem marcas d'água, sem selos, sem cartelas de comparação.",
    "5. Não inclua descrições textuais na imagem.",
    "",
    "CENA ORIGINAL:",
    req.sceneDescription || "(sem descrição textual da cena, use apenas a foto)",
    "",
    "RISCOS IDENTIFICADOS NA FOTO ANTES:",
    risksBlock,
    "",
    "CORREÇÕES SELECIONADAS PARA APLICAR NA FOTO DEPOIS:",
    correctionsBlock,
    "",
    "Devolva SOMENTE a imagem editada.",
  ].join("\n");
}
