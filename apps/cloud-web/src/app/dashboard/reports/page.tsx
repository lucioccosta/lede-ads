"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
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

type Report = {
  totalPlays: number;
  byDay: Record<string, number>;
  plans: Array<{ name: string; samplesPerDay: number }>;
  recent: Array<{
    id: string;
    startedAt: string;
    media: { name: string };
    device: { name: string };
  }>;
};

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    void api<Report>("/reports/sampling").then(setReport);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Amostragem</h2>
        <p className="text-muted-foreground">
          Planejado vs realizado (proof-of-play)
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Exibições (7 dias)</CardDescription>
            <CardTitle className="text-3xl">
              {report?.totalPlays ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        {(report?.plans ?? []).map((p) => (
          <Card key={p.name}>
            <CardHeader>
              <CardDescription>{p.name}</CardDescription>
              <CardTitle className="text-3xl">{p.samplesPerDay}/dia</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimas exibições</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Mídia</TableHead>
                <TableHead>Tela</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report?.recent ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {new Date(r.startedAt).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>{r.media.name}</TableCell>
                  <TableCell>{r.device.name}</TableCell>
                </TableRow>
              ))}
              {!report?.recent?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Nenhuma exibição registrada ainda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
