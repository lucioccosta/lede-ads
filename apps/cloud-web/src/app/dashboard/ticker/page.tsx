"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type CatalogEntry = {
  key: string
  label: string
  description: string
}

type TickerConfig = {
  catalog: CatalogEntry[]
  enabledKeys: string[]
}

export default function TickerPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const cfg = await api<TickerConfig>("/ticker/config")
      setCatalog(cfg.catalog)
      setEnabled(new Set(cfg.enabledKeys))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function toggle(key: string, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const keys = catalog
        .map((c) => c.key)
        .filter((k) => enabled.has(k))
      const cfg = await api<TickerConfig>("/ticker/config", {
        method: "PUT",
        body: JSON.stringify({ enabledKeys: keys }),
      })
      setCatalog(cfg.catalog)
      setEnabled(new Set(cfg.enabledKeys))
      toast.success("Tarja atualizada — as telas refletem em até ~5 min")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tarja de índices
          </h1>
          <p className="text-sm text-muted-foreground">
            Escolha quais indicadores aparecem na barra inferior das telas Edge.
            A lista e os ícones vêm do Cloud — ligar/desligar reflete nas telas em
            cerca de 1 minuto, sem atualizar o APK. Se não couberem na largura, o
            app alterna os grupos a cada 10s.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Indicadores</CardTitle>
          <CardDescription>
            Ative ou desative cada item. Ordem de exibição segue a lista abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            catalog.map((item) => {
              const on = enabled.has(item.key)
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="space-y-0.5">
                    <Label htmlFor={`ticker-${item.key}`} className="text-base">
                      {item.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Switch
                    id={`ticker-${item.key}`}
                    checked={on}
                    onCheckedChange={(v) => toggle(item.key, v)}
                  />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
