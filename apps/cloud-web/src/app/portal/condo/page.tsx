"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getStoredUser, uploadFile } from "@/lib/api";
import { getPortalContext } from "@/lib/workspace";
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
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Media = {
  id: string;
  name: string;
  status: string;
  url: string;
  type: string;
};

type IdealSize = { label: string; width: number; height: number };

type NoticeItem = {
  id: string;
  mediaId: string;
  durationMs: number;
  sortOrder: number;
  media: Media;
};

type Notice = {
  scheduleId: string;
  name: string;
  groupId: string | null;
  deviceId: string | null;
  device: { id: string; name: string; shortCode: string } | null;
  group: { id: string; name: string } | null;
  sceneId: string;
  durationMs: number;
  condoZone: { key: string; width: number; height: number; label: string } | null;
  items: NoticeItem[];
};

type DeviceOpt = {
  id: string;
  name: string;
  shortCode: string;
  groupId: string | null;
  locationLabel: string | null;
};

type GroupOpt = {
  id: string;
  name: string;
  _count: { devices: number };
};

type NoticesPayload = {
  notices: Notice[];
  idealSizes: IdealSize[];
  groups: GroupOpt[];
  devices: DeviceOpt[];
};

type TargetKey = string; // `group:${id}` | `device:${id}`

