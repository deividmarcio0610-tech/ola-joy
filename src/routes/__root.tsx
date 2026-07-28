import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ValetechSidebar } from "@/components/valetech-sidebar";
import { FloatingChat } from "@/components/floating-chat";
import { VersionUpdateBanner } from "@/components/version-update-banner";
import { APP_VERSION } from "@/lib/version";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-neon text-glow">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold">Rota não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O módulo solicitado não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">Falha ao carregar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo inesperado aconteceu. Tente novamente ou volte ao dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir ao dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VALETECH Vision AI · IA — Inteligência operacional" },
      {
        name: "description",
        content:
          "Plataforma corporativa de segurança, supervisão, meio ambiente e ganhos com IA para análise visual em tempo real.",
      },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "VALETECH Vision AI · IA — Inteligência operacional" },
      {
        property: "og:description",
        content:
          "Plataforma corporativa de segurança, supervisão, meio ambiente e ganhos com IA para análise visual em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "VALETECH Vision AI · IA — Inteligência operacional" },
      { name: "twitter:description", content: "Plataforma corporativa de segurança, supervisão, meio ambiente e ganhos com IA para análise visual em tempo real." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/34e9409e-c95c-4c60-99e8-e931ca34b4f1/id-preview-b56f7f2a--a4635b3d-ad07-4431-b336-616f335181a3.lovable.app-1784063385156.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/34e9409e-c95c-4c60-99e8-e931ca34b4f1/id-preview-b56f7f2a--a4635b3d-ad07-4431-b336-616f335181a3.lovable.app-1784063385156.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = pathname === "/" || pathname === "/auth";

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    // Registra o Service Worker (bloqueado em preview/dev/iframe).
    import("@/lib/push/sw-registration").then((m) => m.ensureServiceWorker()).catch(() => {});
    // Recebe pedidos de navegação vindos do SW (clique em notificação).
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "navigate" && typeof e.data.url === "string") {
        router.navigate({ to: e.data.url });
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onMsg);
    return () => {
      sub.subscription.unsubscribe();
      navigator.serviceWorker?.removeEventListener?.("message", onMsg);
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {isPublic ? (
        <div className="min-h-screen bg-background text-foreground">
          <Outlet />
        </div>
      ) : (
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background text-foreground">
            <ValetechSidebar />
            <div className="flex min-h-screen flex-1 flex-col">
              {pathname !== "/dashboard" && (
                <div className="sticky top-0 z-20 flex h-12 items-center border-b border-border bg-background/80 px-3 backdrop-blur">
                  <SidebarTrigger />
                </div>
              )}
              <main className="flex-1 p-4 md:p-8">
                <Outlet />
              </main>
              <footer className="border-t border-border/50 px-4 py-2 text-center text-[10px] text-muted-foreground">
                VALETECH Vision AI · v{APP_VERSION}
                {" · "}
                <Link to="/novidades" className="hover:text-neon">
                  novidades
                </Link>
              </footer>
            </div>
          </div>
          <FloatingChat />
          <VersionUpdateBanner />
        </SidebarProvider>
      )}
      <Toaster theme="dark" position="top-right" richColors />
    </QueryClientProvider>
  );
}

