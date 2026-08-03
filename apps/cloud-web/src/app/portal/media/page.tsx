"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  api,
  getStoredUser,
  isLedeRole,
  refreshAuthUser,
  uploadFile,
} from "@/lib/api";
import { getPortalContext, WORKSPACE_EVENT } from "@/lib/workspace";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { EyeIcon, ImageIcon, VideoIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Media = {
  id: string;
  name: string;
  type: string;
  status: string;
  durationMs: number;
  url: string;
};

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

const typeLabel: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
};

export default function PortalMediaPage() {
  const [items, setItems] = useState<Media[]>([]);
  const [preview, setPreview] = useState<Media | null>(null);
  const [user, setUser] = useState(getStoredUser());
  const [isCondo, setIsCondo] = useState(
    () => getPortalContext(getStoredUser()).isCondo,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState("");
  const [durationSec, setDurationSec] = useState("10");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canUpload =
    user?.role === "client_approver" ||
    (user ? isLedeRole(user.role) : false);
  const canApprove = canUpload;

  async function load() {
    setItems(await api<Media[]>("/media"));
  }

  useEffect(() => {
    const sync = () => {
      setIsCondo(getPortalContext(getStoredUser()).isCondo);
    };
    sync();
    window.addEventListener(WORKSPACE_EVENT, sync);
    return () => window.removeEventListener(WORKSPACE_EVENT, sync);
  }, []);

  useEffect(() => {
    void (async () => {
      const fresh = await refreshAuthUser();
      if (fresh) setUser(fresh);
      setIsCondo(getPortalContext(fresh ?? getStoredUser()).isCondo);
      await load();
    })();
  }, []);

  async function review(id: string, approved: boolean) {
    await api(`/media/${id}/review`, {
      method: "POST",
      body: JSON.stringify({
        approved,
        note: approved ? undefined : "Rejeitado pelo cliente",
      }),
    });
    toast.success(approved ? "Mídia aprovada" : "Mídia rejeitada");
    await load();
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const ctx = getPortalContext(user ?? getStoredUser());
    if (!ctx.clientId) {
      toast.error("Cliente não vinculado");
      return;
    }
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }
    setSaving(true);
    try {
      const uploaded = await uploadFile(file);
      await api("/media", {
        method: "POST",
        body: JSON.stringify({
          clientId: ctx.clientId,
          name: name || uploaded.originalName || file.name,
          type: uploaded.type,
          mimeType: uploaded.mimeType,
          url: uploaded.url,
          checksum: uploaded.checksum,
          durationMs: Number(durationSec) * 1000,
          fileSize: uploaded.fileSize,
          // Condomínio: já vai para a tela; cliente normal: aguarda aprovação
          status: ctx.isCondo ? "approved" : "pending_approval",
        }),
      });
      toast.success(
        ctx.isCondo ? "Mídia enviada" : "Mídia enviada — aguardando aprovação",
      );
      setUploadOpen(false);
      setName("");
      setFile(null);
      setDurationSec("10");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mídias</h2>
          <p className="text-muted-foreground">
            {isCondo
              ? "Envie imagens ou use Meu aviso para trocar o que está na tela"
              : "Envie criativos e aprove ou rejeite os pendentes"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <Button onClick={() => setUploadOpen(true)}>Enviar mídia</Button>
          )}
          {isCondo && (
            <Link
              href="/portal/condo"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Meu aviso
            </Link>
          )}
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCondo ? "Enviar mídia do condomínio" : "Enviar criativo"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onUpload}>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isCondo ? "Ex.: Aviso assembleia" : "Ex.: Campanha março"
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Arquivo (imagem ou vídeo)</Label>
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (segundos)</Label>
              <Input
                type="number"
                min={1}
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
              />
            </div>
            {!isCondo && (
              <p className="text-xs text-muted-foreground">
                Após o envio, a mídia fica pendente até ser aprovada.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Enviando…" : "Enviar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
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
                {preview.type === "video" ? (
                  <video
                    src={preview.url}
                    controls
                    className="aspect-video w-full object-contain"
                    preload="metadata"
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="aspect-video w-full object-contain"
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Suas mídias</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">Preview</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
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
                    {!isCondo &&
                      canApprove &&
                      m.status === "pending_approval" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void review(m.id, true)}
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void review(m.id, false)}
                          >
                            Rejeitar
                          </Button>
                        </>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
