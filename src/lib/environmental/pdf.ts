// Gerador de PDF do Relatório Ambiental N3 — client-side, sem custo.
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import type { EnvAnalysisResult } from "./schema";

const anyPdfMake = pdfMake as unknown as { vfs?: Record<string, string> };
const anyFonts = pdfFonts as unknown as { vfs?: Record<string, string>; pdfMake?: { vfs?: Record<string, string> } };
anyPdfMake.vfs = anyFonts.pdfMake?.vfs ?? anyFonts.vfs ?? anyPdfMake.vfs;

const PRIMARY = "#0f172a";
const ACCENT = "#059669";
const MUTED = "#475569";
const DANGER = "#dc2626";

function kv(label: string, value?: string | null): Content {
  return {
    columns: [
      { text: label, width: 140, color: MUTED, fontSize: 9 },
      { text: value ?? "—", fontSize: 10 },
    ],
    margin: [0, 2, 0, 2],
  };
}

function section(title: string): Content {
  return { text: title, style: "h2", margin: [0, 12, 0, 6] };
}

function actionsTable(items?: EnvAnalysisResult["acoes_imediatas"]): Content {
  if (!items?.length) return { text: "Sem ações registradas.", italics: true, color: MUTED, fontSize: 9 };
  return {
    table: {
      widths: ["*", 70, 70, 60, 60],
      headerRows: 1,
      body: [
        [
          { text: "O quê / Como", bold: true, fillColor: PRIMARY, color: "#fff" },
          { text: "Quem", bold: true, fillColor: PRIMARY, color: "#fff" },
          { text: "Quando", bold: true, fillColor: PRIMARY, color: "#fff" },
          { text: "Prioridade", bold: true, fillColor: PRIMARY, color: "#fff" },
          { text: "Controle", bold: true, fillColor: PRIMARY, color: "#fff" },
        ],
        ...items.map((a) => [
          { text: [{ text: a.o_que || a.descricao, bold: true }, { text: `\n${a.como ?? ""}`, color: MUTED, fontSize: 8 }] },
          { text: a.quem ?? "—", fontSize: 9 },
          { text: a.quando ?? "—", fontSize: 9 },
          { text: a.prioridade ?? "—", fontSize: 9 },
          { text: a.controle ?? "—", fontSize: 9 },
        ]),
      ],
    },
    layout: "lightHorizontalLines",
    fontSize: 9,
  };
}

function scenarioBlock(label: string, s?: EnvAnalysisResult["cenarios"] extends infer T ? (T extends { economica: infer U } ? U : never) : never): Content {
  if (!s) return { text: "" };
  return {
    stack: [
      { text: `${label} — ${s.titulo}`, bold: true, color: ACCENT, margin: [0, 4, 0, 2] },
      { text: s.descricao, fontSize: 9, margin: [0, 0, 0, 4] },
      {
        columns: [
          { text: [{ text: "Custo: ", color: MUTED }, s.custo_estimado] },
          { text: [{ text: "Prazo: ", color: MUTED }, s.prazo] },
          { text: [{ text: "Eficiência: ", color: MUTED }, s.eficiencia] },
        ],
        fontSize: 9,
      },
      {
        columns: [
          { text: [{ text: "Risco residual: ", color: MUTED }, s.risco_residual] },
          { text: [{ text: "Manutenção: ", color: MUTED }, s.manutencao] },
          { text: [{ text: "Vida útil: ", color: MUTED }, s.vida_util] },
        ],
        fontSize: 9,
      },
      { text: [{ text: "Benefício: ", color: MUTED }, s.beneficio], fontSize: 9 },
      { text: [{ text: "Replicação: ", color: MUTED }, s.replicacao], fontSize: 9, margin: [0, 0, 0, 6] },
    ],
    margin: [0, 4, 0, 4],
  };
}

