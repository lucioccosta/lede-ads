"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { api, uploadFile } from "@/lib/api"
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
import { EmptyState } from "@/components/empty-state"
import { ListToolbar } from "@/components/list-toolbar"
import { toast } from "sonner"
import { EyeIcon, ImageIcon, VideoIcon } from "lucide-react"

type Client = { id: string; name: string }
type Media = {
  id: string
  name: string
  type: string
  status: string
  durationMs: number
  url: string
  client: { name: string }
}

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
}

const typeLabel: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
}

function MediaPreview({
  url,
  type,
  name,
  className,
}: {
  url: string
  type: string
  name: string
  className?: string
}) {
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
      >
        Sem preview
      </div>
    )
  }

  if (type === "video") {
    return (
      <video
        src={url}
        controls
        className={className}
        preload="metadata"
      >
        <track kind="captions" />
      </video>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className={className} />
  )
}

export default function MediaPage() {
  const [items, setItems] = useState<Media[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Media | null>(null)
  const [clientId, setClientId] = useState("")
  const [name, setName] = useState("")
  const [durationSec, setDurationSec] = useState("10")
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.client.name.toLowerCase().includes(q)
      )
    })
  }, [items, search, statusFilter])

  const localPreviewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file)
    if (url) return url
    return ""
  }, [file, url])

  const localPreviewType = useMemo(() => {
    if (file) {
      return file.type.startsWith("video/") ? "video" : "image"
    }
    if (url.match(/\.(mp4|webm|mov)(\?|$)/i)) return "video"
    return "image"
  }, [file, url])

  useEffect(() => {
    return () => {
      if (file && localPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localPreviewUrl)
      }
    }
  }, [file, localPreviewUrl])

  async function load() {
    const [media, clientList] = await Promise.all([
      api<Media[]>("/media"),
      api<Client[]>("/clients"),
    ])
    setItems(media)
    setClients(clientList)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setClientId(clients[0]?.id ?? "")
    setName("")
    setDurationSec("10")
    setUrl("")
    setFile(null)
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      let mediaUrl = url
      let mimeType = "image/png"
      let checksum = `url-${Date.now()}`
      let fileSize = 0
      let type: "image" | "video" = "image"

      if (file) {
        const uploaded = await uploadFile(file)
        mediaUrl = uploaded.url
        mimeType = uploaded.mimeType
        checksum = uploaded.checksum
        fileSize = uploaded.fileSize
        type = uploaded.type
        if (!name) setName(uploaded.originalName)
      } else if (!mediaUrl) {
        throw new Error("Informe uma URL ou selecione um arquivo")
      } else {
        type = mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i) ? "video" : "image"
        mimeType = type === "video" ? "video/mp4" : "image/jpeg"
      }

      await api("/media", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          name: name || file?.name || "Nova mídia",
          type,
          mimeType,
          url: mediaUrl,
          checksum,
          durationMs: Number(durationSec) * 1000,
          fileSize,
          status: "draft",
        }),
      })
      toast.success("Mídia cadastrada")
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function submit(id: string) {
    await api(`/media/${id}/submit`, { method: "POST" })
    toast.success("Enviada para aprovação")
    await load()
  }

  async function approve(id: string) {
    await api(`/media/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    })
    toast.success("Mídia aprovada")
    await load()
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mídias</h2>
          <p className="text-muted-foreground">
            Vídeos e imagens (duração padrão 10s)
          </p>
        </div>
        <Button onClick={openCreate}>Nova mídia</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar mídia</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
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
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spot 10s"
              />
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
            <div className="space-y-2">
              <Label htmlFor="file">Arquivo (imagem ou vídeo)</Label>
              <Input
                id="file"
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Ou URL externa</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                disabled={Boolean(file)}
              />
            </div>
            {localPreviewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Pré-visualização</Label>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      {localPreviewType === "video" ? "Vídeo" : "Imagem"}
                    </Badge>
                    <Badge variant="secondary">{durationSec}s</Badge>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border bg-black">
                  <MediaPreview
                    url={localPreviewUrl}
                    type={localPreviewType}
                    name={name || "Preview"}
                    className="aspect-video w-full object-contain"
                  />
                </div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(v) => {
          if (!v) setPreview(null)
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.name ?? "Pré-visualização"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {preview.type === "video" ? "Vídeo" : "Imagem"}
                </Badge>
                <Badge variant="secondary">{preview.durationMs / 1000}s</Badge>
              </div>
              <div className="overflow-hidden rounded-lg border bg-black">
                <MediaPreview
                  url={preview.url}
                  type={preview.type}
                  name={preview.name}
                  className="aspect-video w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {statusLabel[preview.status] ?? preview.status}
                </Badge>
                <span>{preview.client.name}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar mídia ou cliente…"
      >
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "all")}
          items={{
            all: "Todos os status",
            draft: "Rascunho",
            pending_approval: "Pendente",
            approved: "Aprovada",
            rejected: "Rejeitada",
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="pending_approval">Pendente</SelectItem>
            <SelectItem value="approved">Aprovada</SelectItem>
            <SelectItem value="rejected">Rejeitada</SelectItem>
          </SelectContent>
        </Select>
      </ListToolbar>

      {items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="size-10" />}
          title="Nenhuma mídia"
          description="Faça upload de imagens ou vídeos para montar cenas."
          actionLabel="Nova mídia"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Biblioteca ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum resultado"
                description="Ajuste a busca ou o filtro de status."
                actionLabel="Limpar filtros"
                onAction={() => {
                  setSearch("")
                  setStatusFilter("all")
                }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[88px]">Preview</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="relative block size-14 overflow-hidden rounded-md border bg-muted"
                          onClick={() => setPreview(m)}
                          title="Pré-visualizar"
                        >
                          {m.type === "video" ? (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <VideoIcon className="size-5" />
                            </div>
                          ) : m.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.url}
                              alt={m.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="size-5" />
                            </div>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.client.name}</TableCell>
                      <TableCell>{typeLabel[m.type] ?? m.type}</TableCell>
                      <TableCell>{m.durationMs / 1000}s</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {statusLabel[m.status] ?? m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreview(m)}
                        >
                          <EyeIcon className="size-4" />
                          Ver
                        </Button>
                        {m.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void submit(m.id)}
                          >
                            Submeter
                          </Button>
                        )}
                        {m.status === "pending_approval" && (
                          <Button size="sm" onClick={() => void approve(m.id)}>
                            Aprovar
                          </Button>
                        )}
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
