"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
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
import { PlusIcon, Trash2Icon } from "lucide-react"

type ZoneRole = "full" | "condo" | "ads"

type Zone = {
  key: string
  label: string
  x: number
  y: number
  width: number
  height: number
  role?: ZoneRole
}

type ScreenType = {
  id: string
  name: string
  slug: string
  mode: "standard" | "condo_split"
}

type Layout = {
  id: string
  name: string
  screenType: string
  screenTypeId: string | null
  screenTypeRef?: ScreenType | null
  width: number
  height: number
  zonesJson: Zone[]
}

const ZONE_PALETTE = [
  { fill: "rgba(56, 189, 248, 0.55)", border: "#0ea5e9", text: "#082f49" },
  { fill: "rgba(52, 211, 153, 0.55)", border: "#10b981", text: "#064e3b" },
  { fill: "rgba(251, 191, 36, 0.55)", border: "#f59e0b", text: "#78350f" },
  { fill: "rgba(251, 113, 133, 0.55)", border: "#f43f5e", text: "#881337" },
  { fill: "rgba(167, 139, 250, 0.55)", border: "#8b5cf6", text: "#4c1d95" },
  { fill: "rgba(34, 211, 238, 0.55)", border: "#06b6d4", text: "#164e63" },
]

function fullZone(w: number, h: number): Zone {
  return {
    key: "main",
    label: "Principal",
    x: 0,
    y: 0,
    width: w,
    height: h,
    role: "full",
  }
}

function gridLayout(count: number, canvasW: number, canvasH: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const cellW = Math.floor(canvasW / cols)
  const cellH = Math.floor(canvasH / rows)
  return { cols, rows, cellW, cellH }
}

function cellRect(
  index: number,
  count: number,
  canvasW: number,
  canvasH: number,
) {
  const { cols, cellW, cellH } = gridLayout(count, canvasW, canvasH)
  const col = index % cols
  const row = Math.floor(index / cols)
  const isLastCol = col === cols - 1
  const rows = Math.ceil(count / cols)
  const isLastRow = row === rows - 1
  return {
    x: col * cellW,
    y: row * cellH,
    width: isLastCol ? canvasW - col * cellW : cellW,
    height: isLastRow ? canvasH - row * cellH : cellH,
  }
}

function redistributeZones(
  zones: Zone[],
  canvasW: number,
  canvasH: number,
): Zone[] {
  return zones.map((z, i) => ({
    ...z,
    ...cellRect(i, zones.length, canvasW, canvasH),
  }))
}

const EDGE_TOL = 2

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 - EDGE_TOL && b0 < a1 - EDGE_TOL
}

/** Escala zonas com a resolução do canvas, preservando o layout relativo. */
function scaleZonesToCanvas(
  zones: Zone[],
  prevW: number,
  prevH: number,
  canvasW: number,
  canvasH: number,
): Zone[] {
  if (zones.length === 1) {
    const z = zones[0]
    const wasFull =
      z.x === 0 && z.y === 0 && z.width === prevW && z.height === prevH
    if (wasFull) {
      return [{ ...z, width: canvasW, height: canvasH }]
    }
  }

  const scaled = zones.map((z) => ({
    ...z,
    x: Math.round((z.x / prevW) * canvasW),
    y: Math.round((z.y / prevH) * canvasH),
    width: Math.max(1, Math.round((z.width / prevW) * canvasW)),
    height: Math.max(1, Math.round((z.height / prevH) * canvasH)),
  }))

  // Absorve resto de arredondamento nas bordas direitas/inferiores
  return scaled.map((z) => {
    const touchesRight = Math.abs(z.x + z.width - canvasW) <= EDGE_TOL ||
      z.x + z.width > canvasW
    const touchesBottom =
      Math.abs(z.y + z.height - canvasH) <= EDGE_TOL ||
      z.y + z.height > canvasH
    return {
      ...z,
      width: touchesRight ? Math.max(1, canvasW - z.x) : z.width,
      height: touchesBottom ? Math.max(1, canvasH - z.y) : z.height,
    }
  })
}

/**
 * Ao mudar largura/altura de uma zona, recalcula as zonas adjacentes
 * para manter o preenchimento da tela (split horizontal/vertical).
 */
