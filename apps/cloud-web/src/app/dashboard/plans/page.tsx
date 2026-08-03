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

type Client = { id: string; name: string }
type Plan = {
  id: string
  name: string
  samplesPerDay: number
  sampleDurationSec: number
  startsAt: string
  endsAt: string | null
  active: boolean
  clientId: string
  client: { name: string }
}

export default function PlansPage() {
  const [items, setItems] = useState<Plan[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [clientId, setClientId] = useState("")
  const [name, setName] = useState("")
  const [samplesPerDay, setSamplesPerDay] = useState("100")
  const [sampleDurationSec, setSampleDurationSec] = useState("10")
  const [startsAt, setStartsAt] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [endsAt, setEndsAt] = useState("")

  async function load() {
    const [plans, clientList] = await Promise.all([
      api<Plan[]>("/plans"),
      api<Client[]>("/clients"),
    ])
    setItems(plans)
    setClients(clientList)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setClientId(clients[0]?.id ?? "")
    setName("")
    setSamplesPerDay("100")
    setSampleDurationSec("10")
    setStartsAt(new Date().toISOString().slice(0, 10))
    setEndsAt("")
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setClientId(plan.clientId)
    setName(plan.name)
    setSamplesPerDay(String(plan.samplesPerDay))
    setSampleDurationSec(String(plan.sampleDurationSec))
    setStartsAt(plan.startsAt.slice(0, 10))
    setEndsAt(plan.endsAt ? plan.endsAt.slice(0, 10) : "")
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const payload = {
      name,
      samplesPerDay: Number(samplesPerDay),
      sampleDurationSec: Number(sampleDurationSec),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
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
            Contratos de amostragem por cliente
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar plano" : "Cadastrar plano"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
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
                <Label htmlFor="samples">Amostragens/dia</Label>
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
                <Label htmlFor="duration">Duração (s)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={sampleDurationSec}
                  onChange={(e) => setSampleDurationSec(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="ends">Fim (opcional)</Label>
                <Input
                  id="ends"
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
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
          title="Nenhum plano"
          description="Defina contratos de amostragem por cliente."
          actionLabel="Novo plano"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Lista ({filtered.length})</CardTitle>
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Amostragens/dia</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.client.name}</TableCell>
                      <TableCell>{p.samplesPerDay}</TableCell>
                      <TableCell>{p.sampleDurationSec}s</TableCell>
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
