import { createFileRoute, Outlet, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Zap,
  Brain,
  Video,
  Briefcase,
  FileText,
  Database,
  ClipboardList,
  Activity,
  Settings,
  Search,
  LogOut,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { APP_CONFIG } from "@/lib/app-config";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Início", icon: LayoutDashboard, to: "/dashboard", section: "PRINCIPAL" },
  { label: "Copilot ao Vivo", icon: Zap, to: "/copiloto", section: "COPILOT" },
  { label: "Teleprompter", icon: Maximize2, to: "/teleprompter", section: "COPILOT" },
  { label: "Minha IA", icon: Brain, to: "/minha-ia", section: "INTELIGÊNCIA" },
  { label: "Memória", icon: Database, to: "/memoria", section: "INTELIGÊNCIA" },
  { label: "Currículo", icon: Briefcase, to: "/curriculo", section: "INTELIGÊNCIA" },
  { label: "Reuniões", icon: Video, to: "/reunioes", section: "PRODUTIVIDADE" },
  { label: "Entrevistas", icon: ClipboardList, to: "/simulador", section: "PRODUTIVIDADE" },
  { label: "Atas e Ações", icon: FileText, to: "/atas", section: "PRODUTIVIDADE" },
  { label: "Templates", icon: Sparkles, to: "/templates", section: "CONTEÚDO" },
  { label: "Relatórios", icon: FileText, to: "/relatorios", section: "CONTEÚDO" },
  { label: "Diagnóstico", icon: Activity, to: "/diagnostico", section: "SISTEMA" },
  { label: "Configurações", icon: Settings, to: "/configuracoes", section: "SISTEMA" },
];

const SECTION_ORDER = [
  "PRINCIPAL",
  "COPILOT",
  "INTELIGÊNCIA",
  "PRODUTIVIDADE",
  "CONTEÚDO",
  "SISTEMA",
];

function AuthenticatedLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const router = useRouter();
  const { user, loading } = useAuth();

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? undefined;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth" });
  };

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(term))
      : NAV_ITEMS;

    return SECTION_ORDER.map((name) => ({
      name,
      items: filtered.filter((item) => item.section === name),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  // Guarda de rota: sem sessão, não há área autenticada.
  if (!user) {
    return (
      <div className="h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            Acesso restrito
          </p>
          <h1 className="text-xl font-bold text-white">Entre para usar o {APP_CONFIG.name}</h1>
          <p className="text-sm text-white/40">
            Suas reuniões, atas e memória profissional ficam vinculadas à sua conta.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-full bg-white px-8 py-2 text-sm font-bold text-black hover:bg-white/90 transition-colors"
          >
            IR PARA O LOGIN
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black overflow-hidden text-white font-sans">
      <aside
        className={cn(
          "bg-[#0A0A0A] border-r border-white/5 flex flex-col transition-all duration-300 relative z-40",
          isCollapsed ? "w-20" : "w-64",
        )}
      >
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="w-8 h-8 bg-white rounded-lg flex-shrink-0 flex items-center justify-center">
            <span className="font-black text-black text-lg">D</span>
          </div>
          {!isCollapsed && (
            <span className="ml-3 font-bold text-sm tracking-[0.2em] uppercase">
              {APP_CONFIG.name}
            </span>
          )}
        </div>

        <div className="flex-1 py-8 px-4 space-y-8 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {sections.map((section) => (
            <div key={section.name} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">
                  {section.name}
                </p>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  title={item.label}
                  activeProps={{ className: "bg-white/5 text-white" }}
                  inactiveProps={{
                    className: "text-white/40 hover:bg-white/[0.02] hover:text-white",
                  }}
                  className="flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-all group relative"
                >
                  <item.icon className={cn("w-4 h-4 flex-shrink-0", !isCollapsed && "mr-3")} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </div>
          ))}

          {sections.length === 0 && !isCollapsed && (
            <p className="px-3 text-[11px] text-white/20">
              Nenhuma área encontrada para “{query}”.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <div
            className={cn(
              "flex items-center p-2 rounded-xl transition-colors hover:bg-white/5",
              isCollapsed ? "justify-center" : "gap-3",
            )}
          >
            <Link
              to="/perfil"
              title="Ver perfil"
              className="flex items-center gap-3 min-w-0 flex-1"
            >
              <Avatar className="h-8 w-8 border border-white/10">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-white text-black text-[10px] font-bold">
                  {displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate text-white">{displayName}</p>
                  <p className="text-[10px] text-white/40 truncate">{user.email}</p>
                </div>
              )}
            </Link>
            {!isCollapsed && (
              <button
                onClick={handleLogout}
                title="Sair da conta"
                className="text-white/20 hover:text-rose-500 transition-colors"
              >
                <LogOut className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute top-24 -right-3 w-6 h-6 bg-[#0A0A0A] border border-white/10 rounded-full flex items-center justify-center text-white/20 hover:text-white shadow-sm z-50 transition-all active:scale-90"
        >
          {isCollapsed ? <ChevronRight className="w-2 h-2" /> : <ChevronLeft className="w-2 h-2" />}
        </button>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-20 bg-black border-b border-white/5 flex items-center justify-between px-8 z-30">
          <div className="flex items-center gap-6 flex-1">
            <div className="relative max-w-sm w-full hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar no menu..."
                className="w-full bg-white/5 border border-white/5 rounded-full pl-10 pr-4 py-2 text-[12px] focus:ring-1 focus:ring-white/20 transition-all outline-none text-white placeholder:text-white/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/perfil"
              className="text-[12px] font-bold text-white/40 hover:text-white transition-colors"
            >
              Meu perfil
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth bg-black">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
