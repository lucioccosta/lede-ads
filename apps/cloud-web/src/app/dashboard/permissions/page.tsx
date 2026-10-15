"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, getStoredUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { ShieldCheckIcon } from "lucide-react";

type Role = "lede_admin" | "lede_operator" | "client_approver" | "client_viewer";

type CatalogItem = {
  key: string;
  label: string;
  group: string;
  clientAssignable: boolean;
};

type Matrix = {
  catalog: CatalogItem[];
  roles: Record<Role, string[]>;
  defaults: Record<Role, string[]>;
};

const COLUMNS: { role: Role; label: string; hint: string }[] = [
  { role: "lede_admin", label: "Administrador", hint: "Equipe LEDE" },
  { role: "lede_operator", label: "Operador", hint: "Equipe LEDE" },
  { role: "client_approver", label: "Aprovador", hint: "Portal do cliente" },
  { role: "client_viewer", label: "Visualizador", hint: "Portal do cliente" },
];

const EDITABLE: Role[] = ["lede_operator", "client_approver", "client_viewer"];
const CLIENT_ROLES: Role[] = ["client_approver", "client_viewer"];

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export default function PermissionsPage() {
  const [isAdmin] = useState(() => getStoredUser()?.role === "lede_admin");
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [draft, setDraft] = useState<Record<Role, string[]> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api<Matrix>("/permissions");
      setMatrix(data);
      setDraft(data.roles);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of matrix?.catalog ?? []) {
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return [...map.entries()];
  }, [matrix]);

  const dirtyRoles = useMemo(() => {
    if (!matrix || !draft) return [];
    return EDITABLE.filter((r) => !sameSet(matrix.roles[r], draft[r]));
  }, [matrix, draft]);

  function toggle(role: Role, key: string, checked: boolean) {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = prev[role];
      return {
        ...prev,
        [role]: checked
          ? [...new Set([...current, key])]
          : current.filter((k) => k !== key),
      };
    });
  }

  function restoreDefaults() {
    if (!matrix || !draft) return;
    setDraft({
      ...draft,
      ...Object.fromEntries(EDITABLE.map((r) => [r, matrix.defaults[r]])),
    });
  }

  async function save() {
    if (!matrix || !draft) return;
    setSaving(true);
    try {
      for (const role of dirtyRoles) {
        if (sameSet(draft[role], matrix.defaults[role])) {
          await api(`/permissions/${role}`, { method: "DELETE" });
        } else {
          await api(`/permissions/${role}`, {
            method: "PUT",
            body: JSON.stringify({ permissions: draft[role] }),
          });
        }
      }
      toast.success("Permissões atualizadas");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<ShieldCheckIcon className="size-10" />}
        title="Acesso restrito"
        description="Somente administradores LEDE podem configurar permissões."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Permissões</h2>
          <p className="text-muted-foreground">
            O que cada perfil pode fazer no Cloud Ops e no portal
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={restoreDefaults}>
            Restaurar padrões
          </Button>
          <Button
            variant="ghost"
            disabled={dirtyRoles.length === 0}
            onClick={() => matrix && setDraft(matrix.roles)}
          >
            Descartar
          </Button>
          <Button
            disabled={dirtyRoles.length === 0 || saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de permissões</CardTitle>
          <p className="text-sm text-muted-foreground">
            Administrador sempre tem acesso total. Itens marcados com “—” são
            exclusivos da equipe LEDE porque mostram dados de todos os
            clientes. Alterações valem em até 30 segundos; o menu do usuário
            atualiza no próximo carregamento da página.
          </p>
        </CardHeader>
        <CardContent>
          {!matrix || !draft ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permissão</TableHead>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.role} className="text-center">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {c.hint}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(([group, items]) => (
                  <Fragment key={group}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={COLUMNS.length + 1}
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {group}
                      </TableCell>
                    </TableRow>
                    {items.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell>{item.label}</TableCell>
                        {COLUMNS.map(({ role }) => {
                          const blocked =
                            CLIENT_ROLES.includes(role) &&
                            !item.clientAssignable;
                          return (
                            <TableCell key={role} className="text-center">
                              {blocked ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <Checkbox
                                  aria-label={`${item.label} — ${role}`}
                                  checked={
                                    role === "lede_admin" ||
                                    draft[role].includes(item.key)
                                  }
                                  disabled={role === "lede_admin"}
                                  onCheckedChange={(v) =>
                                    toggle(role, item.key, v === true)
                                  }
                                />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
