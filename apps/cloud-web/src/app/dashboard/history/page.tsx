"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { HistoryIcon } from "lucide-react";

type Client = {
  id: string;
  name: string;
};

type ChangeLog = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
  client: { id: string; name: string; isCondo: boolean } | null;
  detailsJson: {
    toMediaUrl?: string | null;
    fromMediaUrl?: string | null;
    mediaUrl?: string | null;
  } | null;
};

const actionLabel: Record<string, string> = {
  condo_media_changed: "Aviso na tela",
  media_uploaded: "Upload",
  media_reviewed: "Revisão",
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function DashboardHistoryPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("all");
  const [items, setItems] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<Client[]>("/clients")
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const qs =
          clientFilter !== "all"
            ? `?clientId=${encodeURIComponent(clientFilter)}`
            : "";
        setItems(await api<ChangeLog[]>(`/history${qs}`));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Histórico</h2>
          <p className="text-muted-foreground">
            Alterações feitas pelos clientes no portal (aviso, uploads e
            revisões)
          </p>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <span className="text-xs text-muted-foreground">Cliente</span>
          <Select
            value={clientFilter}
            onValueChange={(v) => setClientFilter(v ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="size-10" />}
          title="Nenhuma alteração registrada"
          description="Quando um cliente atualizar o aviso ou enviar mídias, o registro aparece aqui."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Modificações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Preview</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const thumb =
                    item.detailsJson?.toMediaUrl ??
                    item.detailsJson?.mediaUrl ??
                    item.detailsJson?.fromMediaUrl ??
                    null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="size-12 rounded-md border object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                            <HistoryIcon className="size-4" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatWhen(item.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.client?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {actionLabel[item.action] ?? item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {item.summary}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.user?.name ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
