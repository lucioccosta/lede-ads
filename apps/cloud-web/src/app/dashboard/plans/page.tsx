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
type DeviceGroup = {
  id: string
  name: string
  client: { name: string }
  _count?: { devices: number }
}
type Plan = {
  id: string
  name: string
  samplesPerDay: number
  sampleDurationSec: number
  months: number
  startsAt: string
  endsAt: string | null
  active: boolean
  clientId: string
  client: { name: string }
  deviceGroups?: Array<{
    deviceGroupId: string
    deviceGroup: { id: string; name: string }
  }>
}

export default function PlansPage() {
  const [items, setItems] = useState<Plan[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [clientId, setClientId] = useState("")
  const [name, setName] = useState("")
  const [samplesPerDay, setSamplesPerDay] = useState("100")
  const [sampleDurationSec, setSampleDurationSec] = useState("10")
  const [months, setMonths] = useState("1")
  const [startsAt, setStartsAt] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [groupIds, setGroupIds] = useState<string[]>([])

  async function load() {
    const [plans, clientList, groupList] = await Promise.all([
      api<Plan[]>("/plans"),
      api<Client[]>("/clients"),
      api<DeviceGroup[]>("/device-groups"),
    ])
    setItems(plans)
    setClients(clientList.filter((c) => !c.isCondo))
    setGroups(groupList)
  }

  useEffect(() => {
    void load()
  }, [])

  const productPreview = useMemo(() => {
    const samples = Number(samplesPerDay) || 0
    const m = Number(months) || 0
    const dur = Number(sampleDurationSec) || 10
    return {
      label: `${dur}s × ${samples.toLocaleString("pt-BR")}/dia × ${m} mês(es)`,
      estimate: samples * 30 * m,
    }
  }, [samplesPerDay, months, sampleDurationSec])

  function openCreate() {
    setEditing(null)
    setClientId(clients[0]?.id ?? "")
    setName("")
    setSamplesPerDay("100")
    setSampleDurationSec("10")
    setMonths("1")
    setStartsAt(new Date().toISOString().slice(0, 10))
    setGroupIds([])
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setClientId(plan.clientId)
    setName(plan.name)
    setSamplesPerDay(String(plan.samplesPerDay))
    setSampleDurationSec(String(plan.sampleDurationSec))
    setMonths(String(plan.months ?? 1))
    setStartsAt(plan.startsAt.slice(0, 10))
    setGroupIds(plan.deviceGroups?.map((g) => g.deviceGroupId) ?? [])
    setOpen(true)
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (groupIds.length === 0) {
      toast.error("Selecione ao menos um grupo de telas")
      return
    }
    const payload = {
      name,
      samplesPerDay: Number(samplesPerDay),
      sampleDurationSec: Number(sampleDurationSec),
      months: Number(months),
      startsAt: new Date(startsAt).toISOString(),
      groupIds,
    }
    try {
      if (editing) {
        await api(`/plans/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Plano atualizado")
      } else {
        await api("/plans", {
          method: "POST",
          body: JSON.stringify({ ...payload, clientId }),
        })
        toast.success("Plano criado")
      }
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    }
  }

  async function toggleActive(plan: Plan) {
    await api(`/plans/${plan.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !plan.active }),
    })
    toast.success(plan.active ? "Plano desativado" : "Plano ativado")
    await load()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planos</h2>
          <p className="text-muted-foreground">
            Produto: 10s × amostragens/dia × meses, por grupo de telas
          </p>
        </div>
        <Button onClick={openCreate}>Novo plano</Button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar plano ou cliente…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar plano" : "Cadastrar plano"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            {!editing && (
              <div className="space-y-2">
                <Label>Cliente anunciante</Label>
                <Select
                  value={clientId || "none"}
                  onValueChange={(v) => setClientId(v === "none" ? "" : (v ?? ""))}
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
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="samples">Amostr./dia</Label>
                <Input
                  id="samples"
                  type="number"
                  min={1}
                  value={samplesPerDay}
                  onChange={(e) => setSamplesPerDay(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Slot (s)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={sampleDurationSec}
                  onChange={(e) => setSampleDurationSec(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="months">Meses</Label>
                <Input
                  id="months"
                  type="number"
                  min={1}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {productPreview.label}
              {productPreview.estimate > 0
                ? ` · ~${productPreview.estimate.toLocaleString("pt-BR")} amostragens no período`
                : ""}
            </p>
            <div className="space-y-2">
              <Label htmlFor="starts">Início</Label>
              <Input
                id="starts"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Grupos de telas</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Cadastre grupos em Grupos de telas
                  </p>
                ) : (
                  groups.map((g) => (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                      />
                      <span>
                        {g.name}
                        <span className="text-muted-foreground">
                          {" "}
                          ({g.client.name})
                        </span>
                      </span>
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

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum plano"
          description="Crie um plano com amostragem diária e grupos alvo."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Planos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Grupos</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.client.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.sampleDurationSec}s × {p.samplesPerDay}/dia ×{" "}
                      {p.months ?? 1}m
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.deviceGroups ?? []).map((g) => (
                          <Badge key={g.deviceGroupId} variant="secondary">
                            {g.deviceGroup.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(p.startsAt).toLocaleDateString("pt-BR")}
                      {p.endsAt
                        ? ` → ${new Date(p.endsAt).toLocaleDateString("pt-BR")}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(p)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleActive(p)}
                      >
                        {p.active ? "Desativar" : "Ativar"}
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