function rebalanceAdjacentZones(
  zones: Zone[],
  index: number,
  patch: Partial<Zone>,
  canvasW: number,
  canvasH: number,
): Zone[] {
  const old = zones[index]
  const next = zones.map((z, i) => (i === index ? { ...z, ...patch } : { ...z }))
  const edited = next[index]

  edited.x = Math.max(0, Math.min(edited.x, canvasW - 1))
  edited.y = Math.max(0, Math.min(edited.y, canvasH - 1))
  edited.width = Math.max(1, Math.min(edited.width, canvasW - edited.x))
  edited.height = Math.max(1, Math.min(edited.height, canvasH - edited.y))

  if (patch.width !== undefined) {
    const oldRight = old.x + old.width
    const newRight = edited.x + edited.width
    let adjustedRight = false

    for (let i = 0; i < next.length; i++) {
      if (i === index) continue
      const o = next[i]
      const sameRow = rangesOverlap(
        old.y,
        old.y + old.height,
        o.y,
        o.y + o.height,
      )
      if (!sameRow) continue

      // Vizinha à direita
      if (Math.abs(o.x - oldRight) <= EDGE_TOL) {
        const rightEdge = o.x + o.width
        o.x = newRight
        o.width = Math.max(1, rightEdge - newRight)
        adjustedRight = true
      }

      // Vizinha à esquerda (quando a zona editada está ancorada à direita)
      if (Math.abs(o.x + o.width - old.x) <= EDGE_TOL) {
        if (patch.x !== undefined) {
          o.width = Math.max(1, edited.x - o.x)
        } else if (!adjustedRight && Math.abs(oldRight - canvasW) <= EDGE_TOL) {
          // Editou a zona da direita só pela largura: ancora na borda e empurra a esquerda
          const anchoredWidth = Math.max(1, Math.min(edited.width, canvasW - 1))
          edited.width = anchoredWidth
          edited.x = canvasW - anchoredWidth
          o.width = Math.max(1, edited.x - o.x)
        }
      }
    }
  }

  if (patch.height !== undefined) {
    const oldBottom = old.y + old.height
    const newBottom = edited.y + edited.height
    let adjustedBelow = false

    for (let i = 0; i < next.length; i++) {
      if (i === index) continue
      const o = next[i]
      const sameCol = rangesOverlap(
        old.x,
        old.x + old.width,
        o.x,
        o.x + o.width,
      )
      if (!sameCol) continue

      // Vizinha abaixo
      if (Math.abs(o.y - oldBottom) <= EDGE_TOL) {
        const bottomEdge = o.y + o.height
        o.y = newBottom
        o.height = Math.max(1, bottomEdge - newBottom)
        adjustedBelow = true
      }

      // Vizinha acima (zona editada ancorada embaixo)
      if (Math.abs(o.y + o.height - old.y) <= EDGE_TOL) {
        if (patch.y !== undefined) {
          o.height = Math.max(1, edited.y - o.y)
        } else if (!adjustedBelow && Math.abs(oldBottom - canvasH) <= EDGE_TOL) {
          const anchoredHeight = Math.max(1, Math.min(edited.height, canvasH - 1))
          edited.height = anchoredHeight
          edited.y = canvasH - anchoredHeight
          o.height = Math.max(1, edited.y - o.y)
        }
      }
    }
  }

  return next
}

function presetZones(
  preset: "full" | "split-h" | "split-v" | "pip" | "condo-split",
  w: number,
  h: number,
): Zone[] {
  if (preset === "condo-split") {
    const topH = Math.floor(h * 0.35)
    return [
      {
        key: "condo",
        label: "Condomínio",
        x: 0,
        y: 0,
        width: w,
        height: topH,
        role: "condo",
      },
      {
        key: "ads",
        label: "Anúncios LEDE",
        x: 0,
        y: topH,
        width: w,
        height: h - topH,
        role: "ads",
      },
    ]
  }
  if (preset === "split-h") {
    return [
      {
        key: "left",
        label: "Esquerda",
        x: 0,
        y: 0,
        width: Math.floor(w / 2),
        height: h,
        role: "full",
      },
      {
        key: "right",
        label: "Direita",
        x: Math.floor(w / 2),
        y: 0,
        width: Math.ceil(w / 2),
        height: h,
        role: "full",
      },
    ]
  }
  if (preset === "split-v") {
    return [
      {
        key: "top",
        label: "Superior",
        x: 0,
        y: 0,
        width: w,
        height: Math.floor(h / 2),
        role: "full",
      },
      {
        key: "bottom",
        label: "Inferior",
        x: 0,
        y: Math.floor(h / 2),
        width: w,
        height: Math.ceil(h / 2),
        role: "full",
      },
    ]
  }
  if (preset === "pip") {
    const pipW = Math.floor(w * 0.3)
    const pipH = Math.floor(h * 0.3)
    return [
      {
        key: "main",
        label: "Principal",
        x: 0,
        y: 0,
        width: w,
        height: h,
        role: "full",
      },
      {
        key: "pip",
        label: "PiP",
        x: w - pipW - 40,
        y: h - pipH - 40,
        width: pipW,
        height: pipH,
        role: "full",
      },
    ]
  }
  return [fullZone(w, h)]
}

