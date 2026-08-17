import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "valetech.lgpd.consent.v1";

export function LGPDConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(KEY);
    if (!stored) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    window.localStorage.setItem(KEY, new Date().toISOString());
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-border/60 bg-card/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Privacidade e LGPD</p>
          <p className="mt-1 text-muted-foreground">
            Este app captura fotos, vídeos e localização para gerar relatórios operacionais e
            análises por IA. Ao continuar, você concorda com o tratamento desses dados conforme a
            Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={accept}>
              Concordar e continuar
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
