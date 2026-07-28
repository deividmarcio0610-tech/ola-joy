import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Download, Sparkles, X } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function VersionUpdateBanner() {
  const [notesOpen, setNotesOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const state = useVersionCheck(() => setNotesOpen(true));

  if (!state.hasUpdate || !state.latest) return null;

  const v = state.latest;

  // Modal bloqueante obrigatório
  if (state.isMandatory) {
    return (
      <Dialog open modal>
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="text-center">
              Atualização obrigatória — v{v.version}
            </DialogTitle>
            <DialogDescription className="text-center">
              Esta atualização é necessária para continuar usando o sistema com segurança.
            </DialogDescription>
          </DialogHeader>
          {v.release_notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {v.release_notes.slice(0, 4).map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-neon">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="mt-4 w-full"
            disabled={applying}
            onClick={() => {
              setApplying(true);
              state.applyUpdate();
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {applying ? "Atualizando…" : "Atualizar agora"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.dismissed) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-neon/40 bg-background/95 p-4 shadow-lg backdrop-blur">
        <button
          onClick={state.dismiss}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neon/10">
            <Sparkles className="h-5 w-5 text-neon" />
          </div>
          <div className="flex-1 pr-4">
            <p className="text-sm font-semibold">Uma nova versão do sistema está disponível.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              v{v.version} — {v.title}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={applying}
                onClick={() => {
                  setApplying(true);
                  state.applyUpdate();
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Atualizar agora
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNotesOpen(true)}>
                Ver novidades
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Novidades — v{v.version}
            </DialogTitle>
            <DialogDescription>{v.title}</DialogDescription>
          </DialogHeader>
          {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
          {v.release_notes.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm">
              {v.release_notes.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-neon">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link to="/novidades" onClick={() => setNotesOpen(false)}>
                Ver histórico completo
              </Link>
            </Button>
            <Button
              onClick={() => {
                setApplying(true);
                state.applyUpdate();
              }}
              disabled={applying}
            >
              <Download className="mr-2 h-4 w-4" />
              Atualizar agora
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