export default function PortalCondoPage() {
  const [isCondo, setIsCondo] = useState(false);
  const [payload, setPayload] = useState<NoticesPayload | null>(null);
  const [library, setLibrary] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<TargetKey>("");
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [durationSec, setDurationSec] = useState("10");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storyPreviewIdx, setStoryPreviewIdx] = useState(0);

  const reusableMedia = useMemo(
    () =>
      library.filter(
        (m) =>
          m.type === "image" &&
          (m.status === "approved" || m.status === "active"),
      ),
    [library],
  );

  const mediaById = useMemo(
    () => new Map(reusableMedia.map((m) => [m.id, m])),
    [reusableMedia],
  );

  const playlistMedia = useMemo(
    () =>
      playlistIds
        .map((id) => mediaById.get(id))
        .filter((m): m is Media => Boolean(m)),
    [playlistIds, mediaById],
  );

  const currentNotice = useMemo(() => {
    if (!payload || !target) return null;
    if (target.startsWith("group:")) {
      const gid = target.slice(6);
      return (
        payload.notices.find((n) => n.groupId === gid && !n.deviceId) ?? null
      );
    }
    if (target.startsWith("device:")) {
      const did = target.slice(7);
      return payload.notices.find((n) => n.deviceId === did) ?? null;
    }
    return null;
  }, [payload, target]);

  const idealHint = useMemo(() => {
    if (currentNotice?.condoZone?.width && currentNotice.condoZone.height) {
      return [
        {
          label: currentNotice.condoZone.label || "Faixa do condomínio",
          width: currentNotice.condoZone.width,
          height: currentNotice.condoZone.height,
        },
      ];
    }
    return payload?.idealSizes ?? [];
  }, [currentNotice, payload]);

  const aspectStyle = useMemo(() => {
    const first = idealHint[0];
    if (first?.width && first.height) {
      return { aspectRatio: `${first.width} / ${first.height}` };
    }
    return { aspectRatio: "1080 / 650" };
  }, [idealHint]);

  async function load(keepTarget?: TargetKey) {
    setLoading(true);
    try {
      const ctx = getPortalContext(getStoredUser());
      setIsCondo(ctx.isCondo);
      const [data, media] = await Promise.all([
        api<NoticesPayload>("/scenes/condo/notices"),
        api<Media[]>("/media"),
      ]);
      setPayload(data);
      setLibrary(media);

      let nextTarget = keepTarget ?? target;
      if (!nextTarget) {
        const firstGroup = data.groups[0];
        const firstDevice = data.devices[0];
        if (firstGroup) nextTarget = `group:${firstGroup.id}`;
        else if (firstDevice) nextTarget = `device:${firstDevice.id}`;
      }
      setTarget(nextTarget);

      const notice =
        nextTarget.startsWith("group:")
          ? data.notices.find(
              (n) => n.groupId === nextTarget.slice(6) && !n.deviceId,
            )
          : nextTarget.startsWith("device:")
            ? data.notices.find((n) => n.deviceId === nextTarget.slice(7))
            : null;

      setPlaylistIds(notice?.items.map((i) => i.mediaId) ?? []);
      setDurationSec(
        String(Math.round((notice?.durationMs ?? 10000) / 1000) || 10),
      );
      setFile(null);
      setPreviewUrl(null);
      setStoryPreviewIdx(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-advance preview stories
  useEffect(() => {
    if (playlistMedia.length <= 1 || previewUrl) return;
    const ms = (Number(durationSec) || 10) * 1000;
    const t = window.setInterval(() => {
      setStoryPreviewIdx((i) => (i + 1) % playlistMedia.length);
    }, ms);
    return () => window.clearInterval(t);
  }, [playlistMedia.length, durationSec, previewUrl]);

  function selectTarget(next: TargetKey) {
    setTarget(next);
    if (!payload) return;
    const notice = next.startsWith("group:")
      ? payload.notices.find(
          (n) => n.groupId === next.slice(6) && !n.deviceId,
        )
      : payload.notices.find((n) => n.deviceId === next.slice(7));
    setPlaylistIds(notice?.items.map((i) => i.mediaId) ?? []);
    setDurationSec(
      String(Math.round((notice?.durationMs ?? 10000) / 1000) || 10),
    );
    setStoryPreviewIdx(0);
    setFile(null);
  }

  function toggleInPlaylist(mediaId: string) {
    setPlaylistIds((prev) =>
      prev.includes(mediaId)
        ? prev.filter((id) => id !== mediaId)
        : [...prev, mediaId],
    );
    setFile(null);
  }

  function moveItem(index: number, dir: -1 | 1) {
    setPlaylistIds((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  function removeFromPlaylist(mediaId: string) {
    setPlaylistIds((prev) => prev.filter((id) => id !== mediaId));
  }

  async function deleteMedia(media: Media) {
    const ok = window.confirm(
      `Excluir “${media.name}” da biblioteca? Se já foi exibida, será arquivada.`,
    );
    if (!ok) return;
    try {
      await api(`/media/${media.id}`, { method: "DELETE" });
      toast.success("Mídia removida");
      setPlaylistIds((prev) => prev.filter((id) => id !== media.id));
      await load(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!target) {
      toast.error("Selecione o alvo (todas as telas ou uma tela)");
      return;
    }
    const ctx = getPortalContext(getStoredUser());
    if (!ctx.clientId) {
      toast.error("Usuário sem cliente vinculado");
      return;
    }

    setSaving(true);
    try {
      let ids = [...playlistIds];
      if (file) {
        const uploaded = await uploadFile(file);
        const media = await api<Media>("/media", {
          method: "POST",
          body: JSON.stringify({
            clientId: ctx.clientId,
            name: file.name || "Aviso condomínio",
            type: uploaded.type,
            mimeType: uploaded.mimeType,
            url: uploaded.url,
            checksum: uploaded.checksum,
            durationMs: (Number(durationSec) || 10) * 1000,
            fileSize: uploaded.fileSize,
            status: "approved",
          }),
        });
        ids = [...ids, media.id];
      }

      if (ids.length === 0) {
        toast.error("Adicione ao menos uma imagem aos Stories");
        setSaving(false);
        return;
      }

      const body: Record<string, unknown> = {
        mediaIds: ids,
        durationMs: (Number(durationSec) || 10) * 1000,
      };
      if (target.startsWith("group:")) body.groupId = target.slice(6);
      else body.deviceId = target.slice(7);

      await api("/scenes/condo/notices", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      toast.success("Avisos publicados");
      await load(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Carregando avisos…</div>
    );
  }

  if (!isCondo) {
    return (
      <EmptyState
        title="Disponível só para condomínios"
        description="Sua conta não está marcada como condomínio."
      />
    );
  }

  if (!payload || (payload.groups.length === 0 && payload.devices.length === 0)) {
    return (
      <EmptyState
        title="Nenhuma tela vinculada"
        description="Peça à LEDE para vincular telas ou um grupo ao condomínio."
      />
    );
  }

  const displayUrl =
    previewUrl ??
    playlistMedia[storyPreviewIdx % Math.max(playlistMedia.length, 1)]?.url ??
    null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Meus avisos</h2>
        <p className="text-muted-foreground">
          Monte Stories (várias imagens) e publique em todas as telas ou em uma
          tela específica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publicar aviso</CardTitle>
          <CardDescription>
            {currentNotice
              ? `Agenda: ${currentNotice.name}`
              : "Novo aviso para o alvo selecionado"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Onde publicar</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={target}
              onChange={(e) => selectTarget(e.target.value)}
            >
              {payload.groups.map((g) => (
                <option key={g.id} value={`group:${g.id}`}>
                  Todas as telas — {g.name} ({g._count.devices})
                </option>
              ))}
              {payload.devices.map((d) => (
                <option key={d.id} value={`device:${d.id}`}>
                  Só {d.name}
                  {d.locationLabel ? ` (${d.locationLabel})` : ""} · {d.shortCode}
                </option>
              ))}
            </select>
          </div>

          <div
            className="relative overflow-hidden rounded-xl border bg-muted"
            style={aspectStyle}
          >
            {playlistMedia.length > 0 && !previewUrl ? (
              <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-2 pt-2">
                {playlistMedia.map((_, i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-white/40"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full bg-white transition-all",
                        i < storyPreviewIdx
                          ? "w-full"
                          : i === storyPreviewIdx
                            ? "w-1/2 animate-pulse"
                            : "w-0",
                      )}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt="Preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-muted-foreground">
                Sem imagens na playlist
              </div>
            )}
            {playlistMedia.length > 1 ? (
              <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                {storyPreviewIdx + 1}/{playlistMedia.length}
              </div>
            ) : null}
          </div>

          <form className="space-y-6" onSubmit={onSave}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="duration">Duração de cada story (s)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={durationSec}
                  onChange={(e) => setDurationSec(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground">
                  Barrinhas no topo da tela marcam o tempo de cada imagem.
                </p>
              </div>
            </div>

            {playlistMedia.length > 0 ? (
              <div className="space-y-2">
                <Label>Playlist Stories ({playlistMedia.length})</Label>
                <ul className="space-y-2">
                  {playlistMedia.map((m, i) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {m.name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={i === 0}
                        onClick={() => moveItem(i, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={i === playlistMedia.length - 1}
                        onClick={() => moveItem(i, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromPlaylist(m.id)}
                      >
                        Tirar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Biblioteca</Label>
                <span className="text-xs text-muted-foreground">
                  toque para incluir/remover dos Stories
                </span>
              </div>
              {idealHint.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Tamanho ideal:{" "}
                  {idealHint
                    .map(
                      (s) =>
                        `${s.label}: ${s.width}×${s.height} px`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
              {reusableMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma imagem ainda. Envie uma abaixo.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {reusableMedia.map((m) => {
                    const inPlaylist = playlistIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "relative overflow-hidden rounded-lg border bg-muted",
                          inPlaylist && "ring-2 ring-primary border-primary",
                        )}
                      >
                        <button
                          type="button"
                          className="block w-full"
                          onClick={() => toggleInPlaylist(m.id)}
                          title={m.name}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.url}
                            alt={m.name}
                            className="w-full object-cover"
                            style={aspectStyle}
                          />
                        </button>
                        {inPlaylist ? (
                          <Badge
                            className="absolute left-1 top-1 text-[10px]"
                            variant="secondary"
                          >
                            Story
                          </Badge>
                        ) : null}
                        <button
                          type="button"
                          className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                          onClick={() => void deleteMedia(m)}
                        >
                          Excluir
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="aviso">Ou envie uma nova imagem</Label>
              <Input
                id="aviso"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
              {idealHint[0] ? (
                <p className="text-xs text-muted-foreground">
                  Preferência: {idealHint[0].width}×{idealHint[0].height} px
                  (faixa do condomínio no layout).
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={saving || (playlistIds.length === 0 && !file)}
            >
              {saving ? "Publicando…" : "Publicar Stories"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
