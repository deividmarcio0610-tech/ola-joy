// Gerador de PDF corporativo via pdfmake — client-side, sem custo.
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { qrDataURL } from "./qrcode";
import { BUDGET_TIER_LABEL, SPECIALTY_LABEL, type TechnicalReport } from "./technical-report.types";

// pdfmake VFS setup (compat com diferentes builds)
const anyPdfMake = pdfMake as unknown as { vfs?: Record<string, string> };
const anyFonts = pdfFonts as unknown as {
  vfs?: Record<string, string>;
  pdfMake?: { vfs?: Record<string, string> };
};
anyPdfMake.vfs = anyFonts.pdfMake?.vfs ?? anyFonts.vfs ?? anyPdfMake.vfs;

const COLOR_PRIMARY = "#0f172a";
const COLOR_ACCENT = "#0ea5e9";
const COLOR_MUTED = "#475569";
const COLOR_DANGER = "#dc2626";
const COLOR_OK = "#059669";

async function toDataURL(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((r) => {
      const reader = new FileReader();
      reader.onloadend = () => r(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

function h1(text: string, id?: string): Content {
  return { text, style: "h1", tocItem: true, ...(id ? { id } : {}), pageBreak: "before" };
}
function h2(text: string): Content {
  return { text, style: "h2", margin: [0, 12, 0, 6] };
}
function p(text: string): Content {
  return { text, style: "body" };
}
function bullet(items: string[]): Content {
  return { ul: items.length ? items : ["—"], style: "body" };
}

function scoreBar(label: string, value: number): Content {
  const width = Math.max(2, Math.min(100, value));
  const color = value >= 75 ? COLOR_OK : value >= 50 ? COLOR_ACCENT : COLOR_DANGER;
  return {
    columns: [
      { text: label, width: 160, style: "body" },
      {
        stack: [
          {
            canvas: [
              { type: "rect", x: 0, y: 0, w: 240, h: 8, color: "#e2e8f0" },
              { type: "rect", x: 0, y: 0, w: (240 * width) / 100, h: 8, color },
            ],
          },
        ],
        width: 250,
      },
      { text: `${Math.round(value)}%`, width: 40, style: "body", alignment: "right" },
    ],
    margin: [0, 2, 0, 2],
  };
}

function table(headers: string[], rows: string[][]): Content {
  return {
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body: [
        headers.map((h) => ({ text: h, style: "th" })),
        ...rows.map((row) => row.map((c) => ({ text: c || "—", style: "td" }))),
      ],
    },
    layout: {
      hLineColor: () => "#cbd5e1",
      vLineColor: () => "#cbd5e1",
      fillColor: (i: number) => (i === 0 ? "#f1f5f9" : i % 2 === 0 ? "#f8fafc" : null),
    },
    margin: [0, 4, 0, 8],
  };
}

export async function generateReportPdf(report: TechnicalReport): Promise<Blob> {
  const qr = report.qr_target_url ? await qrDataURL(report.qr_target_url) : undefined;
  const original = await toDataURL(report.original_image_url);
  const marked = await toDataURL(report.marked_image_url);

  const cover: Content = {
    stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 180, color: COLOR_PRIMARY }] },
      { text: report.title, style: "coverTitle", absolutePosition: { x: 60, y: 90 } },
      {
        text: report.identification.tipo_analise,
        style: "coverSub",
        absolutePosition: { x: 60, y: 130 },
      },
      { text: "\n\n\n" },
      table(
        ["Campo", "Valor"],
        [
          ["Empresa", report.identification.empresa],
          ["Unidade", report.identification.unidade],
          ["Setor / Área", report.identification.setor],
          ["Equipamento", report.identification.equipamento ?? "—"],
          ["Local", report.identification.local ?? "—"],
          ["Solicitante", report.identification.solicitante],
          [
            "Responsável pela validação",
            report.identification.responsavel_validacao ?? "A definir",
          ],
          ["Data / Hora", `${report.identification.data} ${report.identification.hora}`],
          ["Código do relatório", report.code],
          ["Versão", `v${report.version}`],
          ["Status", report.status.toUpperCase()],
        ],
      ),
      qr ? { image: qr, width: 90, alignment: "right", margin: [0, 8, 0, 0] } : { text: "" },
      qr
        ? { text: "Consulta rápida via QR Code", style: "caption", alignment: "right" }
        : { text: "" },
    ],
  };

  const toc: Content = {
    toc: { title: { text: "Sumário", style: "h1" }, textStyle: "toc" },
    pageBreak: "before",
  };

  const summary = report.executive_summary;
  const execSection: Content[] = [
    h1("1. Resumo Executivo", "sec1"),
    p(summary.ambiente_identificado),
    h2("Principais oportunidades"),
    bullet(summary.principais_oportunidades),
    h2("Riscos prioritários"),
    bullet(summary.riscos_prioritarios),
    h2("Melhorias sugeridas"),
    bullet(summary.melhorias_sugeridas),
    h2("Economia potencial"),
    p(summary.economia_potencial),
    h2("Prioridade geral / Confiança da IA"),
    table(
      ["Prioridade", "Confiança IA"],
      [[summary.prioridade_geral.toUpperCase(), `${summary.nivel_confianca_ia}%`]],
    ),
    h2("Limitações da análise"),
    bullet(summary.limitacoes),
  ];

  const idSection: Content[] = [
    h1("2. Identificação", "sec2"),
    table(
      ["Campo", "Valor"],
      [
        ["Empresa", report.identification.empresa],
        ["Unidade", report.identification.unidade],
        ["Setor", report.identification.setor],
        ["Equipamento", report.identification.equipamento ?? "—"],
        ["Local", report.identification.local ?? "—"],
        ["Solicitante", report.identification.solicitante],
        ["Responsável", report.identification.responsavel_validacao ?? "—"],
        ["Data", report.identification.data],
        ["Hora", report.identification.hora],
        ["Tipo de análise", report.identification.tipo_analise],
      ],
    ),
  ];

  const imagesSection: Content[] = [
    h1("3. Registro Visual", "sec3"),
    h2("3.1 Imagem original"),
    original
      ? { image: original, fit: [480, 320], alignment: "center" }
      : p("(imagem original não disponível)"),
    p("Nota: a imagem original nunca é alterada."),
    h2("3.2 Imagem com marcações"),
    marked
      ? { image: marked, fit: [480, 320], alignment: "center" }
      : p("(imagem marcada não disponível)"),
    report.markings.length
      ? table(
          ["#", "Marcação", "Especialidade", "Severidade", "Ref."],
          report.markings.map((m) => [
            String(m.id),
            m.label,
            m.specialty ? SPECIALTY_LABEL[m.specialty] : "—",
            m.severity ?? "—",
            m.ref_section ?? "—",
          ]),
        )
      : p("Sem marcações registradas."),
  ];

  const specialtiesSection: Content[] = [
    h1("4. Análise por Especialidade", "sec4"),
    ...report.specialties.flatMap((s): Content[] => [
      h2(SPECIALTY_LABEL[s.specialty]),
      { text: "Observações", style: "label" },
      p(s.observacoes),
      { text: "Evidências", style: "label" },
      bullet(s.evidencias),
      { text: "Limitações", style: "label" },
      bullet(s.limitacoes),
      { text: "Riscos", style: "label" },
      bullet(s.riscos),
      { text: "Oportunidades", style: "label" },
      bullet(s.oportunidades),
      { text: "Recomendações", style: "label" },
      bullet(s.recomendacoes),
    ]),
  ];

  const innovationSection: Content[] = [
    h1("5. Ideias Inovadoras", "sec5"),
    ...report.innovative_ideas.flatMap((i): Content[] => [
      h2(i.conceito),
      p(i.funcionamento),
      table(
        ["Dificuldade", "Replicação", "Investimento", "Retorno"],
        [[i.dificuldade, i.replicacao, BUDGET_TIER_LABEL[i.investimento], i.retorno_esperado]],
      ),
      { text: "Benefícios", style: "label" },
      bullet(i.beneficios),
      { text: "Riscos", style: "label" },
      bullet(i.riscos),
    ]),
  ];

  const altSection: Content[] = [
    h1("6. Comparação de Alternativas", "sec6"),
    table(
      ["Critério", "Econômica", "Recomendada", "Ideal"],
      report.alternatives.map((a) => [a.criterio, a.economico, a.recomendado, a.ideal]),
    ),
  ];

  const matrixSection: Content[] = [
    h1("7. Matriz de Priorização", "sec7"),
    table(
      [
        "Item",
        "Impacto",
        "Urgência",
        "Esforço",
        "Custo",
        "Benefício",
        "ROI",
        "Segurança",
        "Replicação",
      ],
      report.priority_matrix.map((r) => [
        r.item,
        String(r.impacto),
        String(r.urgencia),
        String(r.esforco),
        String(r.custo),
        String(r.beneficio),
        String(r.roi),
        String(r.seguranca),
        String(r.replicacao),
      ]),
    ),
  ];

  const s = report.scores;
  const scoresSection: Content[] = [
    h1("8. Score da IA", "sec8"),
    scoreBar("Índice de Segurança", s.seguranca),
    scoreBar("Índice Financeiro", s.financeiro),
    scoreBar("Índice de Robustez", s.robustez),
    scoreBar("Índice de Engenharia", s.engenharia),
    scoreBar("Índice de Inovação", s.inovacao),
    scoreBar("Índice de Confiabilidade", s.confiabilidade),
    scoreBar("Dependência Humana (↓ melhor)", s.dependencia_humana),
    scoreBar("Índice de Replicação", s.replicacao),
    scoreBar("Confiança Geral da IA", s.confianca_geral),
  ];

  const planSection: Content[] = [
    h1("9. Plano de Ação (5W2H)", "sec9"),
    table(
      ["O quê", "Por quê", "Onde", "Quando", "Quem", "Como", "Quanto", "Prioridade"],
      report.action_plan.map((a) => [
        a.what,
        a.why,
        a.where,
        a.when,
        a.who,
        a.how,
        BUDGET_TIER_LABEL[a.how_much],
        a.priority,
      ]),
    ),
  ];

  const pdcaSection: Content[] = [
    h1("10. PDCA", "sec10"),
    h2("Planejar (P)"),
    bullet(report.pdca.plan),
    h2("Executar (D)"),
    bullet(report.pdca.do),
    h2("Verificar (C)"),
    bullet(report.pdca.check),
    h2("Agir (A)"),
    bullet(report.pdca.act),
  ];

  const risksSection: Content[] = [
    h1("11. Análise de Riscos", "sec11"),
    table(
      [
        "Risco",
        "Consequência",
        "Prob.",
        "Sev.",
        "Crit.",
        "Controles atuais",
        "Controles sugeridos",
      ],
      report.risks.map((r) => [
        r.risco,
        r.consequencia,
        String(r.probabilidade),
        String(r.severidade),
        String(r.criticidade),
        r.controles_existentes,
        r.controles_sugeridos,
      ]),
    ),
  ];

  const b = report.benefits;
  const benefitsSection: Content[] = [
    h1("12. Benefícios", "sec12"),
    h2("Segurança"),
    bullet(b.seguranca),
    h2("Financeiros"),
    bullet(b.financeiros),
    h2("Operacionais"),
    bullet(b.operacionais),
    h2("Ambientais"),
    bullet(b.ambientais),
    h2("Ergonômicos"),
    bullet(b.ergonomicos),
    h2("Manutenção"),
    bullet(b.manutencao),
  ];

  const scheduleSection: Content[] = [
    h1("13. Cronograma Preliminar", "sec13"),
    table(
      ["Fase", "Início", "Duração", "Responsável"],
      report.schedule.map((r) => [r.fase, r.inicio, r.duracao, r.responsavel ?? "—"]),
    ),
  ];

  const budgetSection: Content[] = [
    h1("14. Orçamento Preliminar", "sec14"),
    p(`Faixa geral: ${BUDGET_TIER_LABEL[report.budget.tier]}`),
    p("Valores em faixas — jamais valores absolutos sem dados de mercado atualizados."),
    report.budget.breakdown.length
      ? table(
          ["Item", "Faixa"],
          report.budget.breakdown.map((r) => [r.item, BUDGET_TIER_LABEL[r.tier]]),
        )
      : p("(sem breakdown adicional nesta versão)"),
  ];

  const attachmentsSection: Content[] = [
    h1("15. Anexos", "sec15"),
    report.attachments.length
      ? table(
          ["Nome", "Tipo", "Nota"],
          report.attachments.map((a) => [a.name, a.kind, a.note ?? "—"]),
        )
      : p("Nenhum anexo registrado."),
  ];

  const signSection: Content[] = [
    h1("16. Assinaturas", "sec16"),
    table(
      ["Papel", "Nome", "Data", "Hash digital"],
      report.signatures.map((sg) => [
        sg.role.toUpperCase(),
        sg.name ?? "________________",
        sg.signed_at ?? "____/____/____",
        sg.digital_hash ?? "—",
      ]),
    ),
  ];

  const historySection: Content[] = [
    h1("17. Histórico de Versões", "sec17"),
    table(
      ["Versão", "Por", "Quando", "Alterações", "Motivo"],
      report.history.map((v) => [
        `v${v.version}`,
        v.changed_by,
        new Date(v.changed_at).toLocaleString("pt-BR"),
        v.changes.join("; "),
        v.reason ?? "—",
      ]),
    ),
    { text: "\n" },
    { text: report.disclaimer, style: "disclaimer" },
  ];

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    info: {
      title: report.title,
      author: report.identification.solicitante,
      subject: report.identification.tipo_analise,
    },
    content: [
      cover,
      toc,
      ...execSection,
      ...idSection,
      ...imagesSection,
      ...specialtiesSection,
      ...innovationSection,
      ...altSection,
      ...matrixSection,
      ...scoresSection,
      ...planSection,
      ...pdcaSection,
      ...risksSection,
      ...benefitsSection,
      ...scheduleSection,
      ...budgetSection,
      ...attachmentsSection,
      ...signSection,
      ...historySection,
    ],
    header: (currentPage) =>
      currentPage === 1
        ? ""
        : {
            margin: [40, 20, 40, 0],
            columns: [
              { text: report.title, style: "headerText" },
              {
                text: `Código ${report.code} · v${report.version}`,
                style: "headerText",
                alignment: "right",
              },
            ],
          },
    footer: (currentPage, pageCount) => ({
      margin: [40, 0, 40, 20],
      columns: [
        {
          text: `${report.code} · v${report.version} · ${report.identification.data}`,
          style: "footerText",
        },
        { text: `Página ${currentPage} de ${pageCount}`, style: "footerText", alignment: "right" },
      ],
    }),
    styles: {
      coverTitle: { color: "#ffffff", fontSize: 22, bold: true },
      coverSub: { color: "#cbd5e1", fontSize: 12 },
      h1: { fontSize: 16, bold: true, color: COLOR_PRIMARY, margin: [0, 12, 0, 8] },
      h2: { fontSize: 12, bold: true, color: COLOR_ACCENT, margin: [0, 8, 0, 4] },
      label: { fontSize: 9, bold: true, color: COLOR_MUTED, margin: [0, 4, 0, 2] },
      body: { fontSize: 10, color: COLOR_PRIMARY },
      th: {
        fontSize: 9,
        bold: true,
        color: COLOR_PRIMARY,
        fillColor: "#f1f5f9",
        margin: [2, 4, 2, 4],
      },
      td: { fontSize: 9, color: COLOR_PRIMARY, margin: [2, 3, 2, 3] },
      toc: { fontSize: 10, color: COLOR_PRIMARY },
      caption: { fontSize: 8, color: COLOR_MUTED, italics: true },
      headerText: { fontSize: 8, color: COLOR_MUTED },
      footerText: { fontSize: 8, color: COLOR_MUTED },
      disclaimer: { fontSize: 8, italics: true, color: COLOR_MUTED },
    },
    defaultStyle: { font: "Roboto" },
  };

  return await new Promise<Blob>((resolve) => {
    (
      pdfMake.createPdf(docDefinition) as unknown as { getBlob: (cb: (b: Blob) => void) => void }
    ).getBlob((blob) => resolve(blob));
  });
}
