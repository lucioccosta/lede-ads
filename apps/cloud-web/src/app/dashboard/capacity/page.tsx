"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { EmptyState } from "@/components/empty-state"
import { ListToolbar } from "@/components/list-toolbar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type GroupCapacity = {
  groupId: string
  groupName: string
  clientName: string
  deviceCount: number
  slotsPerScreenDay: number
  capacityPerDay: number
  soldPerDay: number
  vacantPerDay: number
  occupancyPct: number
  full: boolean
  nextEndsAt: string | null
  nextReleaseSamples: number | null
  plans: Array<{
    id: string
    name: string
    clientName: string
    samplesPerDay: number
    months: number
    endsAt: string | null
  }>
}

export default function CapacityPage() {
  const [items, setItems] = useState<GroupCapacity[]>([])
  const [search, setSearch] = useState("")
  const [detail, setDetail] = useState<GroupCapacity | null>(null)

  async function load() {
    const data = await api<GroupCapacity[]>("/capacity")
    setItems(data)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (g) =>
        g.groupName.toLowerCase().includes(q) ||
        g.clientName.toLowerCase().includes(q),
    )
  }, [items, search])

  const fullCount = items.filter((g) => g.full).length

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Capacidade</h2>
          <p className="text-muted-foreground">
            Inventário de anúncios por grupo (18h × slots de 10s × telas)
          </p>
        </div>
        <Button variant="outline" render={<Link href="/dashboard/device-groups" />}>
          Grupos de telas
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Grupos</CardDescription>
            <CardTitle className="text-3xl">{items.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lotados</CardDescription>
            <CardTitle className="text-3xl">{fullCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com vagas</CardDescription>
            <CardTitle className="text-3xl">
              {items.length - fullCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar grupo ou condomínio…"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="Sem dados de capacidade"
          description="Crie grupos de telas e vincule planos para ver ocupação."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ocupação por grupo</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Telas</TableHead>
                  <TableHead>Capacidade/dia</TableHead>
                  <TableHead>Vendido</TableHead>
                  <TableHead>Vago</TableHead>
                  <TableHead>Ocupação</TableHead>
                  <TableHead>Próxima vaga</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => (
                  <TableRow key={g.groupId}>
                    <TableCell>
                      <div className="font-medium">{g.groupName}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.clientName}
                      </div>
                    </TableCell>
                    <TableCell>{g.deviceCount}</TableCell>
                    <TableCell>{g.capacityPerDay.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{g.soldPerDay.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{g.vacantPerDay.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.min(100, g.occupancyPct)}%` }}
                          />
                        </div>
                        <span className="text-xs">{g.occupancyPct}%</span>
                        {g.full ? (
                          <Badge variant="destructive">Lotado</Badge>
                        ) : (
                          <Badge variant="secondary">Vagas</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {g.full && g.nextEndsAt
                        ? `${new Date(g.nextEndsAt).toLocaleDateString("pt-BR")} (−${g.nextReleaseSamples?.toLocaleString("pt-BR")}/dia)`
                        : g.full
                          ? "Sem término previsto"
                          : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetail(g)}
                      >
                        Detalhe
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.groupName}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {detail.slotsPerScreenDay.toLocaleString("pt-BR")} slots/tela ×{" "}
                {detail.deviceCount} tela(s) ={" "}
                {detail.capacityPerDay.toLocaleString("pt-BR")}/dia
              </p>
              {detail.plans.length === 0 ? (
                <p className="text-sm">Nenhum plano ativo neste grupo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plano</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Amostr./dia</TableHead>
                      <TableHead>Fim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.clientName}</TableCell>
                        <TableCell>
                          {p.samplesPerDay.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          {p.endsAt
                            ? new Date(p.endsAt).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
