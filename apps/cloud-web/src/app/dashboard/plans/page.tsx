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
  screenCount?: number
  condoPriceCents?: number
  pricePerScreenCents?: number
  impactedPeople?: number
}
type Plan = {
  id: string
  name: string
  samplesPerDay: number
  months: number
  startsAt: string
  endsAt: string | null
  active: boolean
  clientId: string | null
  client: { id: string; name: string } | null
  monthlyPriceCents?: number
  totalPriceCents?: number
  deviceGroups?: Array<{
    deviceGroupId: string
    deviceGroup: {
      id: string
      name: string
      screenCount?: number
      condoPriceCents?: number
    }
  }>
}

function brlFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export default function PlansPage() {
  const [items, setItems] = useState<Plan[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [clientId, setClientId] = useState("none")
  const [name, setName] = useState("")
  const [samplesPerDay, setSamplesPerDay] = useState("100")
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
    return {
      label: `${samples.toLocaleString("pt-BR")}/dia × ${m} mês(es)`,
      estimate: samples * 30 * m,
    }
  }, [samplesPerDay, months])

  const pricePreview = useMemo(() => {
    const m = Number(months) || 0
    const lines = groupIds.map((id) => {
      const g = groups.find((x) => x.id === id)
      const cents =
        g?.condoPriceCents ??
        (g?.screenCount ?? g?._count?.devices ?? 0) *
          (g?.pricePerScreenCents ?? 0)
      return { id, name: g?.name ?? id, cents }
    })
    const monthly = lines.reduce((s, l) => s + l.cents, 0)
    return { lines, monthly, total: monthly * m }
  }, [groupIds, groups, months])

  function openCreate() {
    setEditing(null)
    setClientId("none")
    setName("")
    setSamplesPerDay("100")
    setMonths("1")
    setStartsAt(new Date().toISOString().slice(0, 10))
    setGroupIds([])
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setClientId(plan.clientId ?? "none")
    setName(plan.name)
    setSamplesPerDay(String(plan.samplesPerDay))
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
    const resolvedClientId = clientId === "none" ? null : clientId
    const payload = {
      name,
      samplesPerDay: Number(samplesPerDay),
      months: Number(months),
      startsAt: new Date(startsAt).toISOString(),
      groupIds,
      clientId: resolvedClientId,
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
          body: JSON.stringify(payload),
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
    if (plan.active) {
      const ok = window.confirm(
        `Desativar o plano "${plan.name}"? Ele deixa de ser usado em novas agendas.`,
      )
      if (!ok) return
    }
    try {
      await api(`/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !plan.active }),
      })
      toast.success(plan.active ? "Plano desativado" : "Plano ativado")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status")
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.client?.name ?? "sem anunciante").toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planos</h2>
          <p className="text-muted-foreground">
            Venda por praça (valor do condomínio × meses) + amostragens/dia no
            grupo. Vincule o anunciante na edição ou na agenda.
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
            {editing ? (
              <div className="space-y-2">
                <Label>Anunciante (opcional)</Label>
                <Select
                  value={clientId}
                  onValueChange={(v) => setClientId(v ?? "none")}
                  items={{
                    none: "Sem anunciante",
                    ...Object.fromEntries(clients.map((c) => [c.id, c.name])),
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sem anunciante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem anunciante</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Também pode vincular ao criar um agendamento ads.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              Duração do slot (segundos) fica no grupo de telas.
            </p>
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
                  groups.map((g) => {
                    const cents =
                      g.condoPriceCents ??
                      (g.screenCount ?? g._count?.devices ?? 0) *
                        (g.pricePerScreenCents ?? 0)
                    return (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                      />
                      <span className="flex-1">
                        {g.name}
                        <span className="text-muted-foreground">
                          {" "}
                          ({g.client.name})
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {brlFromCents(cents)}/mês
                      </span>
                    </label>
                    )
                  })
                )}
              </div>
              {pricePreview.lines.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {pricePreview.lines
                    .map((l) => `${l.name} ${brlFromCents(l.cents)}`)
                    .join(" + ")}{" "}
                  ={" "}
                  <span className="font-medium text-foreground">
                    {brlFromCents(pricePreview.monthly)}/mês
                  </span>
                  {Number(months) > 0
                    ? ` × ${months} = ${brlFromCents(pricePreview.total)}`
                    : ""}
                </p>
              ) : null}
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
                  <TableHead>Anunciante</TableHead>
                  <TableHead>Valor</TableHead>
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
                    <TableCell>
                      {p.client?.name ?? (
                        <span className="text-muted-foreground">
                          Sem anunciante
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">
                        {brlFromCents(p.monthlyPriceCents ?? 0)}/mês
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {brlFromCents(p.totalPriceCents ?? 0)} total
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.samplesPerDay}/dia × {p.months ?? 1}m
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
                        variant={p.active ? "destructive" : "outline"}
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
