"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ListToolbar } from "@/components/list-toolbar";
import { toast } from "sonner";
import { LayoutTemplateIcon } from "lucide-react";

type ScreenType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mode: "standard" | "condo_split";
  active: boolean;
  _count?: { layouts: number; devices: number; clients: number };
};

export default function ScreenTypesPage() {
  const [items, setItems] = useState<ScreenType[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScreenType | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"standard" | "condo_split">("standard");
  const [search, setSearch] = useState("");

  async function load() {
    setItems(await api<ScreenType[]>("/screen-types"));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [items, search]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setDescription("");
    setMode("standard");
    setOpen(true);
  }

  function openEdit(item: ScreenType) {
    setEditing(item);
    setName(item.name);
    setSlug(item.slug);
    setDescription(item.description ?? "");
    setMode(item.mode);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
      description: description || undefined,
      mode,
    };
    try {
      if (editing) {
        await api(`/screen-types/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Tipo atualizado");
      } else {
        await api("/screen-types", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Tipo criado");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Tipos de tela
          </h2>
          <p className="text-muted-foreground">
            Padrão ou elevador com área do condomínio + anúncios
          </p>
        </div>
        <Button onClick={openCreate}>Novo tipo</Button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar tipo…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar tipo" : "Cadastrar tipo de tela"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editing) {
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                  }
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={mode}
                onValueChange={(v) =>
                  setMode(v === "condo_split" ? "condo_split" : "standard")
                }
                items={{
                  standard: "Padrão (tela inteira)",
                  condo_split: "Elevador (condo + ads)",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Padrão (tela inteira)</SelectItem>
                  <SelectItem value="condo_split">
                    Elevador (condo + ads)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplateIcon className="size-10" />}
          title="Nenhum tipo de tela"
          description="Crie tipos como TV padrão ou Elevador Split antes de vincular layouts e devices."
          actionLabel="Novo tipo"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Lista ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum resultado"
                description="Ajuste a busca."
                actionLabel="Limpar"
                onAction={() => setSearch("")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.slug}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.mode === "condo_split" ? "default" : "secondary"
                          }
                        >
                          {t.mode === "condo_split"
                            ? "Condo + Ads"
                            : "Padrão"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t._count?.layouts ?? 0} layouts ·{" "}
                        {t._count?.devices ?? 0} telas ·{" "}
                        {t._count?.clients ?? 0} clientes
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(t)}
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
  );
}
