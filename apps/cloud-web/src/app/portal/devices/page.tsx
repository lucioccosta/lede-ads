"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { MonitorIcon } from "lucide-react";

type Device = {
  id: string;
  name: string;
  locationLabel: string | null;
  orientation: string;
  computedStatus: string;
  lastHeartbeatAt: string | null;
  screenType?: { id: string; name: string; mode: string } | null;
};

export default function PortalDevicesPage() {
  const [items, setItems] = useState<Device[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await api<Device[]>("/devices/mine"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Minhas telas</h2>
        <p className="text-muted-foreground">
          Telas do condomínio onde você pode publicar na área exclusiva
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<MonitorIcon className="size-10" />}
          title="Nenhuma tela vinculada"
          description="Peça à LEDE para vincular devices ao seu condomínio e liberar os tipos de tela."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{d.name}</CardTitle>
                    <CardDescription>
                      {d.locationLabel ?? "Sem local"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      d.computedStatus === "online" ? "default" : "destructive"
                    }
                  >
                    {d.computedStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Tipo:{" "}
                  <span className="text-foreground">
                    {d.screenType?.name ?? "—"}
                  </span>
                </p>
                <p>
                  Orientação:{" "}
                  <span className="text-foreground">
                    {d.orientation === "portrait"
                      ? "Retrato (90°)"
                      : d.orientation === "landscape_reverse"
                        ? "Paisagem invertida (180°)"
                        : d.orientation === "portrait_reverse"
                          ? "Retrato invertido (270°)"
                          : "Paisagem (0°)"}
                  </span>
                </p>
                <p>
                  Heartbeat:{" "}
                  {d.lastHeartbeatAt
                    ? new Date(d.lastHeartbeatAt).toLocaleString("pt-BR")
                    : "nunca"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