export async function buildEnvReportPdf(
  a: EnvAnalysisResult,
  opts?: { code?: string; imageDataUrl?: string; empresa?: string; area?: string },
): Promise<Blob> {
  const now = new Date();
  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 60, 36, 48],
    header: {
      columns: [
        { text: "ValeTech IA · Auditoria Ambiental N3", color: PRIMARY, bold: true },
        { text: opts?.code ?? "", alignment: "right", color: MUTED },
      ],
      margin: [36, 20, 36, 0],
      fontSize: 9,
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `${opts?.empresa ?? ""} · ${opts?.area ?? ""}`, color: MUTED },
        { text: `Página ${currentPage} de ${pageCount} · ${now.toLocaleString("pt-BR")}`, alignment: "right", color: MUTED },
      ],
      margin: [36, 12, 36, 20],
      fontSize: 8,
    }),
    content: [
      { text: a.titulo, style: "h1" },
      {
        columns: [
          { text: [{ text: "Nível: ", color: MUTED }, a.nivel] },
          { text: [{ text: "Severidade: ", color: MUTED }, a.severidade] },
          { text: [{ text: "Score: ", color: MUTED }, `${a.score}/100`] },
          { text: [{ text: "Confiança: ", color: MUTED }, a.confianca] },
        ],
        fontSize: 10,
        margin: [0, 4, 0, 8],
      },
      opts?.imageDataUrl
        ? { image: opts.imageDataUrl, width: 480, margin: [0, 4, 0, 8] }
        : { text: "" },

      section("Resumo Executivo"),
      { text: a.resumo_executivo },

      section("Identificação"),
      kv("Aspecto principal", a.aspecto_principal),
      kv("Aspectos secundários", a.aspectos_secundarios?.join("; ")),
      kv("Impacto direto", a.impacto_direto),
      kv("Impacto indireto", a.impacto_indireto),
      kv("Meio afetado", a.meio_afetado),
      kv("Fonte", a.fonte),
      kv("Material", a.material),
      kv("Categorias", a.categorias?.join(", ")),

      section("Matriz de Risco"),
      {
        table: {
          widths: ["*", "*", "*", "*", "*", "*"],
          body: [
            ["Severidade", "Probabilidade", "Abrangência", "Persistência", "Sensibilidade", "Controle"].map((t) => ({
              text: t, bold: true, fillColor: PRIMARY, color: "#fff", fontSize: 9,
            })),
            [
              a.matriz?.severidade, a.matriz?.probabilidade, a.matriz?.abrangencia,
              a.matriz?.persistencia, a.matriz?.sensibilidade, a.matriz?.controle,
            ].map((v) => ({ text: String(v ?? "—"), alignment: "center" })),
          ],
        },
        layout: "lightHorizontalLines",
        fontSize: 9,
      },
      a.matriz?.justificativa
        ? { text: a.matriz.justificativa, fontSize: 9, color: MUTED, margin: [0, 4, 0, 0] }
        : { text: "" },

      a.aspectos_impactos?.length
        ? {
            stack: [
              section("Matriz de Aspectos e Impactos"),
              {
                table: {
                  widths: ["*", "*", "*", 40, 40, 40, 40],
                  headerRows: 1,
                  body: [
                    ["Atividade", "Aspecto", "Impacto", "Cond.", "Freq.", "Sev.", "Signif."].map((t) => ({
                      text: t, bold: true, fillColor: PRIMARY, color: "#fff", fontSize: 8,
                    })),
                    ...a.aspectos_impactos.map((r) => [
                      r.atividade, r.aspecto, r.impacto, r.condicao, r.frequencia, r.severidade, r.significancia,
                    ].map((v) => ({ text: String(v ?? "—"), fontSize: 8 }))),
                  ],
                },
                layout: "lightHorizontalLines",
              },
            ],
          }
        : { text: "" },

      a.requisitos_legais?.length
        ? {
            stack: [
              section("Requisitos Legais Aplicáveis"),
              {
                ul: a.requisitos_legais.map((r) => ({
                  text: [{ text: r.norma, bold: true }, r.artigo ? ` · ${r.artigo}` : "", ` — ${r.descricao}`],
                })),
                fontSize: 9,
              },
            ],
          }
        : { text: "" },

      section("Parecer da Auditoria"),
      kv("Observado", a.parecer_auditoria?.observado),
      kv("Critério", a.parecer_auditoria?.criterio),
      kv("Tipo de achado", a.parecer_auditoria?.tipo_achado),
      kv("Consequência", a.parecer_auditoria?.consequencia),
      kv("Recomendação", a.parecer_auditoria?.recomendacao),
      kv("Prioridade", a.parecer_auditoria?.prioridade),

      section("Plano de Ação 5W2H — Ações Imediatas"),
      actionsTable(a.acoes_imediatas),
      section("Ações Corretivas (engenharia)"),
      actionsTable(a.acoes_corretivas),
      section("Ações Preventivas"),
      actionsTable(a.acoes_preventivas),

      a.cenarios
        ? {
            stack: [
              section("Cenários de Solução"),
              scenarioBlock("Econômica", a.cenarios.economica),
              scenarioBlock("Recomendada", a.cenarios.recomendada),
              scenarioBlock("Ideal", a.cenarios.ideal),
            ],
          }
        : { text: "" },

      a.pdca
        ? {
            stack: [
              section("Ciclo PDCA Ambiental"),
              kv("Planejar (P)", a.pdca.planejar),
              kv("Executar (D)", a.pdca.executar),
              kv("Verificar (C)", a.pdca.verificar),
              kv("Agir (A)", a.pdca.agir),
            ],
          }
        : { text: "" },

      a.melhor_solucao
        ? { stack: [section("Melhor Solução"), { text: a.melhor_solucao }] }
        : { text: "" },

      a.necessita_mais_evidencia
        ? {
            stack: [
              section("Limitações e Validação Necessária"),
              {
                text: a.motivo_evidencia_insuficiente ?? "Necessária validação em campo por profissional habilitado.",
                color: DANGER,
                fontSize: 9,
              },
            ],
          }
        : { text: "" },

      {
        text: "\nEste relatório foi gerado automaticamente pelo ValeTech IA. Todas as constatações devem ser validadas por profissional habilitado. O sistema não substitui inspeção presencial nem licenciamento ambiental.",
        color: MUTED,
        fontSize: 8,
        margin: [0, 16, 0, 0],
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, color: PRIMARY, margin: [0, 0, 0, 6] },
      h2: { fontSize: 12, bold: true, color: ACCENT },
    },
    defaultStyle: { fontSize: 10, color: PRIMARY },
  };

  return new Promise((resolve) => {
    (pdfMake.createPdf(doc) as unknown as { getBlob: (cb: (b: Blob) => void) => void })
      .getBlob((blob: Blob) => resolve(blob));
  });
}

export async function downloadEnvReport(
  a: EnvAnalysisResult,
  opts?: { code?: string; imageDataUrl?: string; empresa?: string; area?: string; filename?: string },
) {
  const blob = await buildEnvReportPdf(a, opts);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = opts?.filename ?? `auditoria-ambiental-${(opts?.code ?? Date.now()).toString()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
