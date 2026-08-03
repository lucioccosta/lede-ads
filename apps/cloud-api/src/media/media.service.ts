import { Injectable, NotFoundException } from '@nestjs/common';
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

  findAll(clientId?: string) {
    return this.prisma.media.findMany({
      where: clientId ? { clientId } : undefined,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      include: { client: true },
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

  async samplingReport(clientId?: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    const proofs = await this.prisma.proofOfPlay.findMany({
      where: {
        startedAt: { gte: fromDate, lte: toDate },
        media: clientId ? { clientId } : undefined,
      },
      include: {
        media: { select: { id: true, name: true, clientId: true } },
        device: { select: { id: true, name: true } },
        scene: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    const plans = await this.prisma.plan.findMany({
      where: {
        active: true,
        ...(clientId ? { clientId } : {}),
      },
    });

    const byDay: Record<string, number> = {};
    for (const p of proofs) {
      const day = p.startedAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    return {
      from: fromDate,
      to: toDate,
      totalPlays: proofs.length,
      byDay,
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        samplesPerDay: plan.samplesPerDay,
        clientId: plan.clientId,
      })),
      recent: proofs.slice(0, 50),
    };
  }
}
