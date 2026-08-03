"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStoredUser } from "@/lib/api";
import {
  getPortalContext,
  WORKSPACE_EVENT,
} from "@/lib/workspace";

export default function PortalHome() {
  const [ctx, setCtx] = useState(() => getPortalContext(getStoredUser()));

  useEffect(() => {
    const sync = () => setCtx(getPortalContext(getStoredUser()));
    sync();
    window.addEventListener(WORKSPACE_EVENT, sync);
    return () => window.removeEventListener(WORKSPACE_EVENT, sync);
  }, []);

  const isCondo = ctx.isCondo;
  const title = ctx.name
    ? `Portal — ${ctx.name}`
    : "Portal do Cliente";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">
          {isCondo
            ? "Troque o aviso na tela e acompanhe amostragem"
            : "Envie e aprove mídias e acompanhe a amostragem nas telas LEDE"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {isCondo && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Meu aviso</CardTitle>
                <CardDescription>
                  Troque a imagem da área do condomínio
                </CardDescription>
                <Link
                  href="/portal/condo"
                  className={cn(buttonVariants(), "mt-4 w-fit")}
                >
                  Atualizar aviso
                </Link>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Minhas telas</CardTitle>
                <CardDescription>Devices do condomínio</CardDescription>
                <Link
                  href="/portal/devices"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "mt-4 w-fit",
                  )}
                >
                  Ver telas
                </Link>
              </CardHeader>
            </Card>
          </>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Mídias</CardTitle>
            <CardDescription>
              {isCondo
                ? "Imagens enviadas para o aviso"
                : "Enviar, aprovar ou rejeitar criativos"}
            </CardDescription>
            <Link
              href="/portal/media"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "mt-4 w-fit",
              )}
            >
              Abrir mídias
            </Link>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Quem alterou o aviso e quando</CardDescription>
            <Link
              href="/portal/history"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "mt-4 w-fit",
              )}
            >
              Ver histórico
            </Link>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Amostragem</CardTitle>
            <CardDescription>
              Relatório de exibições realizadas
            </CardDescription>
            <Link
              href="/portal/reports"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "mt-4 w-fit",
              )}
            >
              Ver relatório
            </Link>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
