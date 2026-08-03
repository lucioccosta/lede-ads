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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type Client = { id: string; name: string; isCondo?: boolean }
type Device = {
  id: string
  name: string
  clientId: string | null
  groupId?: string | null
}
type Scene = { id: string; name: string; isHouseAd?: boolean }
type DeviceGroup = {
  id: string
  name: string
  clientId: string
  active: boolean
  viewingHoursPerDay: number
  sampleDurationSec: number
  houseSceneId: string | null
  client: { id: string; name: string; isCondo: boolean }
  houseScene?: { id: string; name: string } | null
  devices: Array<{ id: string; name: string }>
  _count?: { devices: number; plans: number }
  capacity?: {
    capacityPerDay: number
    soldPerDay: number
    vacantPerDay: number
    occupancyPct: number
    full: boolean
  }
}

export default function DeviceGroupsPage() {
  const [items, setItems] = useState<DeviceGroup[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DeviceGroup | null>(null)
  const [name, setName] = useState("")
  const [clientId, setClientId] = useState("")
  const [viewingHours, setViewingHours] = useState("18")
  const [sampleDuration, setSampleDuration] = useState("10")
  const [houseSceneId, setHouseSceneId] = useState("none")
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])

  const condoClients = useMemo(
    () => clients.filter((c) => c.isCondo),
    [clients],
  )
  const houseScenes = useMemo(
    () => scenes.filter((s) => s.isHouseAd),
    [scenes],
  )

  async function load() {
    const [groups, clientList, deviceList, sceneList] = await Promise.all([
      api<DeviceGroup[]>("/device-groups"),
      api<Client[]>("/clients"),
      api<Device[]>("/devices"),
      api<Scene[]>("/scenes"),
    ])
    setItems(groups)
    setClients(clientList)
    setDevices(deviceList)
    setScenes(sceneList)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.client.name.toLowerCase().includes(q),
    )
  }, [items, search])

  const availableDevices = useMemo(() => {
    return devices.filter(
      (d) =>
        !d.clientId ||
        d.clientId === clientId ||
        (editing && d.groupId === editing.id),
    )
  }, [devices, clientId, editing])

  function openCreate() {
    setEditing(null)
    setName("")
    setClientId(condoClients[0]?.id ?? "")
    setViewingHours("18")
    setSampleDuration("10")
    setHouseSceneId(houseScenes[0]?.id ?? "none")
    setSelectedDevices([])
    setOpen(true)
  }

  function openEdit(group: DeviceGroup) {
    setEditing(group)
    setName(group.name)
    setClientId(group.clientId)
    setViewingHours(String(group.viewingHoursPerDay))
    setSampleDuration(String(group.sampleDurationSec))
    setHouseSceneId(group.houseSceneId ?? "none")
    setSelectedDevices(group.devices.map((d) => d.id))
    setOpen(true)
  }

  function toggleDevice(id: string) {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!clientId) {
      toast.error("Selecione o condomínio")
      return
    }
    const payload = {
      name,
      clientId,
      viewingHoursPerDay: Number(viewingHours),
      sampleDurationSec: Number(sampleDuration),
      houseSceneId: houseSceneId === "none" ? null : houseSceneId,
      deviceIds: selectedDevices,
    }
    try {
      if (editing) {
        await api(`/device-groups/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Grupo atualizado")
      } else {
        await api("/device-groups", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast.success("Grupo criado")
      }
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    }
  }

  async function removeGroup(group: DeviceGroup) {
    const ok = window.confirm(`Remover o grupo "${group.name}"?`)
    if (!ok) return
    try {
      await api(`/device-groups/${group.id}`, { method: "DELETE" })
      toast.success("Grupo removido")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover")
    }
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Grupos de telas</h2>
          <p className="text-muted-foreground">
            Telas de um condomínio para venda de inventário de anúncios
          </p>
        </div>
        <Button onClick={openCreate}>Novo grupo</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar grupo" : "Cadastrar grupo"}
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
            <div className="space-y-2">
              <Label>Condomínio</Label>
              <Select
                value={clientId || "none"}
                onValueChange={(v) => {
                  setClientId(v === "none" ? "" : (v ?? ""))
                  setSelectedDevices([])
                }}
                items={Object.fromEntries(
                  condoClients.map((c) => [c.id, c.name]),
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {condoClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Horas/dia</Label>
                <Input
                  type="number"
                  min={1}
                  value={viewingHours}
                  onChange={(e) => setViewingHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Slot (s)</Label>
                <Input
                  type="number"
                  min={1}
                  value={sampleDuration}
                  onChange={(e) => setSampleDuration(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cena house (Anuncie AQUI)</Label>
              <Select
                value={houseSceneId}
                onValueChange={(v) => setHouseSceneId(v ?? "none")}
                items={{
                  none: "Global (primeira isHouseAd)",
                  ...Object.fromEntries(houseScenes.map((s) => [s.id, s.name])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Global (primeira isHouseAd)</SelectItem>
                  {houseScenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Telas do grupo</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {availableDevices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma tela disponível
                  </p>
                ) : (
                  availableDevices.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(d.id)}
                        onChange={() => toggleDevice(d.id)}
                      />
                      {d.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <Button type="submit" className="w-full">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar grupo ou condomínio…"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum grupo"
          description="Crie um grupo com as telas de um condomínio."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Grupos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Condomínio</TableHead>
                  <TableHead>Telas</TableHead>
                  <TableHead>Capacidade/dia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.client.name}</TableCell>
                    <TableCell>{g._count?.devices ?? g.devices.length}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {g.viewingHoursPerDay}h ×{" "}
                      {Math.floor(
                        (g.viewingHoursPerDay * 3600) / g.sampleDurationSec,
                      )}{" "}
                      slots × {g._count?.devices ?? g.devices.length}
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.active ? "default" : "secondary"}>
                        {g.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(g)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void removeGroup(g)}
                      >
                        Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
