import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACCEPTED_MIME, MAX_IMAGE_BYTES, imageDimensions } from "@/lib/printAnalysis/imageQuality";
import { cn } from "@/lib/utils";

/**
 * ENTRADA DO PRINT — Ctrl+V, arrastar/soltar ou selecionar arquivo.
 *
 * O listener de `paste` é global (documento), porque o operador vem do Profit
 * com a captura no clipboard e aperta Ctrl+V sem clicar em lugar nenhum. Ele
 * é ignorado enquanto o foco está em um campo de texto, para não sequestrar a
 * colagem do chat.
 */

export interface LoadedPrint {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  fileName: string | null;
}

export function PrintDropzone({
  value,
  onLoad,
  onClear,
  onError,
  disabled,
}: {
  value: LoadedPrint | null;
  onLoad: (print: LoadedPrint) => void;
  onClear: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) {
        onError(`Arquivo inválido (${file.type || "tipo desconhecido"}). Envie PNG, JPG ou WebP.`);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        onError(
          `Imagem de ${(file.size / 1024 / 1024).toFixed(1)} MB acima do limite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
        );
        return;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        const dimensions = await imageDimensions(dataUrl);
        onLoad({
          dataUrl,
          width: dimensions.width,
          height: dimensions.height,
          bytes: file.size,
          fileName: file.name || null,
        });
      } catch (error) {
        onError(error instanceof Error ? error.message : "Não foi possível ler a imagem.");
      }
    },
    [onError, onLoad],
  );

  // Ctrl+V / Cmd+V em qualquer lugar da página.
  useEffect(() => {
    if (disabled) return;
    const handler = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;

      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) {
        // Colou algo que não é imagem: avisa em vez de ficar mudo.
        if (items.length > 0) onError("Não há imagem na área de transferência.");
        return;
      }
      event.preventDefault();
      setPasteHint(true);
      window.setTimeout(() => setPasteHint(false), 1200);
      void accept(imageItem.getAsFile());
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [accept, disabled, onError]);

  return (
    <Card
      className={cn(
        "relative flex min-h-[220px] flex-col items-center justify-center gap-3 border-2 border-dashed p-4 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border/70 bg-panel",
        disabled && "opacity-60",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        void accept(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(event) => {
          void accept(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      {value ? (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-bull">
              <ImagePlus className="h-4 w-4" /> Print carregado com sucesso
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {value.width}×{value.height} · {(value.bytes / 1024).toFixed(0)} KB
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Trocar imagem
            </Button>
            <Button size="sm" variant="outline" onClick={onClear} disabled={disabled}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ClipboardPaste
            className={cn(
              "h-8 w-8 transition-colors",
              pasteHint ? "text-bull" : "text-muted-foreground",
            )}
          />
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              Cole o print com <kbd className="rounded bg-muted px-1 font-mono text-xs">Ctrl+V</kbd>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ou arraste o arquivo aqui · PNG, JPG ou WebP até {MAX_IMAGE_BYTES / 1024 / 1024} MB
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Selecionar arquivo
          </Button>
        </>
      )}
    </Card>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
