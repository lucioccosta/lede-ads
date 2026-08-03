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

type LayoutZone = {
  key: string;
  label: string;
  role?: string;
};

type Media = {
  id: string;
  name: string;
  status: string;
  url: string;
  type: string;
};

type ActivePayload = {
  schedule: {
    id: string;
    name: string;
    device: { id: string; name: string } | null;
  };
  scene: {
    id: string;
    name: string;
    layoutId: string;
    layout: { name: string; zonesJson: LayoutZone[] };
    zones: Array<{
      zoneKey: string;
      mediaId: string | null;
      media: Media | null;
    }>;
  };
} | null;

export default function PortalCondoPage() {
  const [isCondo, setIsCondo] = useState(false);
  const [active, setActive] = useState<ActivePayload>(null);
  const [library, setLibrary] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  const condoZoneKey = useMemo(() => {
    const zones = active?.scene.layout.zonesJson ?? [];
    return zones.find((z) => (z.role ?? "full") === "condo")?.key ?? "condo";
  }, [active]);

  const currentMedia = useMemo(() => {
    if (!active) return null;
    return (
      active.scene.zones.find((z) => z.zoneKey === condoZoneKey)?.media ?? null
    );
  }, [active, condoZoneKey]);

  const reusableMedia = useMemo(
    () =>
      library.filter(
        (m) =>
          m.type === "image" &&
          (m.status === "approved" || m.status === "active"),
      ),
    [library],
  );

  const selectedFromLibrary = useMemo(
    () => reusableMedia.find((m) => m.id === selectedMediaId) ?? null,
    [reusableMedia, selectedMediaId],
  );

  async function load() {
    setLoading(true);
    try {
      const ctx = getPortalContext(getStoredUser());
      setIsCondo(ctx.isCondo);
      const [data, media] = await Promise.all([
        api<ActivePayload>("/scenes/condo/active"),
        api<Media[]>("/media"),
      ]);
      setActive(data);
      setLibrary(media);
      setFile(null);
      setPreviewUrl(null);
      const currentId =
        data?.scene.zones.find((z) => {
          const zones = data.scene.layout.zonesJson ?? [];
          const key =
            zones.find((lz) => (lz.role ?? "full") === "condo")?.key ?? "condo";
          return z.zoneKey === key;
        })?.mediaId ?? null;
      setSelectedMediaId(currentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      setActive(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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

  function pickExisting(media: Media) {
    setSelectedMediaId(media.id);
    setFile(null);
  }

  function onFileChange(next: File | null) {
    setFile(next);
    if (next) setSelectedMediaId(null);
  }

  async function applyMedia(mediaId: string) {
    if (!active) return;
    await api(`/scenes/${active.scene.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        zones: [{ zoneKey: condoZoneKey, mediaId }],
      }),
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!active) return;

    const ctx = getPortalContext(getStoredUser());
    if (!ctx.clientId) {
      toast.error("Usuário sem cliente vinculado");
      return;
    }

    if (!file && !selectedMediaId) {
      toast.error("Selecione uma mídia da biblioteca ou envie uma nova");
      return;
    }

    if (
      !file &&
      selectedMediaId &&
      selectedMediaId === currentMedia?.id
    ) {
      toast.message("Esta imagem já está ativa na tela");
      return;
    }

    setSaving(true);
    try {
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
            durationMs: 10000,
            fileSize: uploaded.fileSize,
            status: "approved",
          }),
        });
        await applyMedia(media.id);
      } else if (selectedMediaId) {
        await applyMedia(selectedMediaId);
      }

      toast.success("Aviso atualizado na tela");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Carregando aviso…</div>
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

  if (!active) {
    return (
      <EmptyState
        title="Nenhum aviso ativo"
        description="Peça à LEDE para configurar a cena e a agenda do condomínio. Depois você só troca a imagem aqui."
      />
    );
  }

  const displayUrl =
    previewUrl ?? selectedFromLibrary?.url ?? currentMedia?.url ?? null;
  const canSave = Boolean(
    file || (selectedMediaId && selectedMediaId !== currentMedia?.id),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Meu aviso</h2>
        <p className="text-muted-foreground">
          Reutilize uma imagem já enviada ou envie uma nova. Cenas e agendas
          ficam com a LEDE.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{active.scene.name}</CardTitle>
          <CardDescription className="flex flex-wrap gap-2">
            <Badge variant="outline">Agenda: {active.schedule.name}</Badge>
            {active.schedule.device && (
              <Badge variant="secondary">{active.schedule.device.name}</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="overflow-hidden rounded-xl border bg-muted">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt="Aviso atual"
                className="aspect-[1080/672] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[1080/672] items-center justify-center text-sm text-muted-foreground">
                Sem imagem
              </div>
            )}
          </div>

          <form className="space-y-6" onSubmit={onSave}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Biblioteca</Label>
                <span className="text-xs text-muted-foreground">
                  {reusableMedia.length} imagem(ns)
                </span>
              </div>
              {reusableMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma imagem enviada ainda. Use o campo abaixo para a
                  primeira.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {reusableMedia.map((m) => {
                    const isActive = m.id === currentMedia?.id;
                    const isSelected =
                      !file && selectedMediaId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickExisting(m)}
                        className={cn(
                          "relative overflow-hidden rounded-lg border bg-muted text-left transition",
                          isSelected
                            ? "ring-2 ring-primary border-primary"
                            : "hover:border-foreground/30",
                        )}
                        title={m.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.url}
                          alt={m.name}
                          className="aspect-[1080/672] w-full object-cover"
                        />
                        {isActive && (
                          <Badge
                            className="absolute left-1 top-1 text-[10px]"
                            variant="secondary"
                          >
                            Na tela
                          </Badge>
                        )}
                      </button>
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
                onChange={(e) =>
                  onFileChange(e.target.files?.[0] ?? null)
                }
              />
              <p className="text-xs text-muted-foreground">
                Preferência: proporção da faixa do condomínio (ex.: 1080×672).
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={saving || !canSave}
            >
              {saving ? "Atualizando…" : "Atualizar aviso na tela"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
