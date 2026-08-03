import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  role: string;
  clientId: string | null;
  actingAsClient?: boolean;
};

export function isClientRole(role: string) {
  return role.startsWith('client_');
}

/** Usuário de cliente, ou LEDE atuando no espaço de um cliente. */
export function isActingAsClient(user: AuthUser) {
  return isClientRole(user.role) || Boolean(user.actingAsClient);
}

export function requireClientId(user: AuthUser) {
  if (!user.clientId) {
    throw new ForbiddenException('Cliente não vinculado');
  }
  return user.clientId;
}

/** Escopo de cliente: JWT/contexto tem prioridade; LEDE sem contexto usa query. */
export function resolveClientScope(
  user: AuthUser,
  queryClientId?: string,
): string | undefined {
  if (user.clientId) return user.clientId;
  if (isClientRole(user.role)) return undefined;
  return queryClientId;
}

/** Exige que o cliente vinculado seja marcado como condomínio (isCondo). */
export async function requireCondoClient(
  prisma: PrismaService,
  user: AuthUser,
) {
  const clientId = requireClientId(user);
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundException('Cliente não encontrado');
  if (!client.isCondo) {
    throw new ForbiddenException(
      'Apenas clientes marcados como condomínio podem realizar esta ação',
    );
  }
  return client;
}

/** Garante que o layout pertence a um tipo permitido ao condomínio e tem zona condo. */
export async function assertClientCanUseLayout(
  prisma: PrismaService,
  clientId: string,
  layoutId: string,
) {
  const layout = await prisma.layout.findUnique({
    where: { id: layoutId },
    include: { screenTypeRef: true },
  });
  if (!layout) throw new NotFoundException('Layout não encontrado');

  const screenTypeId = layout.screenTypeId;
  if (!screenTypeId) {
    throw new BadRequestException(
      'Layout sem tipo de tela — condomínio só pode usar layouts de tipos permitidos',
    );
  }

  const allowed = await prisma.clientScreenType.findUnique({
    where: {
      clientId_screenTypeId: { clientId, screenTypeId },
    },
  });
  if (!allowed) {
    throw new ForbiddenException(
      'Tipo de tela não liberado para este condomínio',
    );
  }

  const zones = Array.isArray(layout.zonesJson)
    ? (layout.zonesJson as Array<{ key: string; role?: string }>)
    : [];
  const condoKeys = new Set(
    zones.filter((z) => (z.role ?? 'full') === 'condo').map((z) => z.key),
  );
  if (condoKeys.size === 0) {
    throw new BadRequestException('Layout não possui zona de condomínio');
  }

  return { layout, condoKeys };
}

export async function assertClientDevice(
  prisma: PrismaService,
  clientId: string,
  deviceId: string | null | undefined,
) {
  if (!deviceId) return;
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new NotFoundException('Device não encontrado');
  if (device.clientId !== clientId) {
    throw new ForbiddenException('Device não pertence a este condomínio');
  }
  if (!device.screenTypeId) {
    throw new BadRequestException('Device sem tipo de tela');
  }
  const allowed = await prisma.clientScreenType.findUnique({
    where: {
      clientId_screenTypeId: {
        clientId,
        screenTypeId: device.screenTypeId,
      },
    },
  });
  if (!allowed) {
    throw new ForbiddenException(
      'Tipo de tela do device não liberado para este condomínio',
    );
  }
}
