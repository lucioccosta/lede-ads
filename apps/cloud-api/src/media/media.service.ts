import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMediaDto,
  ReviewMediaDto,
  UpdateMediaDto,
} from './dto/media.dto';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId?: string) {
    const rows = await this.prisma.media.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        client: { select: { id: true, name: true, kind: true } },
        _count: { select: { sceneZones: true, proofs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((m) => ({
      ...m,
      client: {
        ...m.client,
        isCondo: m.client.kind === 'condo',
      },
    }));
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      include: {
        client: true,
        _count: { select: { sceneZones: true, proofs: true } },
      },
    });
    if (!media) throw new NotFoundException('Mídia não encontrada');
    return media;
  }

  create(dto: CreateMediaDto) {
    return this.prisma.media.create({
      data: {
        clientId: dto.clientId,
        name: dto.name,
        type: dto.type,
        mimeType: dto.mimeType,
        url: dto.url,
        checksum: dto.checksum,
        durationMs: dto.durationMs ?? 10000,
        fileSize: dto.fileSize ?? 0,
        status: dto.status ?? MediaStatus.draft,
      },
    });
  }

  async update(id: string, dto: UpdateMediaDto) {
    await this.findOne(id);
    return this.prisma.media.update({ where: { id }, data: dto });
  }

  async submit(id: string) {
    await this.findOne(id);
    return this.prisma.media.update({
      where: { id },
      data: { status: MediaStatus.pending_approval },
    });
  }

  async review(id: string, dto: ReviewMediaDto) {
    await this.findOne(id);
    return this.prisma.media.update({
      where: { id },
      data: {
        status: dto.approved
          ? MediaStatus.approved
          : MediaStatus.rejected,
        rejectionNote: dto.approved ? null : dto.note,
      },
    });
  }

  async remove(id: string) {
    const media = await this.findOne(id);
    if (media._count.proofs > 0) {
      throw new BadRequestException(
        `Mídia com ${media._count.proofs} prova(s) de exibição não pode ser removida`,
      );
    }
    // Desvincula de cenas antes de apagar
    if (media._count.sceneZones > 0) {
      await this.prisma.sceneZone.updateMany({
        where: { mediaId: id },
        data: { mediaId: null },
      });
    }
    return this.prisma.media.delete({ where: { id } });
  }

  async samplingReport(clientId?: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    const proofWhere = {
      startedAt: { gte: fromDate, lte: toDate },
      media: clientId ? { clientId } : undefined,
    };

    const [totalPlays, recent, plans, byDayRows] = await Promise.all([
      this.prisma.proofOfPlay.count({ where: proofWhere }),
      this.prisma.proofOfPlay.findMany({
        where: proofWhere,
        include: {
          media: { select: { id: true, name: true, clientId: true } },
          device: { select: { id: true, name: true } },
          scene: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
      this.prisma.plan.findMany({
        where: {
          active: true,
          ...(clientId ? { clientId } : {}),
        },
      }),
      clientId
        ? this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
            SELECT DATE_TRUNC('day', p."startedAt") AS day, COUNT(*)::int AS count
            FROM "ProofOfPlay" p
            INNER JOIN "Media" m ON m.id = p."mediaId"
            WHERE p."startedAt" >= ${fromDate}
              AND p."startedAt" <= ${toDate}
              AND m."clientId" = ${clientId}
            GROUP BY 1
            ORDER BY 1
          `
        : this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
            SELECT DATE_TRUNC('day', "startedAt") AS day, COUNT(*)::int AS count
            FROM "ProofOfPlay"
            WHERE "startedAt" >= ${fromDate} AND "startedAt" <= ${toDate}
            GROUP BY 1
            ORDER BY 1
          `,
    ]);

    const byDay: Record<string, number> = {};
    for (const row of byDayRows) {
      byDay[new Date(row.day).toISOString().slice(0, 10)] = Number(row.count);
    }

    return {
      from: fromDate,
      to: toDate,
      totalPlays,
      byDay,
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        samplesPerDay: plan.samplesPerDay,
        clientId: plan.clientId,
      })),
      recent,
    };
  }
}
