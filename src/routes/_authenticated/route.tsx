import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { LGPDConsent } from "@/components/lgpd-consent";
import { VpsHealthBanner } from "@/components/vps/VpsHealthBanner";

function AuthenticatedLayout() {
  useIdleLogout();
  return (
    <>
      {/* Não renderiza nada enquanto a IA está online — só avisa quando cai. */}
      <VpsHealthBanner />
      <Outlet />
      <LGPDConsent />
    </>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
