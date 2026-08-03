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

type Client = { id: string; name: string }
type Scene = { id: string; name: string; clientId: string }
type Plan = { id: string; name: string; clientId: string }
type Device = { id: string; name: string }
type Schedule = {
  id: string
  name: string
  startTime: string
  endTime: string
  priority: number
  active: boolean
  channel: "full" | "condo" | "ads"
  clientId: string
  sceneId: string
  planId: string | null
  deviceId: string | null
  daysOfWeek: number[]
  scene: { name: string }
  device: { name: string } | null
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
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [name, setName] = useState("")
  const [clientId, setClientId] = useState("")
  const [sceneId, setSceneId] = useState("")
  const [planId, setPlanId] = useState<string>("none")
  const [deviceId, setDeviceId] = useState<string>("all")
  const [priority, setPriority] = useState("10")
  const [startTime, setStartTime] = useState("00:00")
  const [endTime, setEndTime] = useState("23:59")
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [channel, setChannel] = useState<"full" | "condo" | "ads">("full")
  const [search, setSearch] = useState("")

  async function load() {
    const [schedules, clientList, sceneList, planList, deviceList] =
      await Promise.all([
        api<Schedule[]>("/schedules"),
        api<Client[]>("/clients"),
        api<Scene[]>("/scenes"),
        api<Plan[]>("/plans"),
        api<Device[]>("/devices"),
      ])
    setItems(schedules)
    setClients(clientList)
    setScenes(sceneList)
    setPlans(planList)
    setDevices(deviceList)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setName("")
    setClientId(clients[0]?.id ?? "")
    setSceneId(scenes[0]?.id ?? "")
    setPlanId("none")
    setDeviceId("all")
    setPriority("10")
    setStartTime("00:00")
    setEndTime("23:59")
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])
    setChannel("full")
    setOpen(true)
  }

  function openEdit(schedule: Schedule) {
    setEditing(schedule)
    setName(schedule.name)
    setClientId(schedule.clientId)
    setSceneId(schedule.sceneId)
    setPlanId(schedule.planId ?? "none")
    setDeviceId(schedule.deviceId ?? "all")
    setPriority(String(schedule.priority))
    setStartTime(schedule.startTime)
    setEndTime(schedule.endTime)
    setDaysOfWeek(schedule.daysOfWeek)
    setChannel(schedule.channel ?? "full")
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
    const payload = {
      name,
      sceneId,
      planId: planId === "none" ? null : planId,
      deviceId: deviceId === "all" ? null : deviceId,
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

  const clientScenes = scenes.filter((s) => s.clientId === clientId)
  const clientPlans = plans.filter((p) => p.clientId === clientId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.scene.name.toLowerCase().includes(q) ||
        (s.device?.name ?? "todas").toLowerCase().includes(q),
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
                  onValueChange={(v) => setClientId(v ?? "")}
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
                onValueChange={(v) =>
                  setChannel(
                    v === "condo" || v === "ads" ? v : "full",
                  )
                }
                items={{
                  full: "Full (tela inteira)",
                  condo: "Condomínio (área exclusiva)",
                  ads: "Anúncios LEDE",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full (tela inteira)</SelectItem>
                  <SelectItem value="condo">
                    Condomínio (área exclusiva)
                  </SelectItem>
                  <SelectItem value="ads">Anúncios LEDE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cena</Label>
              <Select
                value={sceneId}
                onValueChange={(v) => setSceneId(v ?? "")}
                items={Object.fromEntries(
                  clientScenes.map((s) => [s.id, s.name]),
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {clientScenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            </div>
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
                    <TableHead>Tela</TableHead>
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
                      <TableCell>{s.device?.name ?? "Todas"}</TableCell>
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
