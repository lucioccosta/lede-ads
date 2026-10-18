"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  MiniBarChart,
  OccupancyBars,
  SegmentedBar,
  Sparkline,
  deltaLabel,
} from "@/components/mini-charts"
import { cn } from "@/lib/utils"

type Client = { id: string; name: string; isCondo?: boolean }
type Device = {
  id: string
  name: string
  computedStatus: string
  updateAvailable?: boolean
  appVersion?: string | null
  lastHeartbeatAt?: string | null
  client?: { name: string } | null
}
type Media = {
  id: string
  name: string
  status: string
  client?: { name: string } | null
}
type Schedule = { id: string; name: string; active: boolean; channel?: string }
type Scene = { id: string; name: string; active: boolean }
type Plan = {
  id: string
  name: string
  active: boolean
  client?: { name: string } | null
}
type GroupCapacity = {
  groupId: string
  groupName: string
  clientName: string
  occupancyPct: number
  full: boolean
  vacantPerDay: number
}
type Report = {
  totalPlays: number
  byDay?: Record<string, number>
  recent: Array<{
    id: string
    startedAt: string
    media: { name: string }
    device: { name: string }
  }>
}
type ChangeLog = {
  id: string
  action: string
  summary: string
  createdAt: string
  user: { name: string } | null
  client: { name: string } | null
}

type DayPoint = { label: string; value: number; key: string }

type Stats = {
  clientsTotal: number
  clientsCondo: number
  clientsAds: number
  devicesOnline: number
  devicesOffline: number
  devicesPairing: number
  devicesTotal: number
  updatesAvailable: number
  pendingMedia: number
  approvedMedia: number
  schedulesActive: number
  schedulesTotal: number
  scenesActive: number
  scenesTotal: number
  plansActive: number
  plansTotal: number
  capacityFull: number
  capacityGroups: number
  capacityAvgOccupancy: number
  capacityTop: Array<{ label: string; pct: number; full?: boolean }>
  plays7d: number
  playsByDay: DayPoint[]
  playsToday: number
  playsYesterday: number
  onlineHistory: number[]
  offlineDevices: Device[]
  pendingMediaList: Media[]
  recentPlays: Report["recent"]
  recentHistory: ChangeLog[]
}

const ONLINE_HISTORY_KEY = "lede.dashboard.onlineHistory"
const ONLINE_HISTORY_MAX = 24

