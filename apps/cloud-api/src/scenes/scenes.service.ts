import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientKind, ScheduleChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSceneDto,
  UpdateSceneDto,
  UpsertCondoNoticeDto,
} from './dto/scene.dto';
import { clientKindToIsCondo } from '../common/client-kind';

type ZoneRole = 'full' | 'condo' | 'ads';

const zoneInclude = {
  media: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: { media: true },
  },
};

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId?: string) {
    const rows = await this.prisma.scene.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        layout: true,
        client: { select: { id: true, name: true, kind: true } },
        zones: { include: zoneInclude },
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
        zones: { include: zoneInclude },
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

  private condoZoneFromLayout(zonesJson: unknown): {
    key: string;
    width: number;
    height: number;
    label: string;
  } | null {
    const zones = Array.isArray(zonesJson)
      ? (zonesJson as Array<{
          key: string;
          label?: string;
          width?: number;
          height?: number;
          role?: string;
        }>)
      : [];
    const condo = zones.find((z) => (z.role ?? 'full') === 'condo');
    if (!condo) return null;
    return {
      key: condo.key,
      width: condo.width ?? 0,
      height: condo.height ?? 0,
      label: condo.label ?? condo.key,
    };
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

    for (const key of zoneKeys) {
      const role = roles.get(key) ?? 'full';
      if (role === 'condo') {
        throw new BadRequestException(
          `Cena de anunciante não pode usar zona condo ("${key}")`,
        );
      }
    }
  }

  private normalizeZoneItems(
    z: {
      mediaId?: string | null;
      items?: Array<{ mediaId: string; durationMs?: number }>;
    },
    defaultDurationMs: number,
  ): Array<{ mediaId: string; durationMs: number; sortOrder: number }> {
    if (z.items?.length) {
      return z.items.map((it, i) => ({
        mediaId: it.mediaId,
        durationMs: it.durationMs ?? defaultDurationMs,
        sortOrder: i,
      }));
    }
    if (z.mediaId) {
      return [
        {
          mediaId: z.mediaId,
          durationMs: defaultDurationMs,
          sortOrder: 0,
        },
      ];
    }
    return [];
  }

  async create(dto: CreateSceneDto) {
    const isHouseAd = dto.isHouseAd ?? false;
    const durationMs = dto.durationMs ?? 10000;
    await this.assertZonesForScene({
      clientId: dto.clientId,
      layoutId: dto.layoutId,
      isHouseAd,
      zones: dto.zones,
    });

    return this.prisma.$transaction(async (tx) => {
      const scene = await tx.scene.create({
        data: {
          clientId: dto.clientId,
          layoutId: dto.layoutId,
          name: dto.name,
          durationMs,
          isHouseAd,
        },
      });

      for (const z of dto.zones ?? []) {
        const items = this.normalizeZoneItems(z, durationMs);
        await tx.sceneZone.create({
          data: {
            sceneId: scene.id,
            zoneKey: z.zoneKey,
            mediaId: items[0]?.mediaId ?? z.mediaId ?? null,
            items: items.length
              ? {
                  create: items.map((it) => ({
                    mediaId: it.mediaId,
                    sortOrder: it.sortOrder,
                    durationMs: it.durationMs,
                  })),
                }
              : undefined,
          },
        });
      }

      return tx.scene.findUniqueOrThrow({
        where: { id: scene.id },
        include: { zones: { include: zoneInclude } },
      });
    });
  }

  async update(id: string, dto: UpdateSceneDto) {
    const existing = await this.findOne(id);
    const layoutId = dto.layoutId ?? existing.layoutId;
    const isHouseAd = dto.isHouseAd ?? existing.isHouseAd;
    const durationMs = dto.durationMs ?? existing.durationMs;

    if (dto.zones || dto.layoutId !== undefined || dto.isHouseAd !== undefined) {
      await this.assertZonesForScene({
        clientId: existing.clientId,
        layoutId,
        isHouseAd,
        zones: dto.zones ?? existing.zones,
      });
    }

    if (dto.zones) {
      await this.prisma.$transaction(async (tx) => {
        await tx.sceneZone.deleteMany({ where: { sceneId: id } });
        for (const z of dto.zones!) {
          const items = this.normalizeZoneItems(z, durationMs);
          await tx.sceneZone.create({
            data: {
              sceneId: id,
              zoneKey: z.zoneKey,
              mediaId: items[0]?.mediaId ?? z.mediaId ?? null,
              items: items.length
                ? {
                    create: items.map((it) => ({
                      mediaId: it.mediaId,
                      sortOrder: it.sortOrder,
                      durationMs: it.durationMs,
                    })),
                  }
                : undefined,
            },
          });
        }
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
      include: { zones: { include: zoneInclude }, layout: true },
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

  /** Ideal sizes das zonas condo para o cliente (layouts liberados). */
  async condoIdealSizes(clientId: string) {
    const allowed = await this.prisma.clientScreenType.findMany({
      where: { clientId },
      include: { screenType: { select: { id: true, name: true, slug: true } } },
    });
    const typeIds = allowed.map((a) => a.screenTypeId);
    if (typeIds.length === 0) return [];

    const layouts = await this.prisma.layout.findMany({
      where: { screenTypeId: { in: typeIds } },
      include: {
        screenTypeRef: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { name: 'asc' },
    });

    const seen = new Map<string, { label: string; width: number; height: number }>();
    for (const layout of layouts) {
      const condo = this.condoZoneFromLayout(layout.zonesJson);
      if (!condo || !condo.width || !condo.height) continue;
      const key = `${condo.width}x${condo.height}`;
      const label =
        layout.screenTypeRef?.name ?? layout.name ?? 'Layout';
      if (!seen.has(key)) {
        seen.set(key, {
          label,
          width: condo.width,
          height: condo.height,
        });
      }
    }
    return [...seen.values()];
  }

  async listCondoNotices(clientId: string) {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        clientId,
        channel: ScheduleChannel.condo_notice,
        active: true,
        scene: { active: true },
      },
      include: {
        device: { select: { id: true, name: true, shortCode: true } },
        group: { select: { id: true, name: true } },
        scene: {
          include: {
            layout: {
              include: {
                screenTypeRef: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            zones: { include: zoneInclude },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });

    const idealSizes = await this.condoIdealSizes(clientId);

    const [groups, devices] = await Promise.all([
      this.prisma.deviceGroup.findMany({
        where: { clientId, active: true },
        select: { id: true, name: true, _count: { select: { devices: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.device.findMany({
        where: { clientId },
        select: {
          id: true,
          name: true,
          shortCode: true,
          groupId: true,
          locationLabel: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      groups,
      devices,
      notices: schedules.map((s) => {
        const condo = this.condoZoneFromLayout(s.scene.layout.zonesJson);
        const zone = s.scene.zones.find((z) => z.zoneKey === condo?.key);
        const items =
          zone?.items?.length
            ? zone.items.map((it) => ({
                id: it.id,
                mediaId: it.mediaId,
                durationMs: it.durationMs,
                sortOrder: it.sortOrder,
                media: it.media,
              }))
            : zone?.media
              ? [
                  {
                    id: zone.id,
                    mediaId: zone.mediaId!,
                    durationMs: zone.media.durationMs,
                    sortOrder: 0,
                    media: zone.media,
                  },
                ]
              : [];
        return {
          scheduleId: s.id,
          name: s.name,
          priority: s.priority,
          groupId: s.groupId,
          deviceId: s.deviceId,
          device: s.device,
          group: s.group,
          sceneId: s.scene.id,
          sceneName: s.scene.name,
          durationMs: items[0]?.durationMs ?? s.scene.durationMs,
          layoutId: s.scene.layoutId,
          layoutName: s.scene.layout.name,
          condoZone: condo,
          items,
        };
      }),
      idealSizes,
    };
  }

  async upsertCondoNotice(clientId: string, dto: UpsertCondoNoticeDto) {
    if ((!dto.groupId && !dto.deviceId) || (dto.groupId && dto.deviceId)) {
      throw new BadRequestException(
        'Informe exatamente um alvo: groupId ou deviceId',
      );
    }

    const durationMs = dto.durationMs ?? 10000;
    const mediaIds = [...new Set(dto.mediaIds)];

    const approved = await this.prisma.media.findMany({
      where: {
        id: { in: mediaIds },
        clientId,
        status: 'approved',
      },
    });
    if (approved.length !== mediaIds.length) {
      throw new BadRequestException(
        'Uma ou mais mídias não estão aprovadas ou não pertencem ao condomínio',
      );
    }

    let layoutId: string | null = null;
    let targetName = 'Todas as telas';

    if (dto.deviceId) {
      const device = await this.prisma.device.findFirst({
        where: { id: dto.deviceId, clientId },
      });
      if (!device) throw new NotFoundException('Tela não encontrada');
      targetName = device.name;
      if (device.screenTypeId) {
        const layout = await this.prisma.layout.findFirst({
          where: { screenTypeId: device.screenTypeId },
          orderBy: { createdAt: 'asc' },
        });
        layoutId = layout?.id ?? null;
      }
    } else if (dto.groupId) {
      const group = await this.prisma.deviceGroup.findFirst({
        where: { id: dto.groupId, clientId },
        include: {
          devices: {
            where: { screenTypeId: { not: null } },
            take: 1,
            select: { screenTypeId: true },
          },
        },
      });
      if (!group) throw new NotFoundException('Grupo não encontrado');
      targetName = group.name;
      const stId = group.devices[0]?.screenTypeId;
      if (stId) {
        const layout = await this.prisma.layout.findFirst({
          where: { screenTypeId: stId },
          orderBy: { createdAt: 'asc' },
        });
        layoutId = layout?.id ?? null;
      }
    }

    const existing = await this.prisma.schedule.findFirst({
      where: {
        clientId,
        channel: ScheduleChannel.condo_notice,
        ...(dto.deviceId
          ? { deviceId: dto.deviceId, groupId: null }
          : { groupId: dto.groupId!, deviceId: null }),
      },
      include: {
        scene: {
          include: { layout: true, zones: { include: zoneInclude } },
        },
      },
    });

    if (existing) {
      layoutId = existing.scene.layoutId;
    }

    if (!layoutId) {
      const allowed = await this.prisma.clientScreenType.findFirst({
        where: { clientId },
      });
      if (allowed) {
        const layout = await this.prisma.layout.findFirst({
          where: { screenTypeId: allowed.screenTypeId },
          orderBy: { createdAt: 'asc' },
        });
        layoutId = layout?.id ?? null;
      }
    }
    if (!layoutId) {
      throw new BadRequestException(
        'Nenhum layout de condomínio disponível para este alvo',
      );
    }

    const layout = await this.prisma.layout.findUniqueOrThrow({
      where: { id: layoutId },
    });
    const condo = this.condoZoneFromLayout(layout.zonesJson);
    if (!condo) {
      throw new BadRequestException('Layout sem zona de condomínio');
    }

    const ordered = mediaIds.map((id) => approved.find((m) => m.id === id)!);

    if (existing) {
      await this.update(existing.sceneId, {
        durationMs,
        zones: [
          {
            zoneKey: condo.key,
            mediaId: ordered[0]?.id ?? null,
            items: ordered.map((m) => ({
              mediaId: m.id,
              durationMs,
            })),
          },
        ],
      });
      await this.prisma.schedule.update({
        where: { id: existing.id },
        data: {
          name: `Aviso — ${targetName}`,
          active: true,
          priority: dto.deviceId ? 30 : 20,
        },
      });
      return this.listCondoNotices(clientId);
    }

    const scene = await this.create({
      clientId,
      layoutId,
      name: `Aviso — ${targetName}`,
      durationMs,
      zones: [
        {
          zoneKey: condo.key,
          mediaId: ordered[0]?.id ?? null,
          items: ordered.map((m) => ({
            mediaId: m.id,
            durationMs,
          })),
        },
      ],
    });

    await this.prisma.schedule.create({
      data: {
        name: `Aviso — ${targetName}`,
        clientId,
        sceneId: scene.id,
        deviceId: dto.deviceId ?? null,
        groupId: dto.groupId ?? null,
        channel: ScheduleChannel.condo_notice,
        priority: dto.deviceId ? 30 : 20,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '00:00',
        endTime: '23:59',
        active: true,
      },
    });

    return this.listCondoNotices(clientId);
  }
}
