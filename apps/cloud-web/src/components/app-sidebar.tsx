"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  UsersIcon,
  ClipboardListIcon,
  LayoutTemplateIcon,
  ImageIcon,
  ClapperboardIcon,
  CalendarClockIcon,
  MonitorIcon,
  BarChart3Icon,
  ShieldCheckIcon,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { AuthUser, can, isLedeRole } from "@/lib/api";
import {
  getPortalContext,
  getWorkspace,
  WORKSPACE_EVENT,
  type Workspace,
} from "@/lib/workspace";

const ROUTE_PERMISSION: Record<string, string> = {
  "/dashboard/clients": "clients.view",
  "/dashboard/plans": "plans.view",
  "/dashboard/device-groups": "device_groups.view",
  "/dashboard/capacity": "capacity.view",
  "/dashboard/screen-types": "screen_types.view",
  "/dashboard/layouts": "layouts.view",
  "/dashboard/media": "media.view",
  "/dashboard/scenes": "scenes.view",
  "/dashboard/schedules": "schedules.view",
  "/dashboard/ticker": "ticker.manage",
  "/dashboard/devices": "devices.view",
  "/dashboard/reports": "reports.view",
  "/dashboard/history": "history.view",
  "/portal/devices": "devices.mine",
  "/portal/media": "media.view",
  "/portal/history": "history.view",
  "/portal/reports": "reports.view",
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const lede = isLedeRole(user.role);
  const [workspace, setWorkspaceState] = React.useState<Workspace>(() =>
    getWorkspace(),
  );

  React.useEffect(() => {
    if (!lede) return;
    const sync = () => setWorkspaceState(getWorkspace());
    sync();
    window.addEventListener(WORKSPACE_EVENT, sync);
    return () => window.removeEventListener(WORKSPACE_EVENT, sync);
  }, [lede]);

  const portalCtx = getPortalContext(user);
  const inClientSpace = lede
    ? workspace.type === "client"
    : true;
  const isCondo = inClientSpace
    ? lede
      ? workspace.type === "client" && workspace.isCondo
      : portalCtx.isCondo
    : false;

  // LEDE no espaço cliente não deve ficar em rotas do dashboard
  React.useEffect(() => {
    if (!lede || workspace.type !== "client") return;
    if (pathname.startsWith("/dashboard")) {
      router.replace("/portal");
    }
  }, [lede, workspace, pathname, router]);

  // LEDE no Cloud Ops não deve ficar em rotas do portal
  React.useEffect(() => {
    if (!lede || workspace.type !== "lede") return;
    if (pathname.startsWith("/portal")) {
      router.replace("/dashboard");
    }
  }, [lede, workspace, pathname, router]);

  const navMain = inClientSpace
    ? [
        {
          title: "Portal",
          url: "/portal",
          icon: <LayoutDashboardIcon />,
          isActive: pathname.startsWith("/portal"),
          items: [
            { title: "Início", url: "/portal" },
            ...(isCondo
              ? [
                  { title: "Minhas telas", url: "/portal/devices" },
                  { title: "Meu aviso", url: "/portal/condo" },
                ]
              : []),
            { title: "Mídias", url: "/portal/media" },
            { title: "Histórico", url: "/portal/history" },
            { title: "Amostragem", url: "/portal/reports" },
          ],
        },
      ]
    : [
        {
          title: "Operação",
          url: "/dashboard",
          icon: <LayoutDashboardIcon />,
          isActive:
            pathname.startsWith("/dashboard/clients") ||
            pathname.startsWith("/dashboard/plans") ||
            pathname.startsWith("/dashboard/device-groups") ||
            pathname.startsWith("/dashboard/capacity") ||
            pathname.startsWith("/dashboard/screen-types") ||
            pathname.startsWith("/dashboard/layouts") ||
            pathname.startsWith("/dashboard/media") ||
            pathname.startsWith("/dashboard/scenes") ||
            pathname.startsWith("/dashboard/schedules") ||
            pathname.startsWith("/dashboard/ticker") ||
            pathname === "/dashboard",
          items: [
            { title: "Visão geral", url: "/dashboard" },
            { title: "Clientes", url: "/dashboard/clients" },
            { title: "Planos", url: "/dashboard/plans" },
            { title: "Grupos de telas", url: "/dashboard/device-groups" },
            { title: "Capacidade", url: "/dashboard/capacity" },
            { title: "Tipos de tela", url: "/dashboard/screen-types" },
            { title: "Layouts", url: "/dashboard/layouts" },
            { title: "Mídias", url: "/dashboard/media" },
            { title: "Cenas", url: "/dashboard/scenes" },
            { title: "Agendamentos", url: "/dashboard/schedules" },
            { title: "Tarja de índices", url: "/dashboard/ticker" },
          ],
        },
        {
          title: "Rede",
          url: "/dashboard/devices",
          icon: <MonitorIcon />,
          isActive:
            pathname.startsWith("/dashboard/devices") ||
            pathname.startsWith("/dashboard/capacity") ||
            pathname.startsWith("/dashboard/ticker") ||
            pathname.startsWith("/dashboard/reports") ||
            pathname.startsWith("/dashboard/history"),
          items: [
            { title: "Telas / Monitoramento", url: "/dashboard/devices" },
            { title: "Tarja de índices", url: "/dashboard/ticker" },
            { title: "Capacidade", url: "/dashboard/capacity" },
            { title: "Amostragem", url: "/dashboard/reports" },
            { title: "Histórico", url: "/dashboard/history" },
          ],
        },
        ...(user.role === "lede_admin"
          ? [
              {
                title: "Administração",
                url: "/dashboard/users",
                icon: <ShieldCheckIcon />,
                isActive:
                  pathname.startsWith("/dashboard/users") ||
                  pathname.startsWith("/dashboard/permissions"),
                items: [
                  { title: "Usuários", url: "/dashboard/users" },
                  { title: "Permissões", url: "/dashboard/permissions" },
                ],
              },
            ]
          : []),
      ];

  const shortcuts = inClientSpace
    ? [
        {
          name: "Mídias",
          url: "/portal/media",
          icon: <ImageIcon />,
        },
        {
          name: "Amostragem",
          url: "/portal/reports",
          icon: <BarChart3Icon />,
        },
      ]
    : [
        {
          name: "Clientes",
          url: "/dashboard/clients",
          icon: <UsersIcon />,
        },
        {
          name: "Mídias",
          url: "/dashboard/media",
          icon: <ImageIcon />,
        },
        {
          name: "Cenas",
          url: "/dashboard/scenes",
          icon: <ClapperboardIcon />,
        },
        {
          name: "Agendas",
          url: "/dashboard/schedules",
          icon: <CalendarClockIcon />,
        },
        {
          name: "Layouts",
          url: "/dashboard/layouts",
          icon: <LayoutTemplateIcon />,
        },
        {
          name: "Planos",
          url: "/dashboard/plans",
          icon: <ClipboardListIcon />,
        },
        {
          name: "Amostragem",
          url: "/dashboard/reports",
          icon: <BarChart3Icon />,
        },
      ];

  const allowed = (url: string) => {
    const permission = ROUTE_PERMISSION[url];
    return !permission || can(user, permission);
  };
  const visibleNav = navMain
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed(item.url)),
    }))
    .filter((group) => group.items.length > 0);
  const visibleShortcuts = shortcuts.filter((s) => allowed(s.url));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher user={user} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={visibleNav} />
        <NavProjects projects={visibleShortcuts} label="Atalhos" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user.name,
            email: user.email,
            avatar: "",
            role: user.role,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