const actionLabel: Record<string, string> = {
  condo_media_changed: "Aviso na tela",
  media_uploaded: "Upload",
  media_reviewed: "Revisão",
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function relativeHeartbeat(iso: string | null | undefined) {
  if (!iso) return "sem heartbeat"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return "—"
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

function lastNDays(n: number): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function shortDayLabel(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`)
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(d)
    .replace(".", "")
}

function pushOnlineHistory(online: number): number[] {
  if (typeof window === "undefined") return [online]
  let prev: number[] = []
  try {
    const raw = sessionStorage.getItem(ONLINE_HISTORY_KEY)
    if (raw) prev = JSON.parse(raw) as number[]
  } catch {
    prev = []
  }
  const next = [...prev, online].slice(-ONLINE_HISTORY_MAX)
  try {
    sessionStorage.setItem(ONLINE_HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch {
    return fallback
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function load() {
      const [
        clients,
        devices,
        media,
        schedules,
        scenes,
        plans,
        capacity,
        report,
        history,
      ] = await Promise.all([
        settled(api<Client[]>("/clients"), []),
        settled(api<Device[]>("/devices/monitoring"), []),
        settled(api<Media[]>("/media"), []),
        settled(api<Schedule[]>("/schedules"), []),
        settled(api<Scene[]>("/scenes"), []),
        settled(api<Plan[]>("/plans"), []),
        settled(api<GroupCapacity[]>("/capacity"), []),
        settled(api<Report>("/reports/sampling"), {
          totalPlays: 0,
          byDay: {},
          recent: [],
        }),
        settled(api<ChangeLog[]>("/history"), []),
      ])

      const online = devices.filter((d) => d.computedStatus === "online")
      const offline = devices.filter((d) => d.computedStatus === "offline")
      const pairing = devices.filter((d) => d.computedStatus === "pairing")
      const pending = media.filter((m) => m.status === "pending_approval")
      const occupancy =
        capacity.length > 0
          ? Math.round(
              capacity.reduce((acc, g) => acc + g.occupancyPct, 0) /
                capacity.length,
            )
          : 0

      const dayKeys = lastNDays(7)
      const byDay = report.byDay ?? {}
      const playsByDay: DayPoint[] = dayKeys.map((key) => ({
        key,
        label: shortDayLabel(key),
        value: byDay[key] ?? 0,
      }))
      const playsToday = playsByDay[playsByDay.length - 1]?.value ?? 0
      const playsYesterday = playsByDay[playsByDay.length - 2]?.value ?? 0

      const capacityTop = [...capacity]
        .sort((a, b) => b.occupancyPct - a.occupancyPct)
        .slice(0, 4)
        .map((g) => ({
          label: g.groupName,
          pct: g.occupancyPct,
          full: g.full,
        }))

      setStats({
        clientsTotal: clients.length,
        clientsCondo: clients.filter((c) => c.isCondo).length,
        clientsAds: clients.filter((c) => !c.isCondo).length,
        devicesOnline: online.length,
        devicesOffline: offline.length,
        devicesPairing: pairing.length,
        devicesTotal: devices.length,
        updatesAvailable: devices.filter((d) => d.updateAvailable).length,
        pendingMedia: pending.length,
        approvedMedia: media.filter((m) => m.status === "approved").length,
        schedulesActive: schedules.filter((s) => s.active).length,
        schedulesTotal: schedules.length,
        scenesActive: scenes.filter((s) => s.active).length,
        scenesTotal: scenes.length,
        plansActive: plans.filter((p) => p.active).length,
        plansTotal: plans.length,
        capacityFull: capacity.filter((g) => g.full).length,
        capacityGroups: capacity.length,
        capacityAvgOccupancy: occupancy,
        capacityTop,
        plays7d: report.totalPlays,
        playsByDay,
        playsToday,
        playsYesterday,
        onlineHistory: pushOnlineHistory(online.length),
        offlineDevices: offline.slice(0, 8),
        pendingMediaList: pending.slice(0, 8),
        recentPlays: (report.recent ?? []).slice(0, 8),
        recentHistory: history.slice(0, 8),
      })
    }
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [])

  const playsDelta = stats
    ? deltaLabel(stats.playsToday, stats.playsYesterday)
    : null

  return (
    <div className="space-y-6 py-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Visão geral</h2>
        <p className="text-muted-foreground">
          Operação da rede de telas LEDE — atualiza a cada 30s
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clientes</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.clientsTotal ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <SegmentedBar
                  segments={[
                    {
                      value: stats.clientsCondo,
                      label: "Condomínio",
                      className: "bg-primary",
                    },
                    {
                      value: stats.clientsAds,
                      label: "ADS",
                      className: "bg-primary/40",
                    },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {stats.clientsCondo} condomínio · {stats.clientsAds} ADS
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Telas online</CardDescription>
            <CardTitle className="text-3xl">
              {stats
                ? `${stats.devicesOnline}/${stats.devicesTotal}`
                : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats ? (
              <>
                <Sparkline
                  values={
                    stats.onlineHistory.length >= 2
                      ? stats.onlineHistory
                      : [
                          Math.max(0, stats.devicesOnline - 1),
                          stats.devicesOnline,
                        ]
                  }
                />
                <SegmentedBar
                  segments={[
                    {
                      value: stats.devicesOnline,
                      label: "Online",
                      className: "bg-emerald-500",
                    },
                    {
                      value: stats.devicesPairing,
                      label: "Pareando",
                      className: "bg-amber-500",
                    },
                    {
                      value: stats.devicesOffline,
                      label: "Offline",
                      className: "bg-destructive/70",
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    Offline {stats.devicesOffline}
                  </Badge>
                  {stats.updatesAvailable > 0 ? (
                    <Badge variant="destructive">
                      Update {stats.updatesAvailable}
                    </Badge>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mídias pendentes</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.pendingMedia ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <SegmentedBar
                  segments={[
                    {
                      value: stats.pendingMedia,
                      label: "Pendentes",
                      className: "bg-amber-500",
                    },
                    {
                      value: stats.approvedMedia,
                      label: "Aprovadas",
                      className: "bg-primary/50",
                    },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {stats.approvedMedia} aprovadas no catálogo
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardDescription>Exibições (7 dias)</CardDescription>
                <CardTitle className="text-3xl">
                  {stats?.plays7d.toLocaleString("pt-BR") ?? "—"}
                </CardTitle>
              </div>
              {playsDelta ? (
                <Badge variant={playsDelta.up ? "default" : "secondary"}>
                  {playsDelta.text} vs ontem
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats ? (
              <>
                <MiniBarChart points={stats.playsByDay} />
                <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  {stats.playsByDay.map((d) => (
                    <span key={d.key} className="w-full text-center">
                      {d.label.slice(0, 3)}
                    </span>
                  ))}
                </div>
                <Link
                  href="/dashboard/reports"
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "px-0",
                  )}
                >
                  Ver amostragem
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agendamentos ativos</CardDescription>
            <CardTitle className="text-3xl">
              {stats
                ? `${stats.schedulesActive}/${stats.schedulesTotal}`
                : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <SegmentedBar
                  segments={[
                    {
                      value: stats.schedulesActive,
                      label: "Ativos",
                      className: "bg-primary",
                    },
                    {
                      value: Math.max(
                        0,
                        stats.schedulesTotal - stats.schedulesActive,
                      ),
                      label: "Inativos",
                      className: "bg-muted-foreground/25",
                    },
                  ]}
                />
                <Link
                  href="/dashboard/schedules"
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "px-0",
                  )}
                >
                  Abrir agendas
                </Link>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cenas ativas</CardDescription>
            <CardTitle className="text-3xl">
              {stats ? `${stats.scenesActive}/${stats.scenesTotal}` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <SegmentedBar
                  segments={[
                    {
                      value: stats.scenesActive,
                      label: "Ativas",
                      className: "bg-primary",
                    },
                    {
                      value: Math.max(
                        0,
                        stats.scenesTotal - stats.scenesActive,
                      ),
                      label: "Inativas",
                      className: "bg-muted-foreground/25",
                    },
                  ]}
                />
                <Link
                  href="/dashboard/scenes"
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "px-0",
                  )}
                >
                  Abrir cenas
                </Link>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Planos ativos</CardDescription>
            <CardTitle className="text-3xl">
              {stats ? `${stats.plansActive}/${stats.plansTotal}` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <SegmentedBar
                  segments={[
                    {
                      value: stats.plansActive,
                      label: "Ativos",
                      className: "bg-primary",
                    },
                    {
                      value: Math.max(0, stats.plansTotal - stats.plansActive),
                      label: "Inativos",
                      className: "bg-muted-foreground/25",
                    },
                  ]}
                />
                <Link
                  href="/dashboard/plans"
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "px-0",
                  )}
                >
                  Abrir planos
                </Link>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Capacidade</CardDescription>
            <CardTitle className="text-3xl">
              {stats ? `${stats.capacityAvgOccupancy}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats ? (
              <>
                <OccupancyBars items={stats.capacityTop} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {stats.capacityFull}/{stats.capacityGroups} lotados
                  </span>
                  <Link
                    href="/dashboard/capacity"
                    className={cn(
                      buttonVariants({ variant: "link", size: "sm" }),
                      "h-auto px-0",
                    )}
                  >
                    Detalhes
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Telas offline</CardTitle>
              <CardDescription>Último heartbeat conhecido</CardDescription>
            </div>
            <Link
              href="/dashboard/devices"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Monitoramento
            </Link>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : stats.offlineDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma tela offline no momento.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tela</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Heartbeat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.offlineDevices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.client?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeHeartbeat(d.lastHeartbeatAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Mídias aguardando aprovação</CardTitle>
              <CardDescription>Fila de revisão</CardDescription>
            </div>
            <Link
              href="/dashboard/media"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Mídias
            </Link>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : stats.pendingMediaList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma mídia pendente.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.pendingMediaList.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.client?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">Pendente</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Últimas exibições</CardTitle>
              <CardDescription>Proof-of-play recente</CardDescription>
            </div>
            <Link
              href="/dashboard/reports"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Amostragem
            </Link>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : stats.recentPlays.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem exibições registradas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Mídia</TableHead>
                    <TableHead>Tela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentPlays.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatWhen(r.startedAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.media.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.device.name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Uploads, revisões e avisos</CardDescription>
            </div>
            <Link
              href="/dashboard/history"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Histórico
            </Link>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : stats.recentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade registrada.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Resumo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatWhen(h.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {actionLabel[h.action] ?? h.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">
                        {h.summary}
                        {h.client?.name ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {h.client.name}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
