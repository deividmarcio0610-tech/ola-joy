import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  LayoutDashboard,
  Radio,
  Settings,
  Wallet,
  BookOpen,
  ImagePlus,
  History,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Analisador", url: "/analisador", icon: Activity },
  { title: "Analisar Print", url: "/analisar-print", icon: ImagePlus },
  { title: "Histórico de Análises", url: "/historico-analises", icon: History },
  { title: "Gerenciamento", url: "/gerenciamento", icon: Wallet },
  { title: "Aprendizado", url: "/aprendizado", icon: Brain },
  { title: "Biblioteca", url: "/biblioteca", icon: BookOpen },
  { title: "Backtest", url: "/backtest", icon: BarChart3 },
  { title: "Operação ao Vivo", url: "/operacao-ao-vivo", icon: Radio },
  { title: "Erros / Diagnóstico", url: "/erros", icon: AlertTriangle },
  { title: "Claude Admin", url: "/claude", icon: Bot },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          {/* Logotipo tipográfico NEXUS: monograma com barra cyan. */}
          <div className="nexus-glow-cyan flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
            <span className="font-display text-sm font-bold text-primary">T4</span>
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display text-sm font-bold tracking-[0.18em] text-foreground">
                T4 EDGE
              </p>
              <p className="text-[9px] uppercase tracking-[0.22em] text-primary/80">
                Command Center
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link
                        to={item.url}
                        className={
                          "relative flex items-center gap-2 transition-colors " +
                          (active
                            ? "text-primary before:absolute before:-left-2 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:shadow-[0_0_8px_var(--color-primary)]"
                            : "hover:text-foreground")
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
