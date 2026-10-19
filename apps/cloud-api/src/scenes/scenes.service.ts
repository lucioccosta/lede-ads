import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneDto, UpdateSceneDto } from './dto/scene.dto';
import { clientKindToIsCondo } from '../common/client-kind';

type ZoneRole = 'full' | 'condo' | 'ads';

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId?: string) {
    const rows = await this.prisma.scene.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        layout: true,
        client: { select: { id: true, name: true, kind: true } },
        zones: { include: { media: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => ({
      ...s,
      client: {
        ...s.client,
        isCondo: clientKindToIsCondo(s.client.kind),
      },
    }));
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

  private layoutRoles(zonesJson: unknown): Map<string, ZoneRole> {
    const zones = Array.isArray(zonesJson)
      ? (zonesJson as Array<{ key: string; role?: string }>)
      : [];
    return new Map(
      zones.map((z) => [z.key, (z.role ?? 'full') as ZoneRole]),
    );
  }

  private async assertZonesForScene(opts: {
    clientId: string;
    layoutId: string;
    isHouseAd: boolean;
    zones?: Array<{ zoneKey: string; mediaId?: string | null }>;
  }) {
    const client = await this.prisma.client.findUnique({
      where: { id: opts.clientId },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');

    const layout = await this.prisma.layout.findUnique({
      where: { id: opts.layoutId },
    });
    if (!layout) throw new NotFoundException('Layout não encontrado');

    const roles = this.layoutRoles(layout.zonesJson);
    const zoneKeys = (opts.zones ?? []).map((z) => z.zoneKey);

    if (opts.isHouseAd) {
      for (const key of zoneKeys) {
        const role = roles.get(key) ?? 'full';
        if (role !== 'ads') {
          throw new BadRequestException(
            `Cena house só pode usar zonas ads (zona "${key}" é ${role})`,
          );
        }
      }
      return;
    }

    if (client.kind === ClientKind.condo) {
      for (const key of zoneKeys) {
        const role = roles.get(key) ?? 'full';
        if (role !== 'condo') {
          throw new BadRequestException(
            `Cena de condomínio só pode usar zonas condo (zona "${key}" é ${role})`,
          );
        }
      }
      return;
    }

    // advertiser / network: zonas ads ou full
    for (const key of zoneKeys) {
      const role = roles.get(key) ?? 'full';
      if (role === 'condo') {
        throw new BadRequestException(
          `Cena de anunciante não pode usar zona condo ("${key}")`,
        );
      }
    }
  }

  async create(dto: CreateSceneDto) {
    const isHouseAd = dto.isHouseAd ?? false;
    await this.assertZonesForScene({
      clientId: dto.clientId,
      layoutId: dto.layoutId,
      isHouseAd,
      zones: dto.zones,
    });
    return this.prisma.scene.create({
      data: {
        clientId: dto.clientId,
        layoutId: dto.layoutId,
        name: dto.name,
        durationMs: dto.durationMs ?? 10000,
        isHouseAd,
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
    const existing = await this.findOne(id);
    const layoutId = dto.layoutId ?? existing.layoutId;
    const isHouseAd = dto.isHouseAd ?? existing.isHouseAd;
    if (dto.zones || dto.layoutId !== undefined || dto.isHouseAd !== undefined) {
      await this.assertZonesForScene({
        clientId: existing.clientId,
        layoutId,
        isHouseAd,
        zones: dto.zones ?? existing.zones,
      });
    }
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
        isHouseAd: dto.isHouseAd,
      },
      include: { zones: { include: { media: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.proofOfPlay.deleteMany({ where: { sceneId: id } }),
      this.prisma.schedule.deleteMany({ where: { sceneId: id } }),
      this.prisma.scene.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}
