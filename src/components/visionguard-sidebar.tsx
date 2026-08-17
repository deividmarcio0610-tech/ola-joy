import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  ClipboardCheck,
  Lightbulb,
  Leaf,
  Eye,
  Siren,
  TrendingUp,
  UserCog,
  BarChart3,
  Settings,
  Bell,
  ScrollText,
  LogOut,
  ScanLine,
  History,
  Video,
  CloudLightning,
  Send,
  MessageSquare,
  Film,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const operational = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Chat IA", url: "/chat", icon: MessageSquare },
  { title: "Câmera 360°", url: "/camera-360", icon: Video },
  { title: "Histórico de Scans", url: "/historico", icon: History },
  { title: "N3 - Não Conformidade", url: "/n3", icon: ShieldAlert },
  { title: "CRM", url: "/crm", icon: Users },
  { title: "Monitoramento Vale", url: "/monitoramento-vale", icon: Send },
  { title: "Inspeção 5S", url: "/inspecao", icon: ClipboardCheck },
  { title: "Kaizen", url: "/kaizen", icon: Lightbulb },
  { title: "Meio Ambiente", url: "/meio-ambiente", icon: Leaf },
  { title: "Auditoria Ambiental N3", url: "/ambiental", icon: Leaf },

  { title: "Emergência", url: "/emergencia", icon: Siren },
  { title: "Intempéries", url: "/intemperies", icon: CloudLightning },
];

const analysis = [
  { title: "Auditoria", url: "/auditoria", icon: ScrollText },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Apresentação", url: "/apresentacao", icon: Film },
];

const management = [
  { title: "Controle de Ganhos", url: "/controle-ganhos", icon: TrendingUp },
  { title: "Usuários", url: "/usuarios", icon: UserCog },
];

const system = [
  { title: "Notificações", url: "/notificacoes", icon: Bell },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function VisionGuardSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  }

  const renderGroup = (label: string, items: typeof operational) => (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className="data-[active=true]:bg-accent data-[active=true]:text-neon"
                >
                  <Link to={item.url} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-neon/10 ring-1 ring-neon/40">
            <span className="font-display text-sm font-bold text-neon text-glow">V</span>
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-neon" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold tracking-widest text-foreground">
                VisionGuard AI
              </span>
              <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Vision AI
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {renderGroup("Operacional", operational)}
        {renderGroup("Análise", analysis)}
        {renderGroup("Gestão", management)}
        {renderGroup("Sistema", system)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <div className="flex min-w-0 flex-col text-left leading-tight">
                  <span className="truncate text-xs">Sair</span>
                  {email && (
                    <span className="truncate text-[10px] text-muted-foreground">{email}</span>
                  )}
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
