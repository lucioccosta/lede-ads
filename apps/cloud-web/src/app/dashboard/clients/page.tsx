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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { ListToolbar } from "@/components/list-toolbar";
import { toast } from "sonner";
import { UsersIcon } from "lucide-react";

type Client = {
  id: string;
  name: string;
  email: string | null;
  document: string | null;
  phone: string | null;
  isCondo: boolean;
  active: boolean;
};

type ScreenType = {
  id: string;
  name: string;
  slug: string;
  mode: "standard" | "condo_split";
};

type ClientScreenType = {
  screenTypeId: string;
  screenType: ScreenType;
};

type ClientUser = {
  id: string;
  name: string;
  email: string;
  role: "client_viewer" | "client_approver";
  active: boolean;
};

function emptyForm() {
  return {
    name: "",
    email: "",
    document: "",
    phone: "",
    isCondo: false,
    active: true,
  };
}

function emptyUserForm() {
  return {
    name: "",
    email: "",
    password: "",
    role: "client_approver" as "client_viewer" | "client_approver",
  };
}

export default function ClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [screenTypes, setScreenTypes] = useState<ScreenType[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessClient, setAccessClient] = useState<Client | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersClient, setUsersClient] = useState<Client | null>(null);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [userForm, setUserForm] = useState(emptyUserForm());
  const [passwordUser, setPasswordUser] = useState<ClientUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [clients, types] = await Promise.all([
      api<Client[]>("/clients"),
      api<ScreenType[]>("/screen-types"),
    ]);
    setItems(clients);
    setScreenTypes(types);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.document ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setForm({
      name: client.name,
      email: client.email ?? "",
      document: client.document ?? "",
      phone: client.phone ?? "",
      isCondo: client.isCondo,
      active: client.active,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      document: form.document.trim() || null,
      phone: form.phone.trim() || null,
      isCondo: form.isCondo,
      ...(editing ? { active: form.active } : {}),
    };
    try {
      if (editing) {
        await api(`/clients/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Cliente atualizado");
      } else {
        await api("/clients", {
          method: "POST",
          body: JSON.stringify({
            name: payload.name,
            email: payload.email ?? undefined,
            document: payload.document ?? undefined,
            phone: payload.phone ?? undefined,
            isCondo: payload.isCondo,
          }),
        });
        toast.success("Cliente criado");
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

  async function openAccess(client: Client) {
    setAccessClient(client);
    setAccessOpen(true);
    try {
      const allowed = await api<ClientScreenType[]>(
        `/clients/${client.id}/screen-types`,
      );
      setSelectedTypes(allowed.map((a) => a.screenTypeId));
    } catch {
      setSelectedTypes([]);
    }
  }

  function toggleType(id: string, checked: boolean) {
    setSelectedTypes((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }

  async function saveAccess() {
    if (!accessClient) return;
    try {
      await api(`/clients/${accessClient.id}/screen-types`, {
        method: "PUT",
        body: JSON.stringify({ screenTypeIds: selectedTypes }),
      });
      toast.success("Tipos liberados para o condomínio");
      setAccessOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function openUsers(client: Client) {
    setUsersClient(client);
    setUsersOpen(true);
    setUserForm(emptyUserForm());
    setPasswordUser(null);
    setNewPassword("");
    try {
      setUsers(await api<ClientUser[]>(`/clients/${client.id}/users`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      setUsers([]);
    }
  }

  async function reloadUsers() {
    if (!usersClient) return;
    setUsers(await api<ClientUser[]>(`/clients/${usersClient.id}/users`));
  }

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!usersClient) return;
    try {
      await api(`/clients/${usersClient.id}/users`, {
        method: "POST",
        body: JSON.stringify(userForm),
      });
      toast.success("Usuário do portal criado");
      setUserForm(emptyUserForm());
      await reloadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar");
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
      await api(`/users/${passwordUser.id}/password`, {
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

  async function onDeleteUser(user: ClientUser) {
    const ok = window.confirm(
      `Remover o usuário ${user.email}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      toast.success("Usuário removido");
      if (passwordUser?.id === user.id) {
        setPasswordUser(null);
        setNewPassword("");
      }
      await reloadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Clientes</h2>
          <p className="text-muted-foreground">
            Anunciantes e condomínios da rede
          </p>
        </div>
        <Button onClick={openCreate}>Novo cliente</Button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome, e-mail, documento…"
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
              {editing ? "Editar cliente" : "Cadastrar cliente"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value.toLocaleUpperCase("pt-BR"),
                  }))
                }
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document">Documento (CNPJ/CPF)</Label>
              <Input
                id="document"
                value={form.document}
                onChange={(e) =>
                  setForm((f) => ({ ...f, document: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={form.isCondo}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isCondo: v === true }))
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">É condomínio</p>
                <p className="text-xs text-muted-foreground">
                  Libera portal para enviar mídias e gerenciar cenas/agendas
                  próprias (área exclusiva)
                </p>
              </div>
            </label>
            {editing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.active ? "active" : "inactive"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, active: v !== "inactive" }))
                  }
                  items={{ active: "Ativo", inactive: "Inativo" }}
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

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Tipos de tela — {accessClient?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O condomínio poderá postar na área exclusiva dos devices com estes
            tipos.
          </p>
          <div className="max-h-72 space-y-3 overflow-y-auto py-2">
            {screenTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum tipo cadastrado. Crie em Tipos de tela.
              </p>
            ) : (
              screenTypes.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Checkbox
                    checked={selectedTypes.includes(t.id)}
                    onCheckedChange={(v) => toggleType(t.id, v === true)}
                  />
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.slug} ·{" "}
                      {t.mode === "condo_split" ? "Condo + Ads" : "Padrão"}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
          <Button onClick={() => void saveAccess()} className="w-full">
            Salvar acessos
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={usersOpen}
        onOpenChange={(v) => {
          setUsersOpen(v);
          if (!v) {
            setPasswordUser(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Usuários do portal — {usersClient?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum usuário vinculado. Crie um acesso abaixo.
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <div className="mt-1 flex gap-1">
                        <Badge variant="outline">
                          {u.role === "client_approver"
                            ? "Aprovador"
                            : "Visualizador"}
                        </Badge>
                        <Badge variant={u.active ? "default" : "secondary"}>
                          {u.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void onDeleteUser(u)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {passwordUser && (
              <form
                className="space-y-3 rounded-lg border bg-muted/40 p-3"
                onSubmit={onSetPassword}
              >
                <p className="text-sm font-medium">
                  Nova senha — {passwordUser.email}
                </p>
                <Input
                  type="password"
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Salvar senha
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPasswordUser(null);
                      setNewPassword("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            )}

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Novo usuário do portal</p>
              <form className="space-y-3" onSubmit={onCreateUser}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={userForm.name}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={userForm.email}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input
                      type="password"
                      minLength={6}
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select
                      value={userForm.role}
                      onValueChange={(v) =>
                        setUserForm((f) => ({
                          ...f,
                          role:
                            v === "client_viewer"
                              ? "client_viewer"
                              : "client_approver",
                        }))
                      }
                      items={{
                        client_approver: "Aprovador",
                        client_viewer: "Visualizador",
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client_approver">
                          Aprovador
                        </SelectItem>
                        <SelectItem value="client_viewer">
                          Visualizador
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full" variant="secondary">
                  Criar usuário
                </Button>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-10" />}
          title="Nenhum cliente"
          description="Cadastre anunciantes/condomínios para vincular planos, mídias e cenas."
          actionLabel="Novo cliente"
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
                description="Tente outro termo de busca."
                actionLabel="Limpar busca"
                onAction={() => setSearch("")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant={c.isCondo ? "default" : "outline"}>
                          {c.isCondo ? "Condomínio" : "Anunciante"}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.document ?? "—"}</TableCell>
                      <TableCell>{c.email ?? "—"}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.active ? "default" : "secondary"}>
                          {c.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(c)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openUsers(c)}
                          >
                            Usuários
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openAccess(c)}
                          >
                            Tipos de tela
                          </Button>
                        </div>
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
