import { Injectable } from '@nestjs/common';
import { ChangeLogAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(clientId?: string, take = 200) {
    return this.prisma.changeLog.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true, isCondo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  create(input: {
    clientId: string;
    userId?: string | null;
    action: ChangeLogAction;
    summary: string;
    detailsJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.changeLog.create({
      data: {
        clientId: input.clientId,
        userId: input.userId ?? null,
        action: input.action,
        summary: input.summary,
        detailsJson: input.detailsJson,
      },
    });
  }
}
