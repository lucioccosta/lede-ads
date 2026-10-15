"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getStoredUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ShieldCheckIcon } from "lucide-react";

type TeamRole = "lede_admin" | "lede_operator";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  createdAt: string;
};

const roleLabel: Record<TeamRole, string> = {
  lede_admin: "Administrador",
  lede_operator: "Operador",
};

function emptyForm() {
  return {
    name: "",
    email: "",
    password: "",
    role: "lede_operator" as TeamRole,
    active: true,
  };
}

export default function TeamUsersPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<TeamUser[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [passwordUser, setPasswordUser] = useState<TeamUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    try {
      setItems(await api<TeamUser[]>("/team/users"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    setCurrentUserId(user?.id ?? null);
    const admin = user?.role === "lede_admin";
    setIsAdmin(admin);
    if (admin) void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [items, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(user: TeamUser) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      active: user.active,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/team/users/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            role: form.role,
            active: form.active,
          }),
        });
        toast.success("Usuário atualizado");
      } else {
        await api("/team/users", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          }),
        });
        toast.success("Usuário criado");
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function onSetPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordUser) return;
    if (newPassword.length < 6) {
      toast.error("Senha deve ter ao menos 6 caracteres");
      return;
    }
    try {
      await api(`/team/users/${passwordUser.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });
      toast.success(`Senha atualizada para ${passwordUser.email}`);
      setPasswordUser(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function onDelete(user: TeamUser) {
    const ok = window.confirm(
      `Remover o usuário ${user.email}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    try {
      await api(`/team/users/${user.id}`, { method: "DELETE" });
      toast.success("Usuário removido");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  if (isAdmin === null) return null;

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<ShieldCheckIcon className="size-10" />}
        title="Acesso restrito"
        description="Somente administradores LEDE podem gerenciar a equipe."
      />
    );
  }

  const isSelf = editing?.id === currentUserId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Usuários</h2>
          <p className="text-muted-foreground">
            Equipe LEDE com acesso ao Cloud Ops
          </p>
        </div>
        <Button onClick={openCreate}>Novo usuário</Button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou e-mail…"
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setEditing(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar usuário" : "Novo usuário da equipe"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="team-name">Nome</Label>
              <Input
                id="team-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-email">E-mail</Label>
              <Input
                id="team-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                disabled={!!editing}
                required
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="team-password">Senha</Label>
                <Input
                  id="team-password"
                  type="password"
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    role: v === "lede_admin" ? "lede_admin" : "lede_operator",
                  }))
                }
                items={roleLabel}
                disabled={isSelf}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lede_operator">Operador</SelectItem>
                  <SelectItem value="lede_admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Operadores gerenciam a operação; administradores também
                gerenciam a equipe.
              </p>
            </div>
            {editing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.active ? "active" : "inactive"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, active: v !== "inactive" }))
                  }
                  items={{ active: "Ativo", inactive: "Inativo" }}
                  disabled={isSelf}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!passwordUser}
        onOpenChange={(v) => {
          if (!v) {
            setPasswordUser(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova senha — {passwordUser?.email}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSetPassword}>
            <Input
              type="password"
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" className="w-full">
              Salvar senha
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon className="size-10" />}
          title="Nenhum usuário"
          description="Cadastre administradores e operadores da equipe LEDE."
          actionLabel="Novo usuário"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Equipe ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum resultado"
                description="Tente outro termo de busca."
                actionLabel="Limpar busca"
                onAction={() => setSearch("")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => {
                    const self = u.id === currentUserId;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.name}
                          {self && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (você)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              u.role === "lede_admin" ? "default" : "outline"
                            }
                          >
                            {roleLabel[u.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.active ? "default" : "secondary"}>
                            {u.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(u)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPasswordUser(u);
                                setNewPassword("");
                              }}
                            >
                              Alterar senha
                            </Button>
                            {!self && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void onDelete(u)}
                              >
                                Remover
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
