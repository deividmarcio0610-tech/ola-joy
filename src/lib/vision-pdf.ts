import { jsPDF } from "jspdf";

export type PdfDetection = {
  id: number;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  correction: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PdfReport = {
  score: number;
  s: { seiri: number; seiton: number; seiso: number; seiketsu: number; shitsuke: number };
  detections: PdfDetection[];
};

const NEON: [number, number, number] = [163, 230, 53]; // lime-400
const RED: [number, number, number] = [239, 68, 68];
const YELLOW: [number, number, number] = [250, 204, 21];
const BG: [number, number, number] = [10, 10, 10];
const CARD: [number, number, number] = [22, 22, 22];
const BORDER: [number, number, number] = [45, 45, 45];
const MUTED: [number, number, number] = [160, 160, 160];
const FG: [number, number, number] = [240, 240, 240];

function severityColor(sev: PdfDetection["severity"]) {
  if (sev === "critical") return RED;
  if (sev === "warning") return YELLOW;
  return NEON;
}

async function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function exportVisionReportPdf(opts: {
  report: PdfReport;
  image?: string;
  note?: string;
  filename?: string;
}) {
  const { report, image, note } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Page background
  const fillPage = () => {
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageW, pageH, "F");
  };
  fillPage();

  // Header
  const drawHeader = (subtitle: string) => {
    doc.setFillColor(...NEON);
    doc.roundedRect(margin, margin, 22, 22, 4, 4, "F");
    doc.setTextColor(...BG);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("V", margin + 11, margin + 16, { align: "center" });

    doc.setTextColor(...FG);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("VisionGuard AI.", margin + 32, margin + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("VISION AI  ·  ValeTech IA", margin + 32, margin + 24);

    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, pageW - margin, margin + 12, { align: "right" });
    doc.text(new Date().toLocaleString("pt-BR"), pageW - margin, margin + 24, { align: "right" });

    // divider
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 34, pageW - margin, margin + 34);
  };

  drawHeader("Relatório de Inspeção 5S");

  let cursorY = margin + 50;

  // ===== Image with detection boxes =====
  if (image) {
    try {
      const size = await loadImageSize(image);
      const maxW = pageW - margin * 2;
      const maxH = 300;
      const ratio = Math.min(maxW / size.w, maxH / size.h);
      const w = size.w * ratio;
      const h = size.h * ratio;
      const x = (pageW - w) / 2;
      const y = cursorY;

      // border glow
      doc.setDrawColor(...NEON);
      doc.setLineWidth(1.2);
      doc.roundedRect(x - 2, y - 2, w + 4, h + 4, 6, 6, "S");
      doc.addImage(image, "JPEG", x, y, w, h, undefined, "FAST");

      // detection boxes
      for (const d of report.detections) {
        const col = severityColor(d.severity);
        const bx = x + (clamp(d.x) / 100) * w;
        const by = y + (clamp(d.y) / 100) * h;
        const bw = (clamp(d.w, 3, 100 - d.x) / 100) * w;
        const bh = (clamp(d.h, 3, 100 - d.y) / 100) * h;
        doc.setDrawColor(...col);
        doc.setLineWidth(1.4);
        doc.rect(bx, by, bw, bh, "S");

        // tag
        const label = `#${d.id} ${d.confidence}%`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        const tagW = doc.getTextWidth(label) + 6;
        const tagH = 10;
        doc.setFillColor(...col);
        doc.rect(bx, by - tagH, tagW, tagH, "F");
        const tagText: [number, number, number] = d.severity === "warning" ? BG : [255, 255, 255];
        doc.setTextColor(...tagText);
        doc.text(label, bx + 3, by - 2.5);
      }

      cursorY = y + h + 20;
    } catch {
      // ignore image failure
    }
  }

  // ===== Score + ring =====
  const scoreCardH = 90;
  doc.setFillColor(...CARD);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, cursorY, pageW - margin * 2, scoreCardH, 6, 6, "FD");

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("SCORE CONSOLIDADO", margin + 16, cursorY + 20);

  const scoreColor = report.score >= 70 ? NEON : report.score >= 40 ? YELLOW : RED;

  doc.setTextColor(...scoreColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.text(String(report.score), margin + 16, cursorY + 60);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("/100", margin + 16 + doc.getTextWidth(String(report.score)) + 4, cursorY + 60);

  // Ring
  const cx = pageW - margin - 45;
  const cy = cursorY + scoreCardH / 2;
  const r = 28;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(5);
  doc.circle(cx, cy, r, "S");
  // arc via polyline
  doc.setDrawColor(...scoreColor);
  doc.setLineWidth(5);
  const pct = clamp(report.score) / 100;
  const steps = Math.max(2, Math.floor(pct * 64));
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / 64) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }

  cursorY += scoreCardH + 18;

  // ===== 5S bars =====
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("5S — SCORES POR SENSO", margin, cursorY);
  cursorY += 10;

  const bars: Array<[keyof PdfReport["s"], string]> = [
    ["seiri", "SEIRI"],
    ["seiton", "SEITON"],
    ["seiso", "SEISO"],
    ["seiketsu", "SEIKETSU"],
    ["shitsuke", "SHITSUKE"],
  ];
  const gap = 8;
  const colW = (pageW - margin * 2 - gap * 4) / 5;
  const barH = 90;
  bars.forEach(([k, label], i) => {
    const bx = margin + i * (colW + gap);
    const by = cursorY;
    doc.setFillColor(...CARD);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(bx, by, colW, barH, 4, 4, "FD");

    const v = clamp(report.s?.[k] ?? 0);
    const c = v >= 70 ? NEON : v >= 40 ? YELLOW : RED;

    const innerX = bx + 8;
    const innerW = colW - 16;
    const innerH = 45;
    const innerY = by + 10;
    doc.setFillColor(0, 0, 0);
    doc.rect(innerX, innerY, innerW, innerH, "F");
    const fillH = (v / 100) * innerH;
    doc.setFillColor(...c);
    doc.rect(innerX, innerY + innerH - fillH, innerW, fillH, "F");

    doc.setTextColor(...FG);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(String(v), bx + colW / 2, by + 72, { align: "center" });
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(label, bx + colW / 2, by + 84, { align: "center" });
  });

  cursorY += barH + 20;

  // ===== Findings =====
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RISCOS IDENTIFICADOS", margin, cursorY);
  cursorY += 12;

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageH - margin - 24) {
      // footer
      drawFooter(doc, pageW, pageH, margin);
      doc.addPage();
      fillPage();
      drawHeader("Relatório de Inspeção 5S (cont.)");
      cursorY = margin + 50;
    }
  };

  if (report.detections.length === 0) {
    ensureSpace(50);
    doc.setFillColor(20, 40, 20);
    doc.setDrawColor(...NEON);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 36, 5, 5, "FD");
    doc.setTextColor(...NEON);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Nenhum risco identificado. Ambiente conforme.", pageW / 2, cursorY + 22, {
      align: "center",
    });
    cursorY += 44;
  }

  for (const d of report.detections) {
    const col = severityColor(d.severity);
    const label =
      d.severity === "critical" ? "CRITICAL" : d.severity === "warning" ? "WARNING" : "INFO";

    // Measure text heights
    const contentW = pageW - margin * 2 - 20;
    const descLines = doc.splitTextToSize(d.description, contentW);
    const corrLines = doc.splitTextToSize(`CORREÇÃO: ${d.correction}`, contentW - 10);
    const cardH = 42 + descLines.length * 11 + corrLines.length * 11 + 14;

    ensureSpace(cardH + 8);

    doc.setFillColor(...CARD);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, cardH, 5, 5, "FD");

    // badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const badgeText = `#${d.id} ${label}`;
    const badgeW = doc.getTextWidth(badgeText) + 10;
    doc.setFillColor(...col);
    doc.roundedRect(margin + 10, cursorY + 10, badgeW, 14, 2, 2, "F");
    const badgeText2: [number, number, number] = d.severity === "warning" ? BG : [255, 255, 255];
    doc.setTextColor(...badgeText2);
    doc.text(badgeText, margin + 15, cursorY + 20);

    // title
    doc.setTextColor(...FG);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(d.title, margin + 10 + badgeW + 8, cursorY + 21);

    // confidence
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${d.confidence}%`, pageW - margin - 10, cursorY + 21, { align: "right" });

    // description
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(9);
    doc.text(descLines, margin + 10, cursorY + 36);

    // correction block
    const corrY = cursorY + 36 + descLines.length * 11 + 4;
    doc.setDrawColor(...NEON);
    doc.setLineWidth(1.5);
    doc.line(margin + 10, corrY, margin + 10, corrY + corrLines.length * 11 + 6);
    doc.setTextColor(...FG);
    doc.setFontSize(9);
    doc.text(corrLines, margin + 16, corrY + 8);

    cursorY += cardH + 8;
  }

  // Note
  if (note && note.trim()) {
    ensureSpace(60);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("OBSERVAÇÕES DO INSPETOR", margin, cursorY);
    cursorY += 12;
    doc.setTextColor(...FG);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(note, pageW - margin * 2);
    doc.text(noteLines, margin, cursorY);
    cursorY += noteLines.length * 11 + 10;
  }

  // Disclaimer
  ensureSpace(30);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  const disc = doc.splitTextToSize(
    "AVISO: As ações propostas pela IA devem ser avaliadas e validadas pelos responsáveis antes da execução.",
    pageW - margin * 2,
  );
  doc.text(disc, margin, cursorY + 8);

  drawFooter(doc, pageW, pageH, margin);

  const filename =
    opts.filename ??
    `visionguard-vision-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`;
  doc.save(filename);
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, margin: number) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - margin - 14, pageW - margin, pageH - margin - 14);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("VisionGuard AI · Vision AI IA", margin, pageH - margin);
  const page = doc.getNumberOfPages();
  doc.text(`Página ${page}`, pageW - margin, pageH - margin, { align: "right" });
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}
