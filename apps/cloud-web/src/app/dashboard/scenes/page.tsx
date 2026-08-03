"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
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
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/empty-state"
import { ListToolbar } from "@/components/list-toolbar"
import { toast } from "sonner"

type Client = { id: string; name: string; isCondo?: boolean }
type ZoneRole = "full" | "condo" | "ads"
type LayoutZone = {
  key: string
  label: string
  x: number
  y: number
  width: number
  height: number
  role?: ZoneRole
}

function zonesForClient(zones: LayoutZone[], isCondo: boolean): LayoutZone[] {
  const target: ZoneRole = isCondo ? "condo" : "ads"
  const matched = zones.filter((z) => (z.role ?? "full") === target)
  if (matched.length > 0) return matched
  // Layouts sem split: mantém zonas full
  return zones.filter((z) => (z.role ?? "full") === "full")
}
type Layout = {
  id: string
  name: string
  width: number
  height: number
  zonesJson: LayoutZone[]
}
type Media = { id: string; name: string; clientId: string; status: string }
type SceneZone = {
  zoneKey: string
  mediaId: string | null
  media?: { id: string; name: string } | null
}
type Scene = {
  id: string
  name: string
  durationMs: number
  active: boolean
  clientId: string
  layoutId: string
  client: { name: string }
  layout: { name: string; zonesJson?: LayoutZone[] }
  zones?: SceneZone[]
}

