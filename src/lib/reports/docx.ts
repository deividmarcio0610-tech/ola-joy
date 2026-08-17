// Gerador de DOCX equivalente ao PDF.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { BUDGET_TIER_LABEL, SPECIALTY_LABEL, type TechnicalReport } from "./technical-report.types";

async function fetchImage(url?: string): Promise<Uint8Array | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return undefined;
  }
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function tableRow(cells: string[], header = false): TableRow {
  return new TableRow({
    children: cells.map(
      (c) =>
        new TableCell({
          borders,
          shading: header ? { fill: "F1F5F9", type: ShadingType.CLEAR, color: "auto" } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({ children: [new TextRun({ text: c || "—", bold: header, size: 18 })] }),
          ],
        }),
    ),
  });
}

function docTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    rows: [tableRow(headers, true), ...rows.map((r) => tableRow(r))],
  });
}

const H1 = (text: string) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
const H2 = (text: string) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } });
const P = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text: text || "—", size: 20 })],
    spacing: { after: 80 },
  });
const B = (items: string[]) =>
  (items.length ? items : ["—"]).map(
    (t) => new Paragraph({ text: t, numbering: { reference: "bullets", level: 0 } }),
  );

export async function generateReportDocx(report: TechnicalReport): Promise<Blob> {
  const original = await fetchImage(report.original_image_url);
  const marked = await fetchImage(report.marked_image_url);

  const cover: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: report.title, bold: true, size: 44 })],
      spacing: { before: 600, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: report.identification.tipo_analise, size: 24, color: "0EA5E9" }),
      ],
      spacing: { after: 400 },
    }),
  ];

  const idTable = docTable(
    ["Campo", "Valor"],
    [
      ["Empresa", report.identification.empresa],
      ["Unidade", report.identification.unidade],
      ["Setor", report.identification.setor],
      ["Equipamento", report.identification.equipamento ?? "—"],
      ["Local", report.identification.local ?? "—"],
      ["Solicitante", report.identification.solicitante],
      ["Data / Hora", `${report.identification.data} ${report.identification.hora}`],
      ["Código", report.code],
      ["Versão", `v${report.version}`],
      ["Status", report.status.toUpperCase()],
    ],
  );

  const s = report.executive_summary;
  const scores = report.scores;

  const children: (Paragraph | Table)[] = [
    ...cover,
    idTable,
    H1("1. Resumo Executivo"),
    P(s.ambiente_identificado),
    H2("Principais oportunidades"),
    ...B(s.principais_oportunidades),
    H2("Riscos prioritários"),
    ...B(s.riscos_prioritarios),
    H2("Melhorias sugeridas"),
    ...B(s.melhorias_sugeridas),
    H2("Economia potencial"),
    P(s.economia_potencial),
    H2("Prioridade geral / Confiança IA"),
    docTable(
      ["Prioridade", "Confiança IA"],
      [[s.prioridade_geral.toUpperCase(), `${s.nivel_confianca_ia}%`]],
    ),
    H2("Limitações"),
    ...B(s.limitacoes),

    H1("2. Identificação"),
    idTable,

    H1("3. Registro Visual"),
    H2("3.1 Imagem original"),
    original
      ? new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: original,
              transformation: { width: 480, height: 320 },
              altText: { title: "Original", description: "Imagem original", name: "original" },
            }),
          ],
        })
      : P("(imagem original não disponível)"),
    P("A imagem original nunca é alterada."),
    H2("3.2 Imagem com marcações"),
    marked
      ? new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: marked,
              transformation: { width: 480, height: 320 },
              altText: { title: "Marcada", description: "Imagem com marcações", name: "marked" },
            }),
          ],
        })
      : P("(imagem marcada não disponível)"),
    report.markings.length
      ? docTable(
          ["#", "Marcação", "Especialidade", "Severidade", "Ref."],
          report.markings.map((m) => [
            String(m.id),
            m.label,
            m.specialty ? SPECIALTY_LABEL[m.specialty] : "—",
            m.severity ?? "—",
            m.ref_section ?? "—",
          ]),
        )
      : P("Sem marcações registradas."),

    H1("4. Análise por Especialidade"),
    ...report.specialties.flatMap((sp) => [
      H2(SPECIALTY_LABEL[sp.specialty]),
      P(sp.observacoes),
      H2("Evidências"),
      ...B(sp.evidencias),
      H2("Limitações"),
      ...B(sp.limitacoes),
      H2("Riscos"),
      ...B(sp.riscos),
      H2("Oportunidades"),
      ...B(sp.oportunidades),
      H2("Recomendações"),
      ...B(sp.recomendacoes),
    ]),

    H1("5. Ideias Inovadoras"),
    ...report.innovative_ideas.flatMap((i) => [
      H2(i.conceito),
      P(i.funcionamento),
      docTable(
        ["Dificuldade", "Replicação", "Investimento", "Retorno"],
        [[i.dificuldade, i.replicacao, BUDGET_TIER_LABEL[i.investimento], i.retorno_esperado]],
      ),
      H2("Benefícios"),
      ...B(i.beneficios),
      H2("Riscos"),
      ...B(i.riscos),
    ]),

    H1("6. Comparação de Alternativas"),
    docTable(
      ["Critério", "Econômica", "Recomendada", "Ideal"],
      report.alternatives.map((a) => [a.criterio, a.economico, a.recomendado, a.ideal]),
    ),

    H1("7. Matriz de Priorização"),
    docTable(
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

    H1("8. Score da IA"),
    docTable(
      ["Índice", "Valor"],
      [
        ["Segurança", `${Math.round(scores.seguranca)}%`],
        ["Financeiro", `${Math.round(scores.financeiro)}%`],
        ["Robustez", `${Math.round(scores.robustez)}%`],
        ["Engenharia", `${Math.round(scores.engenharia)}%`],
        ["Inovação", `${Math.round(scores.inovacao)}%`],
        ["Confiabilidade", `${Math.round(scores.confiabilidade)}%`],
        ["Dependência Humana (↓ melhor)", `${Math.round(scores.dependencia_humana)}%`],
        ["Replicação", `${Math.round(scores.replicacao)}%`],
        ["Confiança Geral da IA", `${Math.round(scores.confianca_geral)}%`],
      ],
    ),

    H1("9. Plano de Ação (5W2H)"),
    docTable(
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

    H1("10. PDCA"),
    H2("Planejar (P)"),
    ...B(report.pdca.plan),
    H2("Executar (D)"),
    ...B(report.pdca.do),
    H2("Verificar (C)"),
    ...B(report.pdca.check),
    H2("Agir (A)"),
    ...B(report.pdca.act),

    H1("11. Análise de Riscos"),
    docTable(
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

    H1("12. Benefícios"),
    H2("Segurança"),
    ...B(report.benefits.seguranca),
    H2("Financeiros"),
    ...B(report.benefits.financeiros),
    H2("Operacionais"),
    ...B(report.benefits.operacionais),
    H2("Ambientais"),
    ...B(report.benefits.ambientais),
    H2("Ergonômicos"),
    ...B(report.benefits.ergonomicos),
    H2("Manutenção"),
    ...B(report.benefits.manutencao),

    H1("13. Cronograma"),
    docTable(
      ["Fase", "Início", "Duração", "Responsável"],
      report.schedule.map((r) => [r.fase, r.inicio, r.duracao, r.responsavel ?? "—"]),
    ),

    H1("14. Orçamento Preliminar"),
    P(`Faixa geral: ${BUDGET_TIER_LABEL[report.budget.tier]}`),

    H1("15. Anexos"),
    report.attachments.length
      ? docTable(
          ["Nome", "Tipo", "Nota"],
          report.attachments.map((a) => [a.name, a.kind, a.note ?? "—"]),
        )
      : P("Nenhum anexo registrado."),

    H1("16. Assinaturas"),
    docTable(
      ["Papel", "Nome", "Data", "Hash"],
      report.signatures.map((sg) => [
        sg.role.toUpperCase(),
        sg.name ?? "________________",
        sg.signed_at ?? "____/____/____",
        sg.digital_hash ?? "—",
      ]),
    ),

    H1("17. Histórico"),
    docTable(
      ["Versão", "Por", "Quando", "Alterações", "Motivo"],
      report.history.map((v) => [
        `v${v.version}`,
        v.changed_by,
        new Date(v.changed_at).toLocaleString("pt-BR"),
        v.changes.join("; "),
        v.reason ?? "—",
      ]),
    ),

    new Paragraph({
      children: [
        new TextRun({ text: report.disclaimer, italics: true, size: 16, color: "475569" }),
      ],
      spacing: { before: 240 },
    }),
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: "Arial", color: "0F172A" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: "0EA5E9" },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}
