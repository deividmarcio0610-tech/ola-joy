// Gerador de XLSX do plano de ação + PDCA + riscos + scores + orçamento.
import ExcelJS from "exceljs";
import { BUDGET_TIER_LABEL, type TechnicalReport } from "./technical-report.types";

function headerRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.columns.forEach((c) => { c.width = 22; });
}

export async function generateReportXlsx(report: TechnicalReport): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kaisen";
  wb.created = new Date();

  // Aba 1 - 5W2H
  const plan = wb.addWorksheet("Plano 5W2H");
  headerRow(plan, ["O quê","Por quê","Onde","Quando","Quem","Como","Quanto","Prioridade","Recursos","Obs"]);
  report.action_plan.forEach((a) =>
    plan.addRow([a.what, a.why, a.where, a.when, a.who, a.how, BUDGET_TIER_LABEL[a.how_much], a.priority, a.resources ?? "", a.obs ?? ""])
  );

  // Aba 2 - PDCA
  const pdca = wb.addWorksheet("PDCA");
  headerRow(pdca, ["Fase","Item"]);
  (["plan","do","check","act"] as const).forEach((k) =>
    report.pdca[k].forEach((item) => pdca.addRow([k.toUpperCase(), item]))
  );

  // Aba 3 - Riscos
  const risks = wb.addWorksheet("Riscos");
  headerRow(risks, ["Risco","Consequência","Prob.","Sev.","Crit.","Controles atuais","Controles sugeridos"]);
  report.risks.forEach((r) => risks.addRow([r.risco, r.consequencia, r.probabilidade, r.severidade, r.criticidade, r.controles_existentes, r.controles_sugeridos]));

  // Aba 4 - Scores
  const scoresSheet = wb.addWorksheet("Scores IA");
  headerRow(scoresSheet, ["Índice","Valor (%)"]);
  const s = report.scores;
  ([
    ["Segurança", s.seguranca],
    ["Financeiro", s.financeiro],
    ["Robustez", s.robustez],
    ["Engenharia", s.engenharia],
    ["Inovação", s.inovacao],
    ["Confiabilidade", s.confiabilidade],
    ["Dependência Humana (↓ melhor)", s.dependencia_humana],
    ["Replicação", s.replicacao],
    ["Confiança Geral", s.confianca_geral],
  ] as const).forEach(([k,v]) => scoresSheet.addRow([k, Math.round(v)]));

  // Aba 5 - Orçamento
  const budget = wb.addWorksheet("Orçamento");
  headerRow(budget, ["Item","Faixa"]);
  budget.addRow(["Geral", BUDGET_TIER_LABEL[report.budget.tier]]);
  report.budget.breakdown.forEach((b) => budget.addRow([b.item, BUDGET_TIER_LABEL[b.tier]]));

  // Aba 6 - Identificação
  const id = wb.addWorksheet("Identificação");
  headerRow(id, ["Campo","Valor"]);
  Object.entries(report.identification).forEach(([k,v]) => id.addRow([k, String(v ?? "")]));
  id.addRow(["código", report.code]);
  id.addRow(["versão", report.version]);
  id.addRow(["status", report.status]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
