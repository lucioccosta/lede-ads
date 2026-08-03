import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneDto, UpdateSceneDto } from './dto/scene.dto';

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(clientId?: string) {
    return this.prisma.scene.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        layout: true,
        client: { select: { id: true, name: true } },
        zones: { include: { media: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const scene = await this.prisma.scene.findUnique({
      where: { id },
      include: {
        layout: true,
        zones: { include: { media: true } },
      },
    });
    if (!scene) throw new NotFoundException('Cena não encontrada');
    return scene;
  }

  async create(dto: CreateSceneDto) {
    return this.prisma.scene.create({
      data: {
        clientId: dto.clientId,
        layoutId: dto.layoutId,
        name: dto.name,
        durationMs: dto.durationMs ?? 10000,
        zones: {
          create: (dto.zones ?? []).map((z) => ({
            zoneKey: z.zoneKey,
            mediaId: z.mediaId,
          })),
        },
      },
      include: { zones: true },
    });
  }

  async update(id: string, dto: UpdateSceneDto) {
    await this.findOne(id);
    if (dto.zones) {
      await this.prisma.sceneZone.deleteMany({ where: { sceneId: id } });
      await this.prisma.sceneZone.createMany({
        data: dto.zones.map((z) => ({
          sceneId: id,
          zoneKey: z.zoneKey,
          mediaId: z.mediaId,
        })),
      });
    }
    return this.prisma.scene.update({
      where: { id },
      data: {
        name: dto.name,
        layoutId: dto.layoutId,
        durationMs: dto.durationMs,
        active: dto.active,
      },
      include: { zones: { include: { media: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.scene.delete({ where: { id } });
  }
}
