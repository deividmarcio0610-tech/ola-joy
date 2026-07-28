import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { LGPDConsent } from "@/components/lgpd-consent";

function AuthenticatedLayout() {
  useIdleLogout();
  return (
    <>
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
