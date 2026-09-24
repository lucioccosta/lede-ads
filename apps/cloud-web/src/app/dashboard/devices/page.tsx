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
import {
  Building2Icon,
  ClockIcon,
  CpuIcon,
  DownloadIcon,
  HardDriveIcon,
  HeartPulseIcon,
  LayersIcon,
  LayoutTemplateIcon,
  MemoryStickIcon,
  MonitorIcon,
  PackageIcon,
  RotateCwSquareIcon,
  TimerIcon,
  NetworkIcon,
  WifiIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Device = {
  id: string;
  name: string;
  shortCode?: string | null;
  locationLabel: string | null;
  pairingCode: string | null;
  timezone: string;
  orientation:
    | "landscape"
    | "portrait"
    | "landscape_reverse"
    | "portrait_reverse";
  clientId: string | null;
  groupId?: string | null;
  screenTypeId: string | null;
  client?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
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
  appVersionCode?: number | null;
  appFlavor?: string | null;
  updateAvailable?: boolean;
  latestEdgeVersion?: string | null;
  latestEdgeAsset?: string | null;
  freeStorageBytes?: string | null;
  totalStorageBytes?: string | null;
  ramAvailBytes?: string | null;
  ramTotalBytes?: string | null;
  cpuUsagePercent?: number | null;
  uptimeMs?: string | null;
  ipAddress?: string | null;
  externalIp?: string | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
};

type Client = { id: string; name: string };
type ScreenType = {
  id: string;
  name: string;
  slug: string;
  mode: string;
};
type DeviceGroup = { id: string; name: string };

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

const timezoneLabel = Object.fromEntries(
  TIMEZONES.map((t) => [t.value, t.label]),
) as Record<string, string>;

const commandLabel: Record<string, string> = {
  resync: "Re-sync",
  screenshot: "Screenshot",
  reboot: "Reiniciar",
  update: "Atualizar app",
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  done: "Concluído",
  failed: "Falhou",
};

function formatBytes(value?: string | null) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(value?: string | null) {
  if (value == null || value === "") return "—";
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function parseBytes(value?: string | null) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function usedPct(freeOrAvail?: string | null, total?: string | null) {
  const avail = parseBytes(freeOrAvail);
  const tot = parseBytes(total);
  if (avail == null || tot == null || tot <= 0) return null;
  return Math.min(100, Math.max(0, ((tot - avail) / tot) * 100));
}

function barTone(pct: number | null) {
  if (pct == null) return "bg-muted-foreground/40";
  if (pct >= 90) return "bg-destructive";
  if (pct >= 75) return "bg-amber-500";
  return "bg-primary";
}

function MetricCell({
  icon: Icon,
  label,
  value,
  detail,
  pct,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  pct?: number | null;
}) {
  return (
    <div className="min-w-0 space-y-1.5 rounded-lg bg-muted/50 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      {detail ? (
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
      {pct != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-background">
          <div
            className={`h-full rounded-full transition-all ${barTone(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground">{label}: </span>
        <span
          className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export default function DevicesPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [screenTypes, setScreenTypes] = useState<ScreenType[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [namePrefix, setNamePrefix] = useState("");
  const [nameCount, setNameCount] = useState(1);
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("America/Manaus");
  const [orientation, setOrientation] = useState<DeviceOrientation>("landscape");
  const [clientId, setClientId] = useState("none");
  const [screenTypeId, setScreenTypeId] = useState("none");
  const [createdDevices, setCreatedDevices] = useState<
    { name: string; pairingCode: string | null }[]
  >([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchTz, setBatchTz] = useState("America/Manaus");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [editing, setEditing] = useState<Device | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/Manaus");
  const [editOrientation, setEditOrientation] =
    useState<DeviceOrientation>("landscape");
  const [editClientId, setEditClientId] = useState("none");
  const [editGroupId, setEditGroupId] = useState("none");
  const [editScreenTypeId, setEditScreenTypeId] = useState("none");
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    const [devices, clientList, types, groups] = await Promise.all([
      api<Device[]>("/devices/monitoring"),
      api<Client[]>("/clients"),
      api<ScreenType[]>("/screen-types"),
      api<DeviceGroup[]>("/device-groups"),
    ]);
    setItems(devices);
    setClients(clientList);
    setScreenTypes(types);
    setDeviceGroups(groups);
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
        (d.shortCode ?? "").toLowerCase().includes(q) ||
        (d.locationLabel ?? "").toLowerCase().includes(q) ||
        (d.pairingCode ?? "").toLowerCase().includes(q) ||
        (d.ipAddress ?? "").toLowerCase().includes(q) ||
        (d.externalIp ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter]);

  const detail = useMemo(
    () => (detailId ? items.find((d) => d.id === detailId) ?? null : null),
    [items, detailId],
  );

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? filtered.map((d) => d.id) : []);
  }

  function resetCreateForm() {
    setNamePrefix("");
    setNameCount(1);
    setLocation("");
    setTimezone("America/Manaus");
    setOrientation("landscape");
    setClientId("none");
    setScreenTypeId("none");
  }

  function buildNames(prefix: string, count: number) {
    const base = prefix.trim();
    const n = Math.min(Math.max(Math.floor(count), 1), 200);
    if (base.length < 1) return [];
    return Array.from({ length: n }, (_, i) => `${base} ${i + 1}`);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const names = buildNames(namePrefix, nameCount);
    if (names.length === 0) {
      toast.error("Informe um prefixo para as telas");
      return;
    }
    if (namePrefix.trim().length < 1) {
      toast.error("Prefixo inválido");
      return;
    }
    setCreating(true);
    try {
      const payload = {
        names,
        locationLabel: location || undefined,
        timezone,
        orientation,
        clientId: clientId === "none" ? null : clientId,
        screenTypeId: screenTypeId === "none" ? null : screenTypeId,
      };
      const devices = await api<
        { name: string; pairingCode: string | null }[]
      >("/devices/pairing/batch", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreatedDevices(devices);
      toast.success(
        devices.length === 1
          ? "Tela criada — use o código no Edge"
          : `${devices.length} telas criadas`,
      );
      resetCreateForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(device: Device) {
    setEditing(device);
    setEditName(device.name);
    setEditLocation(device.locationLabel ?? "");
    setEditTimezone(device.timezone || "America/Manaus");
    setEditOrientation(device.orientation || "landscape");
    setEditClientId(device.clientId || "none");
    setEditGroupId(device.groupId || "none");
    setEditScreenTypeId(device.screenTypeId || "none");
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const trimmed = editName.trim();
    if (trimmed.length < 2) {
      toast.error("Nome deve ter ao menos 2 caracteres");
      return;
    }
    setSavingEdit(true);
    try {
      await api(`/devices/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmed,
          locationLabel: editLocation.trim() || null,
          timezone: editTimezone,
          orientation: editOrientation,
          clientId: editClientId === "none" ? null : editClientId,
          groupId: editGroupId === "none" ? null : editGroupId,
          screenTypeId: editScreenTypeId === "none" ? null : editScreenTypeId,
        }),
      });
      toast.success("Tela atualizada");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingEdit(false);
    }
  }

  async function sendCommand(
    deviceId: string,
    type: "resync" | "reboot" | "screenshot" | "update",
  ) {
    if (type === "reboot") {
      const ok = window.confirm(
        "Reiniciar este device? Requer Device Owner no Edge.",
      );
      if (!ok) return;
    }
    if (type === "update") {
      const ok = window.confirm(
        "Atualizar o app Edge a partir da release do GitHub? Idealmente com Device Owner para instalação silenciosa.",
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
            : type === "update"
              ? "Atualização enfileirada — o Edge baixa no próximo heartbeat"
              : "Reboot enfileirado",
      );
      if (historyDevice?.id === deviceId) {
        await openHistory(historyDevice);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no comando");
    } finally {
      setBusyId(null);
    }
  }

  async function removeDevice(device: Device) {
    const ok = window.confirm(
      `Remover a tela "${device.name}"? Agendas vinculadas ficarão sem device e o histórico de provas será apagado.`,
    );
    if (!ok) return;
    setBusyId(device.id);
    try {
      await api(`/devices/${device.id}`, { method: "DELETE" });
      toast.success("Tela removida");
      setSelected((prev) => prev.filter((id) => id !== device.id));
      if (detailId === device.id) setDetailId(null);
      if (historyDevice?.id === device.id) {
        setHistoryOpen(false);
        setHistoryDevice(null);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPairing(device: Device) {
    const ok = window.confirm(
      `Re-parear "${device.name}"? O app Edge atual será desconectado e um novo código será gerado.`,
    );
    if (!ok) return;
    setBusyId(device.id);
    try {
      const updated = await api<{
        name: string;
        pairingCode: string | null;
      }>(`/devices/${device.id}/pairing/reset`, { method: "POST" });
      setCreatedDevices([
        {
          name: updated.name,
          pairingCode: updated.pairingCode,
        },
      ]);
      setOpen(true);
      toast.success("Novo código de pairing gerado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao re-parear");
    } finally {
      setBusyId(null);
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
      toast.success(`Timezone aplicado em ${res.updated} tela(s) — Edge sincroniza em ~30s`);
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
            if (!v) setCreatedDevices([]);
          }}
        >
          <Button onClick={() => setOpen(true)}>Novas telas</Button>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {createdDevices.length > 0
                  ? "Códigos de pairing"
                  : "Cadastrar telas"}
              </DialogTitle>
            </DialogHeader>
            {createdDevices.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Digite cada código no app Edge correspondente:
                </p>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                  {createdDevices.map((d) => (
                    <div
                      key={`${d.name}-${d.pairingCode}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <span className="font-medium text-foreground">
                        {d.name}
                      </span>
                      <span className="font-mono text-lg tracking-widest text-foreground">
                        {d.pairingCode ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => {
                    setCreatedDevices([]);
                    setOpen(false);
                  }}
                >
                  Fechar
                </Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={onCreate}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="namePrefix">Prefixo</Label>
                    <Input
                      id="namePrefix"
                      value={namePrefix}
                      onChange={(e) => setNamePrefix(e.target.value)}
                      placeholder="Lobby"
                      required
                      minLength={1}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="nameCount">Quantidade de telas</Label>
                    <Input
                      id="nameCount"
                      type="number"
                      min={1}
                      max={200}
                      value={nameCount}
                      onChange={(e) =>
                        setNameCount(Number(e.target.value) || 1)
                      }
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ex.: prefixo <span className="font-medium">Lobby</span> e
                  quantidade <span className="font-medium">3</span> cria{" "}
                  <span className="font-medium">Lobby 1</span>,{" "}
                  <span className="font-medium">Lobby 2</span>,{" "}
                  <span className="font-medium">Lobby 3</span>.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="location">Local (opcional, para todas)</Label>
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
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Criando…" : "Gerar códigos"}
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
            pairing: "Aguardando pairing",
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="pairing">Aguardando pairing</SelectItem>
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
          actionLabel="Novas telas"
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((d) => {
              const shot = resolveMediaUrl(d.lastScreenshotUrl);
              return (
                <Card
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer overflow-hidden transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setDetailId(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailId(d.id);
                    }
                  }}
                >
                  <div className="relative aspect-video bg-muted">
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={d.lastScreenshotUrl}
                        src={`${shot}?t=${d.lastHeartbeatAt ?? d.id}`}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <MonitorIcon className="size-8 opacity-40" />
                      </div>
                    )}
                    <div
                      className="absolute left-2 top-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.includes(d.id)}
                        onCheckedChange={(v) =>
                          toggleSelected(d.id, v === true)
                        }
                        className="border-background bg-background/80 shadow"
                      />
                    </div>
                    <Badge
                      className="absolute right-2 top-2"
                      variant={
                        d.computedStatus === "online"
                          ? "default"
                          : d.computedStatus === "pairing"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {d.computedStatus === "pairing"
                        ? "pairing"
                        : d.computedStatus}
                    </Badge>
                  </div>
                  <CardHeader className="space-y-1 p-3 pb-1">
                    <CardTitle className="flex items-center gap-1.5 text-sm leading-tight">
                      <span className="truncate">{d.name}</span>
                      {d.shortCode ? (
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                          {d.shortCode}
                        </span>
                      ) : null}
                    </CardTitle>
                    <CardDescription className="truncate text-xs">
                      {d.locationLabel ?? "Sem local"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 p-3 pt-0 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate">
                      <NetworkIcon className="size-3 shrink-0" />
                      <span className="font-mono">
                        {d.ipAddress?.trim() || "LAN —"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <WifiIcon className="size-3 shrink-0" />
                      <span className="font-mono">
                        {d.externalIp?.trim() || "WAN —"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <MonitorIcon className="size-3 shrink-0" />
                      <span>
                        {d.screenWidth != null && d.screenHeight != null
                          ? `${d.screenWidth}×${d.screenHeight}`
                          : "Res. —"}
                      </span>
                    </div>
                    {d.updateAvailable ? (
                      <Badge variant="default" className="text-[10px]">
                        Atualizar → {d.latestEdgeVersion}
                      </Badge>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetailId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{detail.name}</span>
                  {detail.shortCode ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-muted-foreground">
                      {detail.shortCode}
                    </span>
                  ) : null}
                  <Badge
                    variant={
                      detail.computedStatus === "online"
                        ? "default"
                        : detail.computedStatus === "pairing"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {detail.computedStatus === "pairing"
                      ? "Aguardando pairing"
                      : detail.computedStatus}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {resolveMediaUrl(detail.lastScreenshotUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={detail.lastScreenshotUrl}
                    src={`${resolveMediaUrl(detail.lastScreenshotUrl)}?t=${detail.lastHeartbeatAt ?? detail.id}`}
                    alt={`Screenshot ${detail.name}`}
                    className="aspect-video w-full rounded-md border bg-muted object-cover"
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricCell
                    icon={CpuIcon}
                    label="CPU"
                    value={
                      detail.cpuUsagePercent != null
                        ? `${detail.cpuUsagePercent.toFixed(1)}%`
                        : "—"
                    }
                    pct={detail.cpuUsagePercent ?? null}
                  />
                  <MetricCell
                    icon={MemoryStickIcon}
                    label="RAM"
                    value={
                      detail.ramTotalBytes != null
                        ? formatBytes(detail.ramTotalBytes)
                        : "—"
                    }
                    detail={
                      detail.ramAvailBytes != null
                        ? `${formatBytes(detail.ramAvailBytes)} livres`
                        : undefined
                    }
                    pct={usedPct(detail.ramAvailBytes, detail.ramTotalBytes)}
                  />
                  <MetricCell
                    icon={HardDriveIcon}
                    label="Disco"
                    value={
                      detail.totalStorageBytes != null
                        ? formatBytes(detail.totalStorageBytes)
                        : "—"
                    }
                    detail={
                      detail.freeStorageBytes != null
                        ? `${formatBytes(detail.freeStorageBytes)} livres`
                        : undefined
                    }
                    pct={usedPct(
                      detail.freeStorageBytes,
                      detail.totalStorageBytes,
                    )}
                  />
                  <MetricCell
                    icon={TimerIcon}
                    label="Uptime"
                    value={formatUptime(detail.uptimeMs)}
                  />
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <WifiIcon className="size-3.5" />
                    Rede e tela
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <MetaRow
                      icon={NetworkIcon}
                      label="IP local"
                      value={detail.ipAddress?.trim() || "—"}
                      mono
                    />
                    <MetaRow
                      icon={WifiIcon}
                      label="IP externo"
                      value={detail.externalIp?.trim() || "—"}
                      mono
                    />
                    <MetaRow
                      icon={MonitorIcon}
                      label="Resolução"
                      value={
                        detail.screenWidth != null &&
                        detail.screenHeight != null
                          ? `${detail.screenWidth}×${detail.screenHeight}`
                          : "—"
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {detail.pairingCode ? (
                    <MetaRow
                      icon={PackageIcon}
                      label="Pairing"
                      value={detail.pairingCode}
                      mono
                    />
                  ) : null}
                  <MetaRow
                    icon={HeartPulseIcon}
                    label="Heartbeat"
                    value={
                      detail.lastHeartbeatAt
                        ? new Date(detail.lastHeartbeatAt).toLocaleString(
                            "pt-BR",
                          )
                        : "nunca"
                    }
                  />
                  <MetaRow
                    icon={PackageIcon}
                    label="App"
                    value={
                      detail.updateAvailable
                        ? `${detail.appVersion ?? "—"} → ${detail.latestEdgeVersion}`
                        : (detail.appVersion ?? "—")
                    }
                  />
                  {detail.updateAvailable ? (
                    <Badge variant="default">Atualização disponível</Badge>
                  ) : null}
                    <MetaRow
                    icon={ClockIcon}
                    label="Timezone"
                    value={
                      timezoneLabel[detail.timezone] ??
                      detail.timezone ??
                      "—"
                    }
                  />
                  <MetaRow
                    icon={RotateCwSquareIcon}
                    label="Orientação"
                    value={
                      orientationLabel[detail.orientation] ??
                      detail.orientation ??
                      "—"
                    }
                  />
                  <MetaRow
                    icon={LayoutTemplateIcon}
                    label="Tipo"
                    value={detail.screenType?.name ?? "Nenhum"}
                  />
                  <MetaRow
                    icon={Building2Icon}
                    label="Condomínio"
                    value={detail.client?.name ?? "Nenhum"}
                  />
                  <MetaRow
                    icon={LayersIcon}
                    label="Grupo"
                    value={detail.group?.name ?? "Nenhum"}
                  />
                  <MetaRow
                    icon={MonitorIcon}
                    label="Local"
                    value={detail.locationLabel ?? "—"}
                  />
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openEdit(detail);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === detail.id}
                    onClick={() => void sendCommand(detail.id, "resync")}
                  >
                    Re-sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === detail.id}
                    onClick={() => void sendCommand(detail.id, "screenshot")}
                  >
                    Screenshot
                  </Button>
                  {detail.updateAvailable ? (
                    <Button
                      size="sm"
                      disabled={busyId === detail.id}
                      onClick={() => void sendCommand(detail.id, "update")}
                    >
                      <DownloadIcon className="mr-1 size-3.5" />
                      Atualizar
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === detail.id}
                    onClick={() => void sendCommand(detail.id, "reboot")}
                  >
                    Reiniciar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === detail.id}
                    onClick={() => void resetPairing(detail)}
                  >
                    Re-parear
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void openHistory(detail)}
                  >
                    Histórico
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === detail.id}
                    onClick={() => void removeDevice(detail)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar tela</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSaveEdit}>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Local</Label>
              <Input
                id="edit-location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={editTimezone}
                onValueChange={(v) => setEditTimezone(v ?? "America/Manaus")}
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
              <p className="text-xs text-muted-foreground">
                O Edge aplica no STB no próximo heartbeat (~30s), com Device
                Owner.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Orientação</Label>
              <Select
                value={editOrientation}
                onValueChange={(v) => {
                  if (
                    v === "portrait" ||
                    v === "landscape" ||
                    v === "landscape_reverse" ||
                    v === "portrait_reverse"
                  ) {
                    setEditOrientation(v);
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
                value={editScreenTypeId}
                onValueChange={(v) => setEditScreenTypeId(v ?? "none")}
                items={{
                  none: "Nenhum",
                  ...Object.fromEntries(screenTypes.map((t) => [t.id, t.name])),
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
                value={editClientId}
                onValueChange={(v) => setEditClientId(v ?? "none")}
                items={{
                  none: "Nenhum",
                  ...Object.fromEntries(clients.map((c) => [c.id, c.name])),
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
            <div className="space-y-2">
              <Label>Grupo de telas</Label>
              <Select
                value={editGroupId}
                onValueChange={(v) => setEditGroupId(v ?? "none")}
                items={{
                  none: "Nenhum",
                  ...Object.fromEntries(
                    deviceGroups.map((g) => [g.id, g.name]),
                  ),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {deviceGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={savingEdit}>
                {savingEdit ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
