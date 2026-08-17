import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

const IDLE_MINUTES = 30;
const WARN_BEFORE_SECONDS = 60;

/**
 * Auto-logout após inatividade. Ideal para terminais compartilhados na mina.
 */
export function useIdleLogout() {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      warnRef.current = setTimeout(
        () => {
          toast.warning("Sessão expira em 1 minuto por inatividade", {
            description: "Mova o mouse ou toque na tela para continuar.",
          });
        },
        (IDLE_MINUTES * 60 - WARN_BEFORE_SECONDS) * 1000,
      );
      timerRef.current = setTimeout(
        async () => {
          await logAudit("idle_logout");
          await supabase.auth.signOut();
          toast.error("Sessão encerrada por inatividade");
          navigate({ to: "/auth", replace: true });
        },
        IDLE_MINUTES * 60 * 1000,
      );
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
    };
  }, [navigate]);
}
