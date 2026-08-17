import jsPDF from "jspdf";
import { TECHNICAL_WARNING, PRIORITY_COLOR } from "./types";
import type { ProjectIntervention, SafetyPlanState } from "./types";

/**
 * Render the composed SVG string over the original image and return a PNG data URL.
 */
export async function renderPlanToPng(
  photoUrl: string,
  svgMarkup: string,
  viewBoxW: number,
  viewBoxH: number,
): Promise<string> {
  const img = await loadImage(photoUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const scaleX = img.naturalWidth / viewBoxW;
  const scaleY = img.naturalHeight / viewBoxH;
  const scale = Math.min(scaleX, scaleY);

  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxW * scale}" height="${viewBoxH * scale}" viewBox="0 0 ${viewBoxW} ${viewBoxH}">${svgMarkup}</svg>`;
  const svgImg = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(wrapped));
  const offsetX = (img.naturalWidth - viewBoxW * scale) / 2;
  const offsetY = (img.naturalHeight - viewBoxH * scale) / 2;
  ctx.drawImage(svgImg, offsetX, offsetY, viewBoxW * scale, viewBoxH * scale);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export interface PdfExportOptions {
  title?: string;
  local?: string;
  responsavel?: string;
  data?: string;
  format?: "a4-portrait" | "a4-landscape" | "a3-landscape";
}

export async function exportPlanToPdf(
  photoUrl: string,
  svgMarkup: string,
  viewBoxW: number,
  viewBoxH: number,
  state: SafetyPlanState,
  opts: PdfExportOptions = {},
): Promise<Blob> {
  const png = await renderPlanToPng(photoUrl, svgMarkup, viewBoxW, viewBoxH);
  const format = opts.format ?? "a4-landscape";
  const orientation = format.endsWith("portrait") ? "p" : "l";
  const paper = format.startsWith("a3") ? "a3" : "a4";
  const pdf = new jsPDF({ orientation, unit: "mm", format: paper });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;

  // Header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("PROJETO EXECUTIVO DE SEGURANÇA", margin, margin + 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const headerRight = [
    opts.title ?? "Projeto",
    opts.local ? `Local: ${opts.local}` : "",
    opts.responsavel ? `Responsável: ${opts.responsavel}` : "",
    `Data: ${opts.data ?? new Date().toLocaleDateString("pt-BR")}`,
  ].filter(Boolean);
  headerRight.forEach((line, i) => {
    pdf.text(line, pageW - margin, margin + 4 + i * 4, { align: "right" });
  });

  pdf.setDrawColor(180);
  pdf.line(margin, margin + 22, pageW - margin, margin + 22);

  // Image
  const imgTop = margin + 26;
  const imgMaxW = pageW - margin * 2;
  const imgMaxH = pageH * 0.55;
  const imgRatio = viewBoxW / viewBoxH;
  let imgW = imgMaxW;
  let imgH = imgW / imgRatio;
  if (imgH > imgMaxH) {
    imgH = imgMaxH;
    imgW = imgH * imgRatio;
  }
  pdf.addImage(png, "PNG", (pageW - imgW) / 2, imgTop, imgW, imgH);

  // Legend / interventions
  let y = imgTop + imgH + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("MEMORIAL DE INTERVENÇÕES", margin, y);
  y += 5;
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");

  state.interventions.forEach((it) => {
    if (y > pageH - 24) {
      pdf.addPage();
      y = margin;
    }
    const num = String(it.number).padStart(2, "0");
    const line1 = `${num} | ${it.standard ?? "Ref. a validar"} | ${it.title} | ${it.priority.toUpperCase()} | ${it.status}`;
    pdf.setFont("helvetica", "bold");
    pdf.text(line1, margin, y);
    y += 4;
    if (it.description) {
      pdf.setFont("helvetica", "normal");
      const wrapped = pdf.splitTextToSize(it.description, pageW - margin * 2);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 3.5 + 2;
    } else {
      y += 2;
    }
  });

  // Warning + approval field
  if (y > pageH - 34) {
    pdf.addPage();
    y = margin;
  }
  pdf.setDrawColor(120);
  pdf.line(margin, pageH - 24, pageW - margin, pageH - 24);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7);
  const warn = pdf.splitTextToSize(TECHNICAL_WARNING, pageW - margin * 2);
  pdf.text(warn, margin, pageH - 20);
  pdf.setFont("helvetica", "normal");
  pdf.text("Aprovação: ____________________________", margin, pageH - 8);
  pdf.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, pageW - margin, pageH - 8, {
    align: "right",
  });

  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export { PRIORITY_COLOR };

export function interventionColor(it: ProjectIntervention): string {
  return it.style.stroke || PRIORITY_COLOR[it.priority] || "#ef4444";
}
