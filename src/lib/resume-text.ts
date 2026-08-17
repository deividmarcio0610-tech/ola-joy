/**
 * Extração do texto de um currículo escolhido pelo usuário, feita no browser.
 * PDF passa pelo pdf.js; .txt/.md são lidos direto.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_RESUME_TYPES = ".pdf,.txt,.md";

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Arquivo acima de 10 MB. Envie uma versão menor do currículo.");
  }

  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return (await file.text()).trim();
  }

  if (name.endsWith(".pdf")) {
    return extractPdfText(file);
  }

  throw new Error("Formato não suportado. Envie o currículo em PDF, TXT ou MD.");
}

async function extractPdfText(file: File): Promise<string> {
  // Import dinâmico: o pdf.js só é baixado quando alguém envia um PDF.
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push(text);
      page.cleanup();
    }

    const full = pages.join("\n\n").trim();
    if (!full) {
      throw new Error(
        "Não foi possível ler texto deste PDF (provavelmente digitalizado). Envie um PDF com texto selecionável ou cole o conteúdo em .txt.",
      );
    }
    return full;
  } finally {
    await doc.destroy();
  }
}
