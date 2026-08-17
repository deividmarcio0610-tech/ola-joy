// Barra reutilizável de ações do Relatório Técnico Kaisen.
import { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Share2,
  ClipboardCopy,
  QrCode,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { TechnicalReport } from "@/lib/reports/technical-report.types";
import { qrDataURL } from "@/lib/reports/qrcode";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function summaryText(report: TechnicalReport): string {
  const s = report.executive_summary;
  return [
    `📋 ${report.title}`,
    `Código: ${report.code} · v${report.version}`,
    `Empresa: ${report.identification.empresa} · Setor: ${report.identification.setor}`,
    ``,
    `Ambiente: ${s.ambiente_identificado}`,
    `Prioridade: ${s.prioridade_geral.toUpperCase()} · Confiança IA: ${s.nivel_confianca_ia}%`,
    ``,
    `▶ Oportunidades: ${s.principais_oportunidades.slice(0, 3).join("; ")}`,
    `▶ Riscos: ${s.riscos_prioritarios.slice(0, 3).join("; ")}`,
    `▶ Economia potencial: ${s.economia_potencial}`,
  ].join("\n");
}

export function ReportActions({ report }: { report: TechnicalReport }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);

  const filenameBase = `${report.code}_v${report.version}`;

  async function withBusy(label: string, fn: () => Promise<void>) {
    try {
      setBusy(label);
      await fn();
    } catch (e) {
      console.error(e);
      toast.error(`Falha ao gerar ${label}`);
    } finally {
      setBusy(null);
    }
  }

  const doPdf = () =>
    withBusy("PDF", async () => {
      const { generateReportPdf } = await import("@/lib/reports/pdf");
      downloadBlob(await generateReportPdf(report), `${filenameBase}.pdf`);
      toast.success("PDF gerado");
    });

  const doDocx = () =>
    withBusy("DOCX", async () => {
      const { generateReportDocx } = await import("@/lib/reports/docx");
      downloadBlob(await generateReportDocx(report), `${filenameBase}.docx`);
      toast.success("Word gerado");
    });

  const doXlsx = () =>
    withBusy("XLSX", async () => {
      const { generateReportXlsx } = await import("@/lib/reports/xlsx");
      downloadBlob(await generateReportXlsx(report), `${filenameBase}.xlsx`);
      toast.success("Excel gerado");
    });

  const doPrint = () =>
    withBusy("Impressão", async () => {
      const { generateReportPdf } = await import("@/lib/reports/pdf");
      const blob = await generateReportPdf(report);
      const url = URL.createObjectURL(blob);
      const w = window.open(url);
      if (!w) toast.error("Bloqueado pelo navegador. Baixe o PDF.");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });

  const doShare = async () => {
    const text = summaryText(report);
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: report.title,
          text,
        });
        return;
      }
      throw new Error("no share");
    } catch {
      await navigator.clipboard.writeText(text);
      toast.success("Resumo copiado (compartilhamento indisponível)");
    }
  };

  const doCopy = async () => {
    await navigator.clipboard.writeText(summaryText(report));
    toast.success("Resumo copiado");
  };

  const doQr = () =>
    withBusy("QR", async () => {
      const target =
        report.qr_target_url ??
        (typeof window !== "undefined" ? window.location.href : report.code);
      setQrImg(await qrDataURL(target));
      setQrOpen(true);
    });

  const btn = (key: string, icon: React.ReactNode, label: string, onClick: () => void) => (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={onClick}
      disabled={busy !== null}
    >
      {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {btn("PDF", <FileText className="h-3.5 w-3.5" />, "Relatório PDF", doPdf)}
        {btn("DOCX", <FileText className="h-3.5 w-3.5" />, "Word", doDocx)}
        {btn("XLSX", <FileSpreadsheet className="h-3.5 w-3.5" />, "Excel", doXlsx)}
        {btn("Impressão", <Printer className="h-3.5 w-3.5" />, "Imprimir", doPrint)}
        {btn("Compartilhar", <Share2 className="h-3.5 w-3.5" />, "Compartilhar", doShare)}
        {btn("Copiar", <ClipboardCopy className="h-3.5 w-3.5" />, "Copiar resumo", doCopy)}
        {btn("QR", <QrCode className="h-3.5 w-3.5" />, "QR Code", doQr)}
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code do relatório</DialogTitle>
          </DialogHeader>
          {qrImg && <img src={qrImg} alt="QR" className="mx-auto h-64 w-64" />}
          <p className="text-xs text-muted-foreground text-center break-all">
            {report.qr_target_url ?? (typeof window !== "undefined" ? window.location.href : "")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
