import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

/**
 * A sessão do Supabase vive no browser, então o destino só pode ser decidido no
 * cliente: quem já entrou vai para o copiloto, o resto vai para o login.
 */
function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      navigate({ to: data.session ? "/copiloto" : "/auth", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
    </div>
  );
}