export default function ScenesPage() {
  const [items, setItems] = useState<Scene[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Scene | null>(null)
  const [clientId, setClientId] = useState("")
  const [layoutId, setLayoutId] = useState("")
  const [zoneMedia, setZoneMedia] = useState<Record<string, string>>({})
  const [name, setName] = useState("")
  const [durationSec, setDurationSec] = useState("10")
  const [search, setSearch] = useState("")

  async function load() {
    const [scenes, clientList, layoutList, mediaList] = await Promise.all([
      api<Scene[]>("/scenes"),
      api<Client[]>("/clients"),
      api<Layout[]>("/layouts"),
      api<Media[]>("/media"),
    ])
    setItems(scenes)
    setClients(clientList)
    setLayouts(layoutList)
    setMedia(mediaList)
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredMedia = useMemo(
    () =>
      media.filter(
        (m) =>
          m.clientId === clientId &&
          (m.status === "approved" || m.status === "draft"),
      ),
    [media, clientId],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.client.name.toLowerCase().includes(q) ||
        s.layout.name.toLowerCase().includes(q),
    )
  }, [items, search])

  const selectedClient = clients.find((c) => c.id === clientId)
  const isCondoClient = Boolean(selectedClient?.isCondo)
  const selectedLayout = layouts.find((l) => l.id === layoutId)
  const allLayoutZones = selectedLayout?.zonesJson ?? []
  const layoutZones = zonesForClient(allLayoutZones, isCondoClient)

  function initZoneMedia(
    zones: LayoutZone[],
    existing?: SceneZone[],
  ): Record<string, string> {
    const map: Record<string, string> = {}
    for (const z of zones) {
      const found = existing?.find((ez) => ez.zoneKey === z.key)
      map[z.key] = found?.mediaId ?? found?.media?.id ?? ""
    }
    return map
  }

  function openCreate() {
    const firstClient = clients[0]
    const firstLayout = layouts[0]
    const editable = zonesForClient(
      firstLayout?.zonesJson ?? [],
      Boolean(firstClient?.isCondo),
    )
    setEditing(null)
    setClientId(firstClient?.id ?? "")
    setLayoutId(firstLayout?.id ?? "")
    setZoneMedia(initZoneMedia(editable))
    setName("")
    setDurationSec("10")
    setOpen(true)
  }

  function openEdit(scene: Scene) {
    const layout =
      layouts.find((l) => l.id === scene.layoutId) ??
      ({
        id: scene.layoutId,
        name: scene.layout.name,
        width: 1920,
        height: 1080,
        zonesJson: scene.layout.zonesJson ?? [],
      } as Layout)
    const client = clients.find((c) => c.id === scene.clientId)
    const editable = zonesForClient(
      layout.zonesJson ?? [],
      Boolean(client?.isCondo),
    )
    setEditing(scene)
    setClientId(scene.clientId)
    setLayoutId(scene.layoutId)
    setName(scene.name)
    setDurationSec(String(scene.durationMs / 1000))
    setZoneMedia(initZoneMedia(editable, scene.zones))
    setOpen(true)
  }

  function onClientChange(nextClientId: string) {
    setClientId(nextClientId)
    const client = clients.find((c) => c.id === nextClientId)
    const layout = layouts.find((l) => l.id === layoutId)
    const editable = zonesForClient(
      layout?.zonesJson ?? [],
      Boolean(client?.isCondo),
    )
    setZoneMedia(initZoneMedia(editable))
  }

  function onLayoutChange(nextLayoutId: string) {
    setLayoutId(nextLayoutId)
    const layout = layouts.find((l) => l.id === nextLayoutId)
    const editable = zonesForClient(
      layout?.zonesJson ?? [],
      isCondoClient,
    )
    setZoneMedia(initZoneMedia(editable))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const editableKeys = new Set(layoutZones.map((z) => z.key))
    let zones = layoutZones
      .map((z) => ({
        zoneKey: z.key,
        mediaId: zoneMedia[z.key] || undefined,
      }))
      .filter((z) => z.mediaId)

    // Na edição, preserva mídias de zonas que este cliente não edita
    if (editing?.zones?.length) {
      const preserved = editing.zones
        .filter(
          (z) =>
            !editableKeys.has(z.zoneKey) &&
            (z.mediaId || z.media?.id),
        )
        .map((z) => ({
          zoneKey: z.zoneKey,
          mediaId: z.mediaId ?? z.media?.id ?? undefined,
        }))
        .filter((z) => z.mediaId)
      zones = [...zones, ...preserved]
    }

    if (layoutZones.length && zones.filter((z) => editableKeys.has(z.zoneKey)).length === 0) {
      toast.error("Selecione ao menos uma mídia para uma zona")
      return
    }

    const payload = {
      name,
      layoutId,
      durationMs: Number(durationSec) * 1000,
      zones,
    }
    try {
      if (editing) {
        await api(`/scenes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Cena atualizada")
      } else {
        await api("/scenes", {
          method: "POST",
          body: JSON.stringify({ ...payload, clientId }),
        })
        toast.success("Cena criada")
      }
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    }
  }

  async function toggleActive(scene: Scene) {
    await api(`/scenes/${scene.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !scene.active }),
    })
    toast.success(scene.active ? "Cena desativada" : "Cena ativada")
    await load()
  }

  async function removeScene(scene: Scene) {
    const ok = window.confirm(
      `Remover a cena "${scene.name}"? Agendas e provas de exibição vinculadas serão apagadas.`,
    )
    if (!ok) return
    try {
      await api(`/scenes/${scene.id}`, { method: "DELETE" })
      toast.success("Cena removida")
      if (editing?.id === scene.id) setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover")
    }
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cenas</h2>
          <p className="text-muted-foreground">
            Composição layout + mídias por zona
          </p>
        </div>
        <Button onClick={openCreate}>Nova cena</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar cena" : "Cadastrar cena"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
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
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Layout</Label>
              <Select
                value={layoutId}
                onValueChange={(v) => onLayoutChange(v ?? "")}
                items={Object.fromEntries(layouts.map((l) => [l.id, l.name]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label>Mídias por zona</Label>
                <p className="text-xs text-muted-foreground">
                  {!clientId || !layoutId
                    ? "Selecione cliente e layout"
                    : layoutZones.length
                      ? isCondoClient
                        ? "Cliente condomínio: somente zona de condomínio"
                        : "Cliente anunciante: somente zona de anúncios"
                      : "Nenhuma zona disponível para este tipo de cliente no layout"}
                </p>
              </div>
              {layoutZones.map((z) => (
                <div key={z.key} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{z.label}</Badge>
                    {(z.role === "condo" || z.role === "ads") && (
                      <Badge variant="secondary">
                        {z.role === "condo" ? "Condomínio" : "Anúncios"}
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {z.key}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {z.width}×{z.height} @ {z.x},{z.y}
                    </span>
                  </div>
                  <Select
                    value={zoneMedia[z.key] || "none"}
                    onValueChange={(v) =>
                      setZoneMedia((prev) => ({
                        ...prev,
                        [z.key]: v === "none" ? "" : (v ?? ""),
                      }))
                    }
                    items={{
                      none: "Sem mídia",
                      ...Object.fromEntries(
                        filteredMedia.map((m) => [m.id, m.name]),
                      ),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a mídia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem mídia</SelectItem>
                      {filteredMedia.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duração (s)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                required
              />
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
        placeholder="Buscar cena, cliente ou layout…"
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma cena"
          description="Monte cenas vinculando mídias às zonas do layout."
          actionLabel="Nova cena"
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
                    <TableHead>Layout</TableHead>
                    <TableHead>Zonas</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.client.name}</TableCell>
                      <TableCell>{s.layout.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(s.zones ?? []).map((z) => (
                            <Badge key={z.zoneKey} variant="secondary">
                              {z.zoneKey}
                              {z.media?.name ? `: ${z.media.name}` : ""}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{s.durationMs / 1000}s</TableCell>
                      <TableCell>
                        <Badge variant={s.active ? "default" : "secondary"}>
                          {s.active ? "Ativa" : "Inativa"}
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
                          onClick={() => void removeScene(s)}
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
