"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import { EmptyState } from "@/components/empty-state"
import { ListToolbar } from "@/components/list-toolbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type Client = { id: string; name: string; isCondo?: boolean }
type Scene = { id: string; name: string; clientId: string }
type Plan = { id: string; name: string; clientId: string }
type Device = { id: string; name: string }
type DeviceGroup = { id: string; name: string }
type ScheduleChannel = "full" | "condo" | "ads"
type Schedule = {
  id: string
  name: string
  startTime: string
  endTime: string
  priority: number
  active: boolean
  channel: ScheduleChannel
  clientId: string
  sceneId: string
  planId: string | null
  deviceId: string | null
  groupId: string | null
  daysOfWeek: number[]
  scene: { name: string }
  device: { name: string } | null
  group?: { id: string; name: string } | null
}

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
]

export default function SchedulesPage() {
  const [items, setItems] = useState<Schedule[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [name, setName] = useState("")
  const [clientId, setClientId] = useState("")
  const [sceneId, setSceneId] = useState("")
  const [planId, setPlanId] = useState<string>("none")
  const [deviceId, setDeviceId] = useState<string>("all")
  const [groupId, setGroupId] = useState<string>("none")
  const [priority, setPriority] = useState("10")
  const [startTime, setStartTime] = useState("00:00")
  const [endTime, setEndTime] = useState("23:59")
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [channel, setChannel] = useState<ScheduleChannel>("full")
  const [search, setSearch] = useState("")

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  )
  const clientIsCondo = !!selectedClient?.isCondo

  const channelOptions = useMemo(() => {
    const options: { value: ScheduleChannel; label: string }[] = [
      { value: "full", label: "Full (tela inteira)" },
    ]
    if (clientIsCondo) {
      options.push({
        value: "condo",
        label: "Condomínio (área exclusiva)",
      })
    } else {
      options.push({ value: "ads", label: "Anúncios LEDE" })
    }
    return options
  }, [clientIsCondo])

  function defaultChannelForClient(isCondo: boolean): ScheduleChannel {
    return isCondo ? "condo" : "full"
  }

  function sanitizeChannel(
    next: ScheduleChannel,
    isCondo: boolean,
  ): ScheduleChannel {
    if (isCondo && next === "ads") return "condo"
    if (!isCondo && next === "condo") return "full"
    return next
  }

  async function load() {
    const [schedules, clientList, sceneList, planList, deviceList, groupList] =
      await Promise.all([
        api<Schedule[]>("/schedules"),
        api<Client[]>("/clients"),
        api<Scene[]>("/scenes"),
        api<Plan[]>("/plans"),
        api<Device[]>("/devices"),
        api<DeviceGroup[]>("/device-groups"),
      ])
    setItems(schedules)
    setClients(clientList)
    setScenes(sceneList)
    setPlans(planList)
    setDevices(deviceList)
    setGroups(groupList)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setName("")
    const firstClient = clients[0]
    const firstClientId = firstClient?.id ?? ""
    setClientId(firstClientId)
    const firstScene =
      scenes.find((s) => s.clientId === firstClientId)?.id ?? ""
    setSceneId(firstScene)
    setPlanId("none")
    setDeviceId("all")
    setGroupId("none")
    setPriority("10")
    setStartTime("00:00")
    setEndTime("23:59")
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])
    setChannel(defaultChannelForClient(!!firstClient?.isCondo))
    setOpen(true)
  }

  function onClientChange(nextClientId: string) {
    setClientId(nextClientId)
    const nextScenes = scenes.filter((s) => s.clientId === nextClientId)
    setSceneId(nextScenes[0]?.id ?? "")
    setPlanId("none")
    const nextClient = clients.find((c) => c.id === nextClientId)
    const isCondo = !!nextClient?.isCondo
    setChannel((prev) => sanitizeChannel(prev, isCondo))
    if (isCondo) {
      setGroupId("none")
    }
  }

  function openEdit(schedule: Schedule) {
    setEditing(schedule)
    setName(schedule.name)
    setClientId(schedule.clientId)
    setSceneId(schedule.sceneId)
    setPlanId(schedule.planId ?? "none")
    setDeviceId(schedule.deviceId ?? "all")
    setGroupId(schedule.groupId ?? "none")
    setPriority(String(schedule.priority))
    setStartTime(schedule.startTime)
    setEndTime(schedule.endTime)
    setDaysOfWeek(schedule.daysOfWeek)
    const client = clients.find((c) => c.id === schedule.clientId)
    setChannel(
      sanitizeChannel(schedule.channel ?? "full", !!client?.isCondo),
    )
    setOpen(true)
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!daysOfWeek.length) {
      toast.error("Selecione ao menos um dia")
      return
    }
    if (!clientId) {
      toast.error("Selecione o cliente")
      return
    }
    if (!sceneId) {
      toast.error("Selecione a cena")
      return
    }
    const scene = scenes.find((s) => s.id === sceneId)
    if (!scene || scene.clientId !== clientId) {
      toast.error(
        "A cena selecionada não pertence a este cliente. Selecione o cliente da cena e depois a cena.",
      )
      return
    }
    if (channel === "ads" && groupId === "none") {
      toast.error("Selecione o grupo de telas para anúncios")
      return
    }
    if (clientIsCondo && channel === "ads") {
      toast.error("Cliente condomínio não usa o canal Anúncios LEDE")
      return
    }
    if (!clientIsCondo && channel === "condo") {
      toast.error("Cliente anunciante não usa o canal Condomínio")
      return
    }
    const payload = {
      name,
      sceneId,
      planId: planId === "none" ? null : planId,
      deviceId: channel === "ads" ? null : deviceId === "all" ? null : deviceId,
      groupId: groupId === "none" ? null : groupId,
      channel,
      priority: Number(priority),
      daysOfWeek,
      startTime,
      endTime,
    }
    try {
      if (editing) {
        await api(`/schedules/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Agendamento atualizado")
      } else {
        await api("/schedules", {
          method: "POST",
          body: JSON.stringify({ ...payload, clientId }),
        })
        toast.success("Agendamento criado")
      }
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    }
  }

  async function toggleActive(schedule: Schedule) {
    await api(`/schedules/${schedule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !schedule.active }),
    })
    toast.success(schedule.active ? "Desativado" : "Ativado")
    await load()
  }

  async function removeSchedule(schedule: Schedule) {
    const ok = window.confirm(
      `Remover o agendamento "${schedule.name}"?`,
    )
    if (!ok) return
    try {
      await api(`/schedules/${schedule.id}`, { method: "DELETE" })
      toast.success("Agendamento removido")
      if (editing?.id === schedule.id) setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover")
    }
  }

  const clientScenes = scenes.filter((s) => s.clientId === clientId)
  const clientPlans = plans.filter((p) => p.clientId === clientId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.scene.name.toLowerCase().includes(q) ||
        (s.device?.name ?? "todas").toLowerCase().includes(q) ||
        (s.group?.name ?? "").toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agendamentos</h2>
          <p className="text-muted-foreground">
            Quando e onde cada cena roda
          </p>
        </div>
        <Button onClick={openCreate}>Novo agendamento</Button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar agendamento, cena ou tela…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar agendamento" : "Cadastrar agendamento"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={clientId}
                  onValueChange={(v) => onClientChange(v ?? "")}
                  items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select
                value={channel}
                onValueChange={(v) => {
                  if (v === "full" || v === "condo" || v === "ads") {
                    setChannel(sanitizeChannel(v, clientIsCondo))
                  }
                }}
                items={Object.fromEntries(
                  channelOptions.map((o) => [o.value, o.label]),
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channelOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cena</Label>
              <Select
                value={sceneId || "none"}
                onValueChange={(v) =>
                  setSceneId(!v || v === "none" ? "" : v)
                }
                items={{
                  none:
                    clientScenes.length === 0
                      ? "Nenhuma cena neste cliente"
                      : "Selecione",
                  ...Object.fromEntries(
                    clientScenes.map((s) => [s.id, s.name]),
                  ),
                }}
                disabled={clientScenes.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      clientScenes.length === 0
                        ? "Nenhuma cena neste cliente"
                        : "Selecione"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    {clientScenes.length === 0
                      ? "Nenhuma cena neste cliente"
                      : "Selecione"}
                  </SelectItem>
                  {clientScenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientScenes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Cadastre uma cena para este cliente antes de agendar.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Plano (opcional)</Label>
                <Select
                  value={planId}
                  onValueChange={(v) => setPlanId(v ?? "")}
                  items={{
                    none: "Nenhum",
                    ...Object.fromEntries(
                      clientPlans.map((p) => [p.id, p.name]),
                    ),
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {clientPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {channel === "ads" ? (
                <div className="space-y-2">
                  <Label>Grupo de telas</Label>
                  <Select
                    value={groupId}
                    onValueChange={(v) => setGroupId(v ?? "none")}
                    items={{
                      none: "Selecione",
                      ...Object.fromEntries(groups.map((g) => [g.id, g.name])),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Tela</Label>
                  <Select
                    value={deviceId}
                    onValueChange={(v) => setDeviceId(v ?? "")}
                    items={{
                      all: "Todas",
                      ...Object.fromEntries(
                        devices.map((d) => [d.id, d.name]),
                      ),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {channel !== "ads" && (
              <div className="space-y-2">
                <Label>Grupo (opcional)</Label>
                <Select
                  value={groupId}
                  onValueChange={(v) => setGroupId(v ?? "none")}
                  items={{
                    none: "Nenhum",
                    ...Object.fromEntries(groups.map((g) => [g.id, g.name])),
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">Início</Label>
                <Input
                  id="start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Fim</Label>
                <Input
                  id="end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label
                    key={d.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={daysOfWeek.includes(d.value)}
                      onCheckedChange={() => toggleDay(d.value)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento"
          description="Defina quando cada cena deve tocar em cada tela."
          actionLabel="Novo agendamento"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Grade ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum resultado"
                description="Tente outro termo de busca."
                actionLabel="Limpar busca"
                onAction={() => setSearch("")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Cena</TableHead>
                    <TableHead>Tela / Grupo</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {s.channel === "condo"
                            ? "Condo"
                            : s.channel === "ads"
                              ? "Ads"
                              : "Full"}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.scene.name}</TableCell>
                      <TableCell>
                        {s.group?.name
                          ? `Grupo: ${s.group.name}`
                          : (s.device?.name ?? "Todas")}
                      </TableCell>
                      <TableCell>
                        {s.startTime}–{s.endTime}
                      </TableCell>
                      <TableCell>{s.priority}</TableCell>
                      <TableCell>
                        <Badge variant={s.active ? "default" : "secondary"}>
                          {s.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(s)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleActive(s)}
                        >
                          {s.active ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void removeSchedule(s)}
                        >
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