function ZonePreview({
  canvasW,
  canvasH,
  zones,
}: {
  canvasW: number
  canvasH: number
  zones: Zone[]
}) {
  const maxW = 280
  const maxH = 180
  const safeW = Math.max(1, canvasW)
  const safeH = Math.max(1, canvasH)
  const scale = Math.min(maxW / safeW, maxH / safeH)
  const previewW = Math.max(1, Math.round(safeW * scale))
  const previewH = Math.max(1, Math.round(safeH * scale))
  const gap = 3
  const outerRadius = 12
  const zoneRadius = outerRadius

  return (
    <div
      className="relative overflow-hidden border border-border/80 shadow-sm"
      style={{
        width: previewW,
        height: previewH,
        borderRadius: outerRadius,
        background:
          "linear-gradient(145deg, oklch(0.22 0.01 260) 0%, oklch(0.16 0.01 260) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.18)",
      }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          borderRadius: outerRadius,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: `${Math.max(12, 32 * scale)}px ${Math.max(12, 32 * scale)}px`,
        }}
      />
      {zones.map((z, i) => {
        const color = ZONE_PALETTE[i % ZONE_PALETTE.length]
        const rawLeft = z.x * scale
        const rawTop = z.y * scale
        const rawWidth = z.width * scale
        const rawHeight = z.height * scale

        // Mantém o bloco sempre dentro do fundo da miniatura
        const left = Math.max(0, Math.min(rawLeft, previewW))
        const top = Math.max(0, Math.min(rawTop, previewH))
        const width = Math.max(
          0,
          Math.min(rawWidth, previewW - left),
        )
        const height = Math.max(
          0,
          Math.min(rawHeight, previewH - top),
        )

        if (width <= 0 || height <= 0) return null

        return (
          <div
            key={`${z.key}-${i}`}
            className="absolute overflow-hidden"
            style={{
              left: left + gap,
              top: top + gap,
              width: Math.max(4, width - gap * 2),
              height: Math.max(4, height - gap * 2),
              borderRadius: zoneRadius,
              background: color.fill,
              border: `1.5px solid ${color.border}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
            title={`${z.label} (${z.key})`}
          >
            <span
              className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.92)",
                color: color.text,
              }}
            >
              {i + 1}
            </span>
            {width > 64 && height > 36 && (
              <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-[10px] font-medium text-white drop-shadow">
                {z.label || z.key}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LayoutsPage() {
  const [items, setItems] = useState<Layout[]>([])
  const [screenTypes, setScreenTypes] = useState<ScreenType[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Layout | null>(null)
  const [name, setName] = useState("")
  const [screenTypeId, setScreenTypeId] = useState("")
  const [width, setWidth] = useState("1920")
  const [height, setHeight] = useState("1080")
  const [zones, setZones] = useState<Zone[]>([fullZone(1920, 1080)])
  const [preset, setPreset] = useState("full")
  const [search, setSearch] = useState("")

  const canvasW = Number(width) || 1920
  const canvasH = Number(height) || 1080
  const lastCanvasRef = useRef({ w: canvasW, h: canvasH })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.screenType.toLowerCase().includes(q) ||
        (l.screenTypeRef?.name ?? "").toLowerCase().includes(q),
    )
  }, [items, search])

  const zoneKeysValid = useMemo(() => {
    const keys = zones.map((z) => z.key.trim())
    if (keys.some((k) => !k)) return false
    return new Set(keys).size === keys.length
  }, [zones])

  async function load() {
    const [layouts, types] = await Promise.all([
      api<Layout[]>("/layouts"),
      api<ScreenType[]>("/screen-types"),
    ])
    setItems(layouts)
    setScreenTypes(types.filter((t) => t.mode || true))
  }

  useEffect(() => {
    void load()
  }, [])

  // Recalcula as zonas quando largura/altura do canvas mudam
  useEffect(() => {
    if (!open) return
    const prevW = lastCanvasRef.current.w
    const prevH = lastCanvasRef.current.h
    if (prevW === canvasW && prevH === canvasH) return

    setZones((prev) => {
      if (
        preset === "full" ||
        preset === "split-h" ||
        preset === "split-v" ||
        preset === "pip" ||
        preset === "condo-split"
      ) {
        return presetZones(
          preset as "full" | "split-h" | "split-v" | "pip" | "condo-split",
          canvasW,
          canvasH,
        )
      }
      return scaleZonesToCanvas(prev, prevW, prevH, canvasW, canvasH)
    })

    lastCanvasRef.current = { w: canvasW, h: canvasH }
  }, [canvasW, canvasH, open, preset])

  function openCreate() {
    setEditing(null)
    setName("")
    setScreenTypeId(screenTypes[0]?.id ?? "")
    setWidth("1920")
    setHeight("1080")
    setPreset("full")
    setZones([fullZone(1920, 1080)])
    lastCanvasRef.current = { w: 1920, h: 1080 }
    setOpen(true)
  }

  function openEdit(layout: Layout) {
    setEditing(layout)
    setName(layout.name)
    setScreenTypeId(layout.screenTypeId ?? layout.screenTypeRef?.id ?? "")
    setWidth(String(layout.width))
    setHeight(String(layout.height))
    setPreset("custom")
    setZones(
      layout.zonesJson?.length
        ? layout.zonesJson.map((z) => ({
            ...z,
            role: z.role ?? "full",
          }))
        : [fullZone(layout.width, layout.height)],
    )
    lastCanvasRef.current = { w: layout.width, h: layout.height }
    setOpen(true)
  }

  function applyPreset(next: string) {
    setPreset(next)
    if (next === "custom") return
    setZones(
      presetZones(
        next as "full" | "split-h" | "split-v" | "pip" | "condo-split",
        canvasW,
        canvasH,
      ),
    )
  }

  function updateZone(index: number, patch: Partial<Zone>) {
    setPreset("custom")
    const shouldRebalance =
      patch.width !== undefined ||
      patch.height !== undefined ||
      patch.x !== undefined ||
      patch.y !== undefined

    setZones((prev) => {
      if (!shouldRebalance || prev.length < 2) {
        return prev.map((z, i) => (i === index ? { ...z, ...patch } : z))
      }
      return rebalanceAdjacentZones(prev, index, patch, canvasW, canvasH)
    })
  }

  function addZone() {
    setPreset("custom")
    const n = zones.length + 1
    const next: Zone = {
      key: `zone_${n}`,
      label: `Zona ${n}`,
      x: 0,
      y: 0,
      width: canvasW,
      height: canvasH,
      role: "full",
    }
    setZones((prev) =>
      redistributeZones([...prev, next], canvasW, canvasH),
    )
  }

  function removeZone(index: number) {
    if (zones.length <= 1) {
      toast.error("O layout precisa de ao menos uma zona")
      return
    }
    setPreset("custom")
    setZones((prev) =>
      redistributeZones(
        prev.filter((_, i) => i !== index),
        canvasW,
        canvasH,
      ),
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!zoneKeysValid) {
      toast.error("Keys das zonas devem ser únicas e preenchidas")
      return
    }
    const selectedType = screenTypes.find((t) => t.id === screenTypeId)
    const payload = {
      name,
      screenType: selectedType?.slug ?? "tv",
      screenTypeId: screenTypeId || undefined,
      width: canvasW,
      height: canvasH,
      zones: zones.map((z) => ({
        key: z.key.trim(),
        label: z.label.trim() || z.key.trim(),
        x: Number(z.x),
        y: Number(z.y),
        width: Number(z.width),
        height: Number(z.height),
        role: z.role ?? "full",
      })),
    }
    try {
      if (editing) {
        await api(`/layouts/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Layout atualizado")
      } else {
        await api("/layouts", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast.success("Layout criado")
      }
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    }
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Layouts</h2>
          <p className="text-muted-foreground">
            Templates multi-zona por tipo de tela (TV / LED)
          </p>
        </div>
        <Button onClick={openCreate}>Novo layout</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar layout" : "Cadastrar layout"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
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
                  <Label>Tipo de tela</Label>
                  <Select
                    value={screenTypeId}
                    onValueChange={(v) => setScreenTypeId(v ?? "")}
                    items={Object.fromEntries(
                      screenTypes.map((t) => [
                        t.id,
                        `${t.name}${t.mode === "condo_split" ? " (split)" : ""}`,
                      ]),
                    )}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {screenTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.mode === "condo_split" ? " (split)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="width">Largura</Label>
                    <Input
                      id="width"
                      type="number"
                      min={1}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Altura</Label>
                    <Input
                      id="height"
                      type="number"
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preset de zonas</Label>
                  <Select
                    value={preset}
                    onValueChange={(v) => applyPreset(v ?? "custom")}
                    items={{
                      full: "Tela cheia",
                      "split-h": "Dividido horizontal",
                      "split-v": "Dividido vertical",
                      pip: "Principal + PiP",
                      "condo-split": "Elevador (condo + ads)",
                      custom: "Personalizado",
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Tela cheia</SelectItem>
                      <SelectItem value="split-h">Dividido horizontal</SelectItem>
                      <SelectItem value="split-v">Dividido vertical</SelectItem>
                      <SelectItem value="pip">Principal + PiP</SelectItem>
                      <SelectItem value="condo-split">
                        Elevador (condo + ads)
                      </SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Miniatura</Label>
                <div className="flex justify-center rounded-2xl border bg-muted/40 p-4">
                  <ZonePreview
                    canvasW={canvasW}
                    canvasH={canvasH}
                    zones={zones}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {canvasW}×{canvasH} · {zones.length} zona
                  {zones.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>Zonas</Label>
                <p className="text-xs text-muted-foreground">
                  key = id técnico · label = nome amigável · x/y/w/h em pixels
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addZone}>
                <PlusIcon className="size-4" />
                Adicionar zona
              </Button>
            </div>

            <div className="space-y-3">
              {zones.map((z, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{
                          background:
                            ZONE_PALETTE[index % ZONE_PALETTE.length].border,
                        }}
                      >
                        {index + 1}
                      </span>
                      <Badge variant="outline">
                        {z.label || `Zona ${index + 1}`}
                      </Badge>
                      <Badge
                        variant={
                          z.role === "condo"
                            ? "default"
                            : z.role === "ads"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {z.role === "condo"
                          ? "Condo"
                          : z.role === "ads"
                            ? "Ads"
                            : "Full"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeZone(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Key</Label>
                      <Input
                        value={z.key}
                        onChange={(e) =>
                          updateZone(index, { key: e.target.value })
                        }
                        placeholder="main"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input
                        value={z.label}
                        onChange={(e) =>
                          updateZone(index, { label: e.target.value })
                        }
                        placeholder="Principal"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Papel</Label>
                      <Select
                        value={z.role ?? "full"}
                        onValueChange={(v) =>
                          updateZone(index, {
                            role:
                              v === "condo" || v === "ads" ? v : "full",
                          })
                        }
                        items={{
                          full: "Full",
                          condo: "Condomínio",
                          ads: "Anúncios",
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full</SelectItem>
                          <SelectItem value="condo">Condomínio</SelectItem>
                          <SelectItem value="ads">Anúncios</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-2">
                      <Label>X</Label>
                      <Input
                        type="number"
                        value={z.x}
                        onChange={(e) =>
                          updateZone(index, { x: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Y</Label>
                      <Input
                        type="number"
                        value={z.y}
                        onChange={(e) =>
                          updateZone(index, { y: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Largura</Label>
                      <Input
                        type="number"
                        min={1}
                        value={z.width}
                        onChange={(e) =>
                          updateZone(index, {
                            width: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Altura</Label>
                      <Input
                        type="number"
                        min={1}
                        value={z.height}
                        onChange={(e) =>
                          updateZone(index, {
                            height: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="submit" className="w-full" disabled={!zoneKeysValid}>
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar layout ou tipo de tela…"
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum layout"
          description="Crie templates multi-zona para TV ou LED."
          actionLabel="Novo layout"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Templates ({filtered.length})</CardTitle>
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resolução</TableHead>
                    <TableHead>Zonas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {l.screenTypeRef?.name ?? l.screenType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {l.width}×{l.height}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(l.zonesJson ?? []).map((z) => (
                            <Badge key={z.key} variant="secondary">
                              {z.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(l)}
                        >
                          Editar
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
