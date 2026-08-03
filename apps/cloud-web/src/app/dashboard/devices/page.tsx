"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, resolveMediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { ListToolbar } from "@/components/list-toolbar";
import { toast } from "sonner";
import { MonitorIcon } from "lucide-react";

type Device = {
  id: string;
  name: string;
  locationLabel: string | null;
  pairingCode: string | null;
  timezone: string;
  orientation:
    | "landscape"
    | "portrait"
    | "landscape_reverse"
    | "portrait_reverse";
  clientId: string | null;
  screenTypeId: string | null;
  client?: { id: string; name: string } | null;
  screenType?: {
    id: string;
    name: string;
    slug: string;
    mode: string;
  } | null;
  computedStatus: string;
  lastHeartbeatAt: string | null;
  lastScreenshotUrl: string | null;
  appVersion: string | null;
};

type Client = { id: string; name: string };
type ScreenType = {
  id: string;
  name: string;
  slug: string;
  mode: string;
};

type DeviceCommand = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
  ackedAt: string | null;
};

const TIMEZONES = [
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "America/Belem", label: "Belém (UTC-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC-5)" },
  { value: "UTC", label: "UTC" },
];

const ORIENTATIONS = [
  { value: "landscape", label: "Paisagem (0°)" },
  { value: "portrait", label: "Retrato (90°)" },
  { value: "landscape_reverse", label: "Paisagem invertida (180°)" },
  { value: "portrait_reverse", label: "Retrato invertido (270°)" },
] as const;

type DeviceOrientation = (typeof ORIENTATIONS)[number]["value"];

const orientationLabel = Object.fromEntries(
  ORIENTATIONS.map((o) => [o.value, o.label]),
) as Record<DeviceOrientation, string>;


const commandLabel: Record<string, string> = {
  resync: "Re-sync",
  screenshot: "Screenshot",
  reboot: "Reiniciar",
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  done: "Concluído",
  failed: "Falhou",
};

