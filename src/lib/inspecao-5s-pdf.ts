// PDF do relatório 5S — usa jsPDF já disponível no projeto.
import { jsPDF } from "jspdf";
import type { Inspecao5SResult, Senso5SKey } from "@/lib/inspecao-5s";
import { SENSO_LABEL } from "@/lib/inspecao-5s";

const M = 40;

function ensureSpace(doc: jsPDF, y: number, need = 60): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + need > h - M) {
    doc.addPage();
    return M;
  }
  return y;
}

function wrap(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(text || "—", maxW) as string[];
}

export async function gerarPdf5S(params: {
  result: Inspecao5SResult;
  images?: string[]; // data URLs (opcional)
  local?: string;
  auditor?: string;
}): Promise<Blob> {
  const { result, images = [], local, auditor = "ValeTech IA" } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const contentW = w - M * 2;
  let y = M;

  // Capa
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Relatório de Auditoria 5S", M, 45);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Auditor: ${auditor}`, M, 65);
  doc.text(new Date().toLocaleString("pt-BR"), M, 80);
  doc.setTextColor(0, 0, 0);
  y = 110;

  if (local) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Local:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(local, M + 40, y);
    y += 18;
  }

  // Nota final
  y = ensureSpace(doc, y, 80);
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, contentW, 60, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(`${result.nota_final}/100`, M + 20, y + 40);
  doc.setFontSize(12);
  doc.text(result.classificacao, M + 200, y + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Nota Final 5S", M + 200, y + 45);
  y += 80;

  // Resumo
  if (result.resumo_executivo) {
    y = ensureSpace(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Resumo Executivo", M, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = wrap(doc, result.resumo_executivo, contentW);
    for (const l of lines) {
      y = ensureSpace(doc, y, 14);
      doc.text(l, M, y);
      y += 13;
    }
    y += 6;
  }

  // Sensos
  const ordem: Senso5SKey[] = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
  for (const key of ordem) {
    const s = result.sensos[key];
    const meta = SENSO_LABEL[key];
    y = ensureSpace(doc, y, 80);
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 250, 252);
    doc.rect(M, y, contentW, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${meta.jp} — ${meta.nome}`, M + 8, y + 16);
    doc.setFontSize(11);
    const nota = `${s.nota}/100`;
    const nw = doc.getTextWidth(nota);
    doc.text(nota, M + contentW - nw - 8, y + 16);
    y += 30;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(meta.desc, M, y);
    doc.setTextColor(0, 0, 0);
    y += 14;

    if (s.observacoes) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const l of wrap(doc, s.observacoes, contentW)) {
        y = ensureSpace(doc, y, 14);
        doc.text(l, M, y);
        y += 13;
      }
      y += 4;
    }
    if (s.problemas.length) {
      y = ensureSpace(doc, y, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Problemas:", M, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      for (const p of s.problemas) {
        for (const l of wrap(doc, `• ${p}`, contentW - 10)) {
          y = ensureSpace(doc, y, 13);
          doc.text(l, M + 10, y);
          y += 12;
        }
      }
      y += 4;
    }
    if (s.melhorias.length) {
      y = ensureSpace(doc, y, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Melhorias:", M, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      for (const p of s.melhorias) {
        for (const l of wrap(doc, `• ${p}`, contentW - 10)) {
          y = ensureSpace(doc, y, 13);
          doc.text(l, M + 10, y);
          y += 12;
        }
      }
    }
    y += 10;
  }

  // Checklist
  if (result.checklist.length) {
    y = ensureSpace(doc, y, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Checklist de Conformidade 5S", M, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const c of result.checklist) {
      y = ensureSpace(doc, y, 14);
      doc.text(c.conforme ? "[X]" : "[  ]", M, y);
      const lines = wrap(doc, c.item, contentW - 30);
      doc.text(lines[0], M + 24, y);
      for (let i = 1; i < lines.length; i++) {
        y += 12;
        y = ensureSpace(doc, y, 12);
        doc.text(lines[i], M + 24, y);
      }
      y += 14;
    }
  }

  // Fotos
  if (images.length) {
    doc.addPage();
    y = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Fotos analisadas", M, y);
    y += 20;
    for (const img of images.slice(0, 6)) {
      y = ensureSpace(doc, y, 220);
      try {
        doc.addImage(img, "JPEG", M, y, contentW, 200, undefined, "FAST");
      } catch {
        try {
          doc.addImage(img, "PNG", M, y, contentW, 200, undefined, "FAST");
        } catch {
          /* ignore */
        }
      }
      y += 210;
    }
  }

  return doc.output("blob");
}

export function downloadPdf5S(blob: Blob, filename = "auditoria-5s.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
