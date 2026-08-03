"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { api, AuthUser, isLedeRole } from "@/lib/api";
import {
  getWorkspace,
  setWorkspace,
  WORKSPACE_EVENT,
  type Workspace,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

type Client = {
  id: string;
  name: string;
  isCondo: boolean;
  active: boolean;
};

type SpaceOption = {
  key: string;
  workspace: Workspace;
  name: string;
  plan: string;
  logo: React.ReactNode;
};

function LedeLogo() {
  return (
    <Image
      src="/lede-icon.png"
      alt="LEDE"
      width={32}
      height={32}
      className="size-full object-cover"
      priority
    />
  );
}

function clientInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  // Nome único (ex.: COMFAST) — sempre 2 caracteres, como os demais
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function ClientSpaceLogo({
  name,
  isCondo,
  size = "sm",
}: {
  name: string;
  isCondo: boolean;
  /** sm = lista do dropdown (padrão condomínio); lg = botão do sidebar */
  size?: "sm" | "lg";
}) {
  return (
    <div
      className={cn(
        // size-* sozinho não basta em flex: min-w-auto deixa o conteúdo estourar
        "flex shrink-0 grow-0 items-center justify-center overflow-hidden font-semibold leading-none tracking-wide text-white",
        size === "lg"
          ? "size-8 min-h-8 min-w-8 max-h-8 max-w-8 rounded-lg text-xs"
          : "size-6 min-h-6 min-w-6 max-h-6 max-w-6 rounded-md text-[10px]",
        isCondo ? "bg-emerald-600" : "bg-sky-600",
      )}
      title={isCondo ? "Condomínio" : "Cliente"}
    >
      {clientInitials(name)}
    </div>
  );
}

export function TeamSwitcher({ user }: { user: AuthUser }) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const lede = isLedeRole(user.role);
  const [clients, setClients] = React.useState<Client[]>([]);
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

  React.useEffect(() => {
    if (!lede) return;
    void api<Client[]>("/clients")
      .then((list) => setClients(list.filter((c) => c.active !== false)))
      .catch(() => setClients([]));
  }, [lede]);

  const spaces = React.useMemo<SpaceOption[]>(() => {
    if (!lede) {
      return [
        {
          key: "portal",
          workspace: { type: "lede" },
          name: "Portal",
          plan: user.isCondo ? "Condomínio" : "Cliente",
          logo: (
            <ClientSpaceLogo
              name={user.name || "Portal"}
              isCondo={Boolean(user.isCondo)}
              size="lg"
            />
          ),
        },
      ];
    }

    return [
      {
        key: "lede",
        workspace: { type: "lede" as const },
        name: "LEDE",
        plan: "Cloud Ops",
        logo: <LedeLogo />,
      },
      ...clients.map((c) => ({
        key: c.id,
        workspace: {
          type: "client" as const,
          clientId: c.id,
          name: c.name,
          isCondo: Boolean(c.isCondo),
        },
        name: c.name,
        plan: c.isCondo ? "Portal condomínio" : "Portal cliente",
        // size sm fixo — mesmo padrão visual dos condomínios na lista
        logo: (
          <ClientSpaceLogo name={c.name} isCondo={Boolean(c.isCondo)} />
        ),
      })),
    ];
  }, [lede, clients, user.isCondo]);

  const active =
    spaces.find((s) => {
      if (workspace.type === "lede") return s.workspace.type === "lede";
      return (
        s.workspace.type === "client" &&
        workspace.type === "client" &&
        s.workspace.clientId === workspace.clientId
      );
    }) ?? spaces[0];

  function selectSpace(option: SpaceOption) {
    if (!lede) return;
    setWorkspace(option.workspace);
    setWorkspaceState(option.workspace);
    if (option.workspace.type === "client") {
      router.push("/portal");
    } else {
      router.push("/dashboard");
    }
  }

  if (!active) return null;

  const activeLogo =
    active.workspace.type === "client" ? (
      <ClientSpaceLogo
        name={active.workspace.name}
        isCondo={active.workspace.isCondo}
        size="lg"
      />
    ) : lede ? (
      <div className="size-8 min-h-8 min-w-8 max-h-8 max-w-8 shrink-0 overflow-hidden rounded-lg">
        <LedeLogo />
      </div>
    ) : (
      active.logo
    );

  if (!lede) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {activeLogo}
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{active.name}</span>
              <span className="truncate text-xs">{active.plan}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            {activeLogo}
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{active.name}</span>
              <span className="truncate text-xs">{active.plan}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="max-h-[min(24rem,70vh)] w-72 overflow-y-auto"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Espaço LEDE
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => selectSpace(spaces[0]!)}
                className="gap-2 p-2"
              >
                <div className="size-6 min-h-6 min-w-6 max-h-6 max-w-6 shrink-0 overflow-hidden rounded-md">
                  <LedeLogo />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">LEDE</span>
                  <span className="text-xs text-muted-foreground">
                    Cloud Ops
                  </span>
                </div>
                <LayoutDashboardIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {clients.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Espaço do cliente
                  </DropdownMenuLabel>
                  {spaces.slice(1).map((space) => {
                    const ws = space.workspace;
                    if (ws.type !== "client") return null;
                    return (
                      <DropdownMenuItem
                        key={space.key}
                        onClick={() => selectSpace(space)}
                        className="gap-2 p-2"
                      >
                        <ClientSpaceLogo
                          name={ws.name}
                          isCondo={ws.isCondo}
                          size="sm"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{space.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {space.plan}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