export default function DevicesPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [screenTypes, setScreenTypes] = useState<ScreenType[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("America/Manaus");
  const [orientation, setOrientation] = useState<DeviceOrientation>("landscape");
  const [clientId, setClientId] = useState("none");
  const [screenTypeId, setScreenTypeId] = useState("none");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchTz, setBatchTz] = useState("America/Manaus");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);

  async function load() {
    const [devices, clientList, types] = await Promise.all([
      api<Device[]>("/devices/monitoring"),
      api<Client[]>("/clients"),
      api<ScreenType[]>("/screen-types"),
    ]);
    setItems(devices);
    setClients(clientList);
    setScreenTypes(types);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (statusFilter !== "all" && d.computedStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.locationLabel ?? "").toLowerCase().includes(q) ||
        (d.pairingCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter]);

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? filtered.map((d) => d.id) : []);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const device = await api<{ pairingCode: string | null }>(
      "/devices/pairing/create",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          locationLabel: location || undefined,
          timezone,
          orientation,
          clientId: clientId === "none" ? null : clientId,
          screenTypeId: screenTypeId === "none" ? null : screenTypeId,
        }),
      },
    );
    setCreatedCode(device.pairingCode);
    toast.success("Device criado — use o código no Edge");
    setName("");
    setLocation("");
    setTimezone("America/Manaus");
    setOrientation("landscape");
    setClientId("none");
    setScreenTypeId("none");
    await load();
  }

  async function sendCommand(
    deviceId: string,
    type: "resync" | "reboot" | "screenshot",
  ) {
    if (type === "reboot") {
      const ok = window.confirm(
        "Reiniciar este device? Requer Device Owner no Edge.",
      );
      if (!ok) return;
    }
    setBusyId(deviceId);
    try {
      await api(`/devices/${deviceId}/commands`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      toast.success(
        type === "resync"
          ? "Re-sync enfileirado"
          : type === "screenshot"
            ? "Screenshot solicitado"
            : "Reboot enfileirado",
      );
      if (historyDevice?.id === deviceId) {
        await openHistory(historyDevice);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no comando");
    } finally {
      setBusyId(null);
    }
  }

  async function updateTimezone(deviceId: string, next: string) {
    try {
      await api(`/devices/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify({ timezone: next }),
      });
      toast.success("Timezone atualizado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function updateOrientation(deviceId: string, next: DeviceOrientation) {
    try {
      await api(`/devices/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify({ orientation: next }),
      });
      toast.success(
        `${orientationLabel[next]} — peça Re-sync no device`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function patchDevice(
    deviceId: string,
    body: Record<string, unknown>,
    okMsg: string,
  ) {
    try {
      await api(`/devices/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function applyBatchTimezone() {
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma tela");
      return;
    }
    try {
      const res = await api<{ updated: number }>("/devices/timezone/batch", {
        method: "POST",
        body: JSON.stringify({ deviceIds: selected, timezone: batchTz }),
      });
      toast.success(`Timezone aplicado em ${res.updated} tela(s)`);
      setSelected([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no lote");
    }
  }

  async function openHistory(device: Device) {
    setHistoryDevice(device);
    setHistoryOpen(true);
    try {
      setCommands(await api<DeviceCommand[]>(`/devices/${device.id}/commands`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      setCommands([]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Telas / Monitoramento
          </h2>
          <p className="text-muted-foreground">
            Heartbeat, comandos remotos e pairing
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setCreatedCode(null);
          }}
        >
          <Button onClick={() => setOpen(true)}>Novo device</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pairing de tela</DialogTitle>
            </DialogHeader>
            {createdCode ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Digite este código no app Edge:
                </p>
                <p className="text-4xl font-semibold tracking-[0.3em]">
                  {createdCode}
                </p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={onCreate}>
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
                  <Label htmlFor="location">Local</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={timezone}
                    onValueChange={(v) => setTimezone(v ?? "America/Manaus")}
                    items={Object.fromEntries(
                      TIMEZONES.map((t) => [t.value, t.label]),
                    )}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Orientação</Label>
                  <Select
                    value={orientation}
                    onValueChange={(v) => {
                      if (
                        v === "portrait" ||
                        v === "landscape" ||
                        v === "landscape_reverse" ||
                        v === "portrait_reverse"
                      ) {
                        setOrientation(v);
                      }
                    }}
                    items={Object.fromEntries(
                      ORIENTATIONS.map((o) => [o.value, o.label]),
                    )}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIENTATIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de tela</Label>
                  <Select
                    value={screenTypeId}
                    onValueChange={(v) => setScreenTypeId(v ?? "none")}
                    items={{
                      none: "Nenhum",
                      ...Object.fromEntries(
                        screenTypes.map((t) => [t.id, t.name]),
                      ),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {screenTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condomínio (cliente)</Label>
                  <Select
                    value={clientId}
                    onValueChange={(v) => setClientId(v ?? "none")}
                    items={{
                      none: "Nenhum",
                      ...Object.fromEntries(
                        clients.map((c) => [c.id, c.name]),
                      ),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  Gerar código
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome, local ou pairing…"
      >
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "all")}
          items={{
            all: "Todos os status",
            online: "Online",
            offline: "Offline",
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={batchTz}
          onValueChange={(v) => setBatchTz(v ?? "America/Manaus")}
          items={Object.fromEntries(TIMEZONES.map((t) => [t.value, t.label]))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          disabled={selected.length === 0}
          onClick={() => void applyBatchTimezone()}
        >
          Aplicar timezone ({selected.length})
        </Button>
      </ListToolbar>

      {items.length === 0 ? (
        <EmptyState
          icon={<MonitorIcon className="size-10" />}
          title="Nenhuma tela cadastrada"
          description="Crie um device e pareie com o app Edge para monitorar heartbeat e screenshots."
          actionLabel="Novo device"
          onAction={() => setOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum resultado"
          description="Ajuste a busca ou o filtro de status."
          actionLabel="Limpar filtros"
          onAction={() => {
            setSearch("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={
                filtered.length > 0 &&
                filtered.every((d) => selected.includes(d.id))
              }
              onCheckedChange={(v) => toggleAll(v === true)}
            />
            <span>Selecionar visíveis</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => (
              <Card key={d.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selected.includes(d.id)}
                        onCheckedChange={(v) =>
                          toggleSelected(d.id, v === true)
                        }
                        className="mt-1"
                      />
                      <div>
                        <CardTitle>{d.name}</CardTitle>
                        <CardDescription>
                          {d.locationLabel ?? "Sem local"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={
                        d.computedStatus === "online"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {d.computedStatus}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {d.pairingCode && (
                    <p>
                      Pairing:{" "}
                      <span className="font-mono text-foreground">
                        {d.pairingCode}
                      </span>
                    </p>
                  )}
                  <p>
                    Heartbeat:{" "}
                    {d.lastHeartbeatAt
                      ? new Date(d.lastHeartbeatAt).toLocaleString("pt-BR")
                      : "nunca"}
                  </p>
                  <p>App: {d.appVersion ?? "—"}</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Timezone</Label>
                    <Select
                      value={d.timezone || "America/Manaus"}
                      onValueChange={(v) => {
                        if (v) void updateTimezone(d.id, v);
                      }}
                      items={Object.fromEntries(
                        TIMEZONES.map((t) => [t.value, t.label]),
                      )}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Orientação</Label>
                    <Select
                      value={d.orientation || "landscape"}
                      onValueChange={(v) => {
                        if (
                          v === "portrait" ||
                          v === "landscape" ||
                          v === "landscape_reverse" ||
                          v === "portrait_reverse"
                        ) {
                          void updateOrientation(d.id, v);
                        }
                      }}
                      items={Object.fromEntries(
                        ORIENTATIONS.map((o) => [o.value, o.label]),
                      )}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIENTATIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de tela</Label>
                    <Select
                      value={d.screenTypeId || "none"}
                      onValueChange={(v) => {
                        void patchDevice(
                          d.id,
                          { screenTypeId: v === "none" ? null : v },
                          "Tipo de tela atualizado",
                        );
                      }}
                      items={{
                        none: "Nenhum",
                        ...Object.fromEntries(
                          screenTypes.map((t) => [t.id, t.name]),
                        ),
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {screenTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Condomínio</Label>
                    <Select
                      value={d.clientId || "none"}
                      onValueChange={(v) => {
                        void patchDevice(
                          d.id,
                          { clientId: v === "none" ? null : v },
                          "Condomínio atualizado — peça Re-sync",
                        );
                      }}
                      items={{
                        none: "Nenhum",
                        ...Object.fromEntries(
                          clients.map((c) => [c.id, c.name]),
                        ),
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === d.id}
                      onClick={() => void sendCommand(d.id, "resync")}
                    >
                      Re-sync
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === d.id}
                      onClick={() => void sendCommand(d.id, "screenshot")}
                    >
                      Screenshot
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === d.id}
                      onClick={() => void sendCommand(d.id, "reboot")}
                    >
                      Reiniciar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void openHistory(d)}
                    >
                      Histórico
                    </Button>
                  </div>
                  {resolveMediaUrl(d.lastScreenshotUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={d.lastScreenshotUrl}
                      src={`${resolveMediaUrl(d.lastScreenshotUrl)}?t=${d.lastHeartbeatAt ?? d.id}`}
                      alt={`Screenshot ${d.name}`}
                      className="mt-2 aspect-video w-full rounded-md border object-cover bg-muted"
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Comandos — {historyDevice?.name ?? "tela"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {commands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum comando ainda.
              </p>
            ) : (
              commands.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {commandLabel[c.type] ?? c.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString("pt-BR")}
                      {c.ackedAt
                        ? ` · ack ${new Date(c.ackedAt).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                    {c.error ? (
                      <p className="mt-1 text-xs text-destructive">{c.error}</p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      c.status === "done"
                        ? "default"
                        : c.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {statusLabel[c.status] ?? c.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
