"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Stats = {
  clients: number
  devicesOnline: number
  devicesTotal: number
  pendingMedia: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function load() {
      const [clients, devices, media] = await Promise.all([
        api<unknown[]>("/clients"),
        api<Array<{ computedStatus: string }>>("/devices/monitoring"),
        api<Array<{ status: string }>>("/media"),
      ])
      setStats({
        clients: clients.length,
        devicesTotal: devices.length,
        devicesOnline: devices.filter((d) => d.computedStatus === "online")
          .length,
        pendingMedia: media.filter((m) => m.status === "pending_approval")
          .length,
      })
    }
    void load()
  }, [])

  return (
    <div className="space-y-6 py-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Visão geral</h2>
        <p className="text-muted-foreground">
          Operação da rede de telas LEDE
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Clientes</CardDescription>
            <CardTitle className="text-3xl">{stats?.clients ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Telas online</CardDescription>
            <CardTitle className="text-3xl">
              {stats ? `${stats.devicesOnline}/${stats.devicesTotal}` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Mídias pendentes</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.pendingMedia ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardContent className="px-0 pt-2">
              <Badge>Cloud operacional</Badge>
            </CardContent>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
