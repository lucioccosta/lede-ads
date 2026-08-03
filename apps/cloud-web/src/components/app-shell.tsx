"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AuthUser, getStoredUser, isLedeRole, refreshAuthUser } from "@/lib/api"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  getWorkspace,
  WORKSPACE_EVENT,
  type Workspace,
} from "@/lib/workspace"

const titles: Record<string, string> = {
  "/dashboard": "Visão geral",
  "/dashboard/clients": "Clientes",
  "/dashboard/plans": "Planos",
  "/dashboard/screen-types": "Tipos de tela",
  "/dashboard/layouts": "Layouts",
  "/dashboard/media": "Mídias",
  "/dashboard/scenes": "Cenas",
  "/dashboard/schedules": "Agendamentos",
  "/dashboard/devices": "Telas / Monitoramento",
  "/dashboard/reports": "Amostragem",
  "/dashboard/history": "Histórico",
  "/portal": "Início",
  "/portal/devices": "Minhas telas",
  "/portal/condo": "Meu aviso",
  "/portal/media": "Mídias",
  "/portal/history": "Histórico",
  "/portal/reports": "Amostragem",
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [workspace, setWorkspaceState] = useState<Workspace>(() =>
    getWorkspace(),
  )

  useEffect(() => {
    const stored = getStoredUser()
    if (!stored) {
      router.replace("/login")
      return
    }
    setUser(stored)
    void refreshAuthUser().then((fresh) => {
      if (fresh) setUser(fresh)
    })
  }, [router])

  useEffect(() => {
    if (!user || !isLedeRole(user.role)) return
    const sync = () => setWorkspaceState(getWorkspace())
    sync()
    window.addEventListener(WORKSPACE_EVENT, sync)
    return () => window.removeEventListener(WORKSPACE_EVENT, sync)
  }, [user])

  const crumbs = useMemo(() => {
    const lede = user ? isLedeRole(user.role) : true
    const inClientSpace = lede ? workspace.type === "client" : true
    const root = inClientSpace ? "/portal" : "/dashboard"
    const rootLabel = inClientSpace
      ? workspace.type === "client"
        ? workspace.name
        : "Portal"
      : "Cloud Ops"
    const pageTitle = titles[pathname] ?? "LEDE"
    return { root, rootLabel, pageTitle }
  }, [pathname, user, workspace])

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={crumbs.root}>
                    {crumbs.rootLabel}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{crumbs.pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-1 px-4">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex-1 rounded-xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
