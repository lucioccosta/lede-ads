"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckIcon,
  CpuIcon,
  GlobeIcon,
  MonitorIcon,
  NetworkIcon,
  PackageIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Registration = {
  id: string;
  code: string;
  status: "pending" | "approved" | "rejected";
  hostname: string | null;
  model: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  externalIp: string | null;
  appVersion: string | null;
  appFlavor: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  rejectReason: string | null;
  lastSeenAt: string;
  createdAt: string;
};

type Option = { id: string; name: string };
type ClientOption = Option & { isCondo?: boolean; kind?: string };

const ORIENTATIONS = [
  { value: "landscape", label: "Paisagem (0°)" },
  { value: "portrait", label: "Retrato (90°)" },
  { value: "landscape_reverse", label: "Paisagem invertida (180°)" },
  { value: "portrait_reverse", label: "Retrato invertido (270°)" },
] as const;
type Orientation = (typeof ORIENTATIONS)[number]["value"];

const TIMEZONES = [
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "America/Belem", label: "Belém (UTC-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC-5)" },
  { value: "UTC", label: "UTC" },
];

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}

function platform(flavor: string | null) {
  if (!flavor) return null;
  return flavor === "linux" ? "Linux" : "Android";
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v ?? "none")}
        items={{
          none: "Nenhum",
          ...Object.fromEntries(options.map((o) => [o.id, o.name])),
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhum</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Boxes que se registraram sozinhos (Edge sem token) e aguardam a LEDE.
 * Aceitar cria a tela e o Edge começa a tocar na próxima consulta (~10 s).
 */
export function DeviceRegistrations({
  clients,
  screenTypes,
  deviceGroups,
  canManage,
  onApproved,
}: {
  clients: ClientOption[];
  screenTypes: Option[];
  deviceGroups: Option[];
  canManage: boolean;
  onApproved: () => void;
}) {
  const [items, setItems] = useState<Registration[]>([]);
  const [showRejected, setShowRejected] = useState(false);
  const [approving, setApproving] = useState<Registration | null>(null);
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("America/Manaus");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [clientId, setClientId] = useState("none");
  const [groupId, setGroupId] = useState("none");
  const [screenTypeId, setScreenTypeId] = useState("none");
  const [reason, setReason] = useState("");

  const load = useCallback(
    () =>
      api<Registration[]>("/device-registrations")
        .then((rows) => setItems(rows.filter((r) => r.status !== "approved")))
        .catch(() => {
          // silencioso: a página principal já mostra erros de carga
        }),
    [],
  );

  useEffect(() => {
    const refresh = () =>
      api<Registration[]>("/device-registrations")
        .then((rows) => setItems(rows.filter((r) => r.status !== "approved")))
        .catch(() => {});
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, []);

  const pending = items.filter((r) => r.status === "pending");
  const rejected = items.filter((r) => r.status === "rejected");
  const visible = showRejected ? items : pending;

  if (pending.length === 0 && rejected.length === 0) return null;

  function openApprove(r: Registration) {
    setApproving(r);
    setName(r.hostname && r.hostname !== "alarm" ? r.hostname : `Tela ${r.code}`);
    setLocation("");
    setTimezone("America/Manaus");
    setOrientation("landscape");
    setClientId("none");
    setGroupId("none");
    setScreenTypeId("none");
  }

  async function onApprove(e: FormEvent) {
    e.preventDefault();
    if (!approving) return;
    if (name.trim().length < 2) {
      toast.error("Nome deve ter ao menos 2 caracteres");
      return;
    }
    setBusy(true);
    try {
      await api(`/device-registrations/${approving.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          locationLabel: location.trim() || null,
          timezone,
          orientation,
          clientId: clientId === "none" ? null : clientId,
          groupId: groupId === "none" ? null : groupId,
          screenTypeId: screenTypeId === "none" ? null : screenTypeId,
        }),
      });
      toast.success(`Tela "${name.trim()}" aceita — o box começa a tocar em instantes`);
      setApproving(null);
      await load();
      onApproved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar");
    } finally {
      setBusy(false);
    }
  }

  async function onReject(e: FormEvent) {
    e.preventDefault();
    if (!rejecting) return;
    setBusy(true);
    try {
      await api(`/device-registrations/${rejecting.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      toast.success(`Registro ${rejecting.code} recusado`);
      setRejecting(null);
      setReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(r: Registration) {
    if (!confirm(`Excluir o registro ${r.code}? O box volta a aparecer como pendente.`)) {
      return;
    }
    try {
      await api(`/device-registrations/${r.id}`, { method: "DELETE" });
      toast.success("Registro excluído");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <Card className="border-orange-500/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Aguardando aprovação
            {pending.length > 0 ? <Badge>{pending.length}</Badge> : null}
          </CardTitle>
          <CardDescription>
            Boxes que se registraram sozinhos. Confira o código exibido na TV
            antes de aceitar.
          </CardDescription>
        </div>
        {rejected.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRejected((v) => !v)}
          >
            {showRejected ? "Ocultar recusados" : `Recusados (${rejected.length})`}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum box pendente.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => (
              <div
                key={r.id}
                className="space-y-3 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-2xl font-bold tracking-widest text-orange-500">
                      {r.code}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {r.hostname ?? "—"} · visto {ago(r.lastSeenAt)}
                    </div>
                  </div>
                  {r.status === "rejected" ? (
                    <Badge variant="destructive">Recusado</Badge>
                  ) : (
                    <Badge variant="secondary">Pendente</Badge>
                  )}
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  {r.model ? (
                    <span className="flex items-center gap-1.5">
                      <CpuIcon className="size-3.5" /> {r.model}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <PackageIcon className="size-3.5" />
                    {r.appVersion ?? "—"}
                    {platform(r.appFlavor) ? ` · ${platform(r.appFlavor)}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <NetworkIcon className="size-3.5" /> LAN {r.ipAddress ?? "—"}
                    {r.macAddress ? ` · ${r.macAddress}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GlobeIcon className="size-3.5" /> WAN {r.externalIp ?? "—"}
                  </span>
                  {r.screenWidth && r.screenHeight ? (
                    <span className="flex items-center gap-1.5">
                      <MonitorIcon className="size-3.5" /> {r.screenWidth}×
                      {r.screenHeight}
                    </span>
                  ) : null}
                  {r.status === "rejected" && r.rejectReason ? (
                    <span className="text-destructive">Motivo: {r.rejectReason}</span>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    {r.status === "pending" ? (
                      <>
                        <Button size="sm" className="flex-1" onClick={() => openApprove(r)}>
                          <CheckIcon /> Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setRejecting(r);
                            setReason("");
                          }}
                        >
                          <XIcon /> Recusar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => void onDelete(r)}
                      >
                        <Trash2Icon /> Excluir registro
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!approving} onOpenChange={(v) => !v && setApproving(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Aceitar box{" "}
              <span className="font-mono text-orange-500">{approving?.code}</span>
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onApprove}>
            <div className="space-y-2">
              <Label htmlFor="reg-name">Nome da tela</Label>
              <Input
                id="reg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-location">Local</Label>
              <Input
                id="reg-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex.: Elevador social — Torre A"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Orientação</Label>
                <Select
                  value={orientation}
                  onValueChange={(v) => {
                    const o = ORIENTATIONS.find((x) => x.value === v);
                    if (o) setOrientation(o.value);
                  }}
                  items={Object.fromEntries(ORIENTATIONS.map((o) => [o.value, o.label]))}
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
                <Label>Timezone</Label>
                <Select
                  value={timezone}
                  onValueChange={(v) => setTimezone(v ?? "America/Manaus")}
                  items={Object.fromEntries(TIMEZONES.map((t) => [t.value, t.label]))}
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
            </div>
            <OptionSelect
              label="Tipo de tela"
              value={screenTypeId}
              onChange={setScreenTypeId}
              options={screenTypes}
            />
            <OptionSelect
              label="Condomínio (cliente)"
              value={clientId}
              onChange={setClientId}
              options={clients}
            />
            <OptionSelect
              label="Grupo de telas"
              value={groupId}
              onChange={setGroupId}
              options={deviceGroups}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setApproving(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "Aceitando…" : "Aceitar e criar tela"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Recusar box{" "}
              <span className="font-mono text-orange-500">{rejecting?.code}</span>
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onReject}>
            <div className="space-y-2">
              <Label htmlFor="reg-reason">Motivo (aparece na TV)</Label>
              <Input
                id="reg-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Opcional"
                maxLength={300}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setRejecting(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" className="flex-1" disabled={busy}>
                Recusar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
