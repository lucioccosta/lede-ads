import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeviceCommandStatus,
  DeviceStatus,
  MediaStatus,
  ScheduleChannel,
  ScreenTypeMode,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CapacityService } from '../capacity/capacity.service';
import { TickerService } from '../ticker/ticker.service';
import { zonedDayBounds, zonedParts } from '../common/timezone';
import { toPublicUrl } from '../common/public-url';
import {
  AckCommandDto,
  HeartbeatDto,
  PairDeviceDto,
  ProofOfPlayDto,
  ScreenshotDto,
} from './dto/edge.dto';

type LayoutZone = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role?: 'full' | 'condo' | 'ads';
};

type SyncZone = {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  media: {
    id: string;
    type: string;
    url: string;
    checksum: string;
    durationMs: number;
    mimeType: string;
  } | null;
};

type SyncScene = {
  id: string;
  name: string;
  durationMs: number;
  layoutId: string;
  layout: { width: number; height: number };
  zones: SyncZone[];
};

@Injectable()
export class EdgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
    private readonly ticker: TickerService,
  ) {}

  async getTicker(token: string) {
    const device = await this.byToken(token);
    const payload = await this.ticker.getTicker();
    return {
      ...payload,
      shortCode: device.shortCode,
      deviceName: device.name,
    };
  }

  async pair(dto: PairDeviceDto) {
    const device = await this.prisma.device.findFirst({
      where: { pairingCode: dto.code.toUpperCase() },
    });
    if (!device) throw new NotFoundException('Código de pairing inválido');

    const deviceToken = randomBytes(32).toString('hex');
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        deviceToken,
        pairingCode: null,
        status: DeviceStatus.online,
        name: dto.deviceName ?? device.name,
        lastHeartbeatAt: new Date(),
      },
    });

    return {
      deviceId: updated.id,
      deviceToken,
      name: updated.name,
      shortCode: updated.shortCode,
      orientation: updated.orientation,
    };
  }

  private async byToken(token: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceToken: token },
      include: {
        screenType: true,
      },
    });
    if (!device) throw new UnauthorizedException('Device não autorizado');
    return device;
  }

  private parseLayoutZones(zonesJson: unknown): LayoutZone[] {
    if (!Array.isArray(zonesJson)) return [];
    return zonesJson as LayoutZone[];
  }

  private buildZonesFromSchedule(
    schedule: {
      scene: {
        id: string;
        zones: Array<{
          id: string;
          zoneKey: string;
          media: {
            id: string;
            type: string;
            status: MediaStatus;
            url: string;
            checksum: string;
            durationMs: number;
            mimeType: string;
          } | null;
        }>;
        layout: { width: number; height: number; zonesJson: unknown };
      };
    },
    roleFilter?: 'full' | 'condo' | 'ads',
  ): SyncZone[] {
    const layoutZones = this.parseLayoutZones(schedule.scene.layout.zonesJson);
    const allowedKeys = roleFilter
      ? new Set(
          layoutZones
            .filter((z) => (z.role ?? 'full') === roleFilter)
            .map((z) => z.key),
        )
      : null;

    return schedule.scene.zones
      .filter((z) => !allowedKeys || allowedKeys.has(z.zoneKey))
      .map((z) => {
        const geometry = layoutZones.find((lz) => lz.key === z.zoneKey);
        const approved =
          z.media && z.media.status === MediaStatus.approved ? z.media : null;
        return {
          id: z.id,
          key: z.zoneKey,
          label: geometry?.label ?? z.zoneKey,
          x: geometry?.x ?? 0,
          y: geometry?.y ?? 0,
          width: geometry?.width ?? schedule.scene.layout.width,
          height: geometry?.height ?? schedule.scene.layout.height,
          media: approved
            ? {
                id: approved.id,
                type: approved.type,
                url: toPublicUrl(approved.url),
                checksum: approved.checksum,
                durationMs: approved.durationMs,
                mimeType: approved.mimeType,
              }
            : null,
        };
      });
  }

  private scheduleToScene(
    schedule: {
      scene: {
        id: string;
        name: string;
        durationMs: number;
        layoutId: string;
        layout: { width: number; height: number; zonesJson: unknown };
        zones: Array<{
          id: string;
          zoneKey: string;
          media: {
            id: string;
            type: string;
            status: MediaStatus;
            url: string;
            checksum: string;
            durationMs: number;
            mimeType: string;
          } | null;
        }>;
      };
    },
    roleFilter?: 'full' | 'condo' | 'ads',
  ): SyncScene | null {
    const zones = this.buildZonesFromSchedule(schedule, roleFilter);
    if (!zones.some((z) => z.media != null)) return null;
    return {
      id: schedule.scene.id,
      name: schedule.scene.name,
      durationMs: schedule.scene.durationMs,
      layoutId: schedule.scene.layoutId,
      layout: {
        width: schedule.scene.layout.width,
        height: schedule.scene.layout.height,
      },
      zones,
    };
  }

  async sync(token: string) {
    const device = await this.byToken(token);
    const now = new Date();
    const tz = device.timezone || 'America/Manaus';
    const { day, hhmm } = zonedParts(now, tz);
    const { start: dayStart, end: dayEnd } = zonedDayBounds(now, tz);

    const schedules = await this.prisma.schedule.findMany({
      where: {
        active: true,
        OR: [
          { deviceId: device.id },
          { deviceId: null, groupId: null },
          ...(device.groupId ? [{ groupId: device.groupId }] : []),
        ],
      },
      include: {
        plan: true,
        scene: {
          include: {
            zones: { include: { media: true } },
            layout: true,
          },
        },
      },
      orderBy: { priority: 'desc' },
    });

    const planIds = [
      ...new Set(
        schedules.map((s) => s.planId).filter((id): id is string => !!id),
      ),
    ];

    const popsToday =
      planIds.length === 0
        ? []
        : await this.prisma.proofOfPlay.findMany({
            where: {
              deviceId: device.id,
              startedAt: { gte: dayStart, lt: dayEnd },
              scene: {
                schedules: { some: { planId: { in: planIds } } },
              },
            },
            select: { sceneId: true, mediaId: true },
          });

    const popCountByPlan = new Map<string, number>();
    for (const planId of planIds) {
      const sceneIds = new Set(
        schedules.filter((s) => s.planId === planId).map((s) => s.sceneId),
      );
      const count = popsToday.filter((p) => sceneIds.has(p.sceneId)).length;
      popCountByPlan.set(planId, count);
    }

    const active = schedules.filter((s) => {
      if (!s.daysOfWeek.includes(day)) return false;
      if (s.startTime > hhmm || s.endTime < hhmm) return false;
      if (s.startsAt && s.startsAt > now) return false;
      if (s.endsAt && s.endsAt < now) return false;
      if (!s.scene.active) return false;
      if (s.planId && s.plan) {
        if (!s.plan.active) return false;
        if (s.plan.startsAt > now) return false;
        if (s.plan.endsAt && s.plan.endsAt < now) return false;
        const used = popCountByPlan.get(s.planId) ?? 0;
        if (used >= s.plan.samplesPerDay) return false;
      }
      return true;
    });

    const mode = device.screenType?.mode ?? ScreenTypeMode.standard;
    let scenes: SyncScene[] = [];

    if (mode === ScreenTypeMode.condo_split) {
      scenes = await this.buildCondoSplitPlaylist(device, active);
    } else {
      scenes = active
        .filter((s) => s.channel === ScheduleChannel.full)
        .map((s) => this.scheduleToScene(s))
        .filter((s): s is SyncScene => s != null);

      // Backward compat: if nothing with channel=full, use any active
      if (scenes.length === 0) {
        scenes = active
          .map((s) => this.scheduleToScene(s))
          .filter((s): s is SyncScene => s != null);
      }
    }

    return {
      version: randomBytes(4).toString('hex'),
      generatedAt: now.toISOString(),
      deviceId: device.id,
      shortCode: device.shortCode,
      deviceName: device.name,
      timezone: tz,
      orientation: device.orientation,
      scenes,
    };
  }

  private emptyZones(
    layoutZones: LayoutZone[],
    role: 'condo' | 'ads',
  ): SyncZone[] {
    return layoutZones
      .filter((z) => (z.role ?? 'full') === role)
      .map((z) => ({
        id: `empty-${role}-${z.key}`,
        key: z.key,
        label: z.label,
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        media: null,
      }));
  }

  private mergeCondoAdsScene(params: {
    condoZones: SyncZone[];
    adsZones: SyncZone[];
    layout: { id: string; width: number; height: number };
    sceneId: string;
    name: string;
    durationMs: number;
    layoutId: string;
  }): SyncScene | null {
    const zones = [...params.condoZones, ...params.adsZones];
    if (!zones.some((z) => z.media != null)) return null;
    return {
      id: params.sceneId,
      name: params.name,
      durationMs: Math.max(params.durationMs, 10000),
      layoutId: params.layoutId,
      layout: {
        width: params.layout.width,
        height: params.layout.height,
      },
      zones,
    };
  }

  /** Intercala anúncios pagos (peso igual) com house proporcional aos slots vagos. */
  private buildHouseFillPattern(paidCount: number, vacantRatio: number) {
    type Slot =
      | { type: 'paid'; index: number }
      | { type: 'house' };
    if (paidCount <= 0) return [{ type: 'house' } as Slot];
    const soldRatio = Math.max(0, 1 - vacantRatio);
    if (soldRatio <= 0 || vacantRatio <= 0) {
      return Array.from({ length: paidCount }, (_, index) => ({
        type: 'paid' as const,
        index,
      }));
    }
    const houseWeight = Math.max(
      1,
      Math.round((paidCount * vacantRatio) / soldRatio),
    );
    const pattern: Slot[] = [];
    for (let i = 0; i < paidCount; i++) {
      pattern.push({ type: 'paid', index: i });
    }
    for (let i = 0; i < houseWeight; i++) {
      pattern.push({ type: 'house' });
    }
    return pattern;
  }

  private async buildCondoSplitPlaylist(
    device: {
      id: string;
      clientId: string | null;
      groupId: string | null;
      screenTypeId: string | null;
    },
    active: Array<{
      id: string;
      channel: ScheduleChannel;
      clientId: string;
      groupId: string | null;
      deviceId: string | null;
      scene: {
        id: string;
        name: string;
        durationMs: number;
        layoutId: string;
        isHouseAd: boolean;
        layout: { id: string; width: number; height: number; zonesJson: unknown };
        zones: Array<{
          id: string;
          zoneKey: string;
          media: {
            id: string;
            type: string;
            status: MediaStatus;
            url: string;
            checksum: string;
            durationMs: number;
            mimeType: string;
          } | null;
        }>;
      };
    }>,
  ): Promise<SyncScene[]> {
    const condoSchedule = active.find(
      (s) =>
        s.channel === ScheduleChannel.condo &&
        !!device.clientId &&
        s.clientId === device.clientId,
    );

    const paidAds = active.filter(
      (s) =>
        s.channel === ScheduleChannel.ads &&
        !s.scene.isHouseAd &&
        (device.groupId
          ? s.groupId === device.groupId || s.deviceId === device.id
          : s.deviceId === device.id || s.deviceId === null),
    );

    // Fallback full-channel as ads when no ads schedules
    const fullFallback =
      paidAds.length === 0
        ? active.find((s) => s.channel === ScheduleChannel.full)
        : undefined;

    let vacantRatio = 0;
    if (device.groupId) {
      try {
        const cap = await this.capacity.getGroupCapacity(device.groupId);
        vacantRatio =
          cap.capacityPerDay > 0 ? cap.vacantPerDay / cap.capacityPerDay : 1;
      } catch {
        vacantRatio = paidAds.length === 0 ? 1 : 0;
      }
    } else if (paidAds.length === 0 && !fullFallback) {
      vacantRatio = 1;
    }

    const group = device.groupId
      ? await this.prisma.deviceGroup.findUnique({
          where: { id: device.groupId },
          include: {
            houseScene: {
              include: {
                zones: { include: { media: true } },
                layout: true,
              },
            },
          },
        })
      : null;

    let houseScene =
      group?.houseScene ??
      (await this.prisma.scene.findFirst({
        where: { isHouseAd: true, active: true },
        include: {
          zones: { include: { media: true } },
          layout: true,
        },
      }));

    const layoutSource =
      condoSchedule?.scene.layout ??
      paidAds[0]?.scene.layout ??
      fullFallback?.scene.layout ??
      houseScene?.layout ??
      (device.screenTypeId
        ? await this.prisma.layout.findFirst({
            where: { screenTypeId: device.screenTypeId },
            orderBy: { createdAt: 'asc' },
          })
        : null);

    if (!layoutSource) return [];

    const layoutZones = this.parseLayoutZones(layoutSource.zonesJson);
    const condoZones = condoSchedule
      ? this.buildZonesFromSchedule(condoSchedule, 'condo')
      : this.emptyZones(layoutZones, 'condo');

    const paidEntries = paidAds.length
      ? paidAds
      : fullFallback
        ? [fullFallback]
        : [];

    const houseAdsZones = houseScene
      ? this.buildZonesFromSchedule(
          {
            scene: {
              id: houseScene.id,
              zones: houseScene.zones,
              layout: houseScene.layout,
            },
          },
          'ads',
        )
      : this.emptyZones(layoutZones, 'ads');

    const pattern = this.buildHouseFillPattern(
      paidEntries.length,
      paidEntries.length === 0 ? 1 : vacantRatio,
    );

    const scenes: SyncScene[] = [];
    for (const slot of pattern) {
      if (slot.type === 'house') {
        const merged = this.mergeCondoAdsScene({
          condoZones,
          adsZones: houseAdsZones,
          layout: layoutSource,
          sceneId: houseScene?.id ?? `house-${device.id}`,
          name: houseScene?.name ?? 'Anuncie AQUI',
          durationMs: houseScene?.durationMs ?? 10000,
          layoutId: houseScene?.layoutId ?? layoutSource.id,
        });
        if (merged) scenes.push(merged);
        continue;
      }

      const adsSchedule = paidEntries[slot.index];
      if (!adsSchedule) continue;

      let adsZones = this.buildZonesFromSchedule(
        adsSchedule,
        adsSchedule.channel === ScheduleChannel.full ? 'ads' : 'ads',
      );
      if (
        adsSchedule.channel === ScheduleChannel.full &&
        !adsZones.some((z) => z.media)
      ) {
        const layoutZs = this.parseLayoutZones(
          adsSchedule.scene.layout.zonesJson,
        );
        const nonCondo = new Set(
          layoutZs
            .filter((z) => (z.role ?? 'full') !== 'condo')
            .map((z) => z.key),
        );
        adsZones = this.buildZonesFromSchedule(adsSchedule).filter((z) =>
          nonCondo.has(z.key),
        );
      }

      const merged = this.mergeCondoAdsScene({
        condoZones,
        adsZones,
        layout: layoutSource,
        sceneId: adsSchedule.scene.id,
        name: adsSchedule.scene.name,
        durationMs: Math.max(
          condoSchedule?.scene.durationMs ?? 0,
          adsSchedule.scene.durationMs,
        ),
        layoutId: adsSchedule.scene.layoutId,
      });
      if (merged) scenes.push(merged);
    }

    return scenes;
  }

  async heartbeat(
    token: string,
    dto: HeartbeatDto,
    externalIp?: string,
  ) {
    const device = await this.byToken(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        status: DeviceStatus.online,
        lastHeartbeatAt: new Date(),
        appVersion: dto.appVersion,
        ...(dto.appVersionCode != null
          ? { appVersionCode: dto.appVersionCode }
          : {}),
        ...(dto.appFlavor ? { appFlavor: dto.appFlavor } : {}),
        freeStorageBytes: BigInt(dto.freeStorageBytes),
        ...(dto.totalStorageBytes != null
          ? { totalStorageBytes: BigInt(dto.totalStorageBytes) }
          : {}),
        ...(dto.ramAvailBytes != null
          ? { ramAvailBytes: BigInt(dto.ramAvailBytes) }
          : {}),
        ...(dto.ramTotalBytes != null
          ? { ramTotalBytes: BigInt(dto.ramTotalBytes) }
          : {}),
        ...(dto.cpuUsagePercent != null
          ? { cpuUsagePercent: dto.cpuUsagePercent }
          : {}),
        ...(dto.uptimeMs != null ? { uptimeMs: BigInt(dto.uptimeMs) } : {}),
        ...(dto.ipAddress ? { ipAddress: dto.ipAddress } : {}),
        ...(externalIp ? { externalIp } : {}),
        ...(dto.screenWidth != null ? { screenWidth: dto.screenWidth } : {}),
        ...(dto.screenHeight != null ? { screenHeight: dto.screenHeight } : {}),
        // timezone do Cloud NÃO é sobrescrito pelo Edge — vem de Telas/editar device
      },
    });

    const commands = await this.prisma.deviceCommand.findMany({
      where: { deviceId: device.id, status: DeviceCommandStatus.pending },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { id: true, type: true, payloadJson: true, createdAt: true },
    });

    // Expire reboot/update pending há >10 min (proteção contra loop pós-falha de ACK).
    const staleCutoff = Date.now() - 10 * 60 * 1000;
    const stale = commands.filter(
      (c) =>
        (c.type === 'reboot' || c.type === 'update') &&
        c.createdAt.getTime() < staleCutoff,
    );
    if (stale.length > 0) {
      await this.prisma.deviceCommand.updateMany({
        where: { id: { in: stale.map((c) => c.id) } },
        data: {
          status: DeviceCommandStatus.failed,
          error: 'Expirado (proteção contra loop)',
          ackedAt: new Date(),
        },
      });
    }
    const fresh = commands.filter((c) => !stale.some((s) => s.id === c.id));

    // Re-lê timezone atual (pode ter sido alterado no Cloud)
    const freshDevice = await this.prisma.device.findUnique({
      where: { id: device.id },
      select: { timezone: true },
    });

    return {
      ok: true,
      timezone: freshDevice?.timezone ?? device.timezone,
      commands: fresh.map((c) => ({
        id: c.id,
        type: c.type,
        payload: c.payloadJson ?? null,
      })),
    };
  }

  async ackCommand(token: string, commandId: string, dto: AckCommandDto) {
    const device = await this.byToken(token);
    const command = await this.prisma.deviceCommand.findFirst({
      where: { id: commandId, deviceId: device.id },
    });
    if (!command) throw new NotFoundException('Comando não encontrado');

    const status =
      dto.status === 'done'
        ? DeviceCommandStatus.done
        : DeviceCommandStatus.failed;

    await this.prisma.deviceCommand.update({
      where: { id: command.id },
      data: {
        status,
        error: dto.error,
        ackedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async proofOfPlay(token: string, dto: ProofOfPlayDto) {
    const device = await this.byToken(token);
    let sceneId = dto.sceneId;
    if (sceneId.startsWith('merged-')) {
      const mediaZone = await this.prisma.sceneZone.findFirst({
        where: { mediaId: dto.mediaId },
        select: { sceneId: true },
      });
      if (!mediaZone) return { ok: true, skipped: true };
      sceneId = mediaZone.sceneId;
    }

    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
    });
    if (!scene) return { ok: true, skipped: true };

    await this.prisma.proofOfPlay.create({
      data: {
        deviceId: device.id,
        sceneId,
        mediaId: dto.mediaId,
        startedAt: new Date(dto.startedAt),
        endedAt: new Date(dto.endedAt),
        checksum: dto.checksum,
      },
    });
    return { ok: true };
  }

  async screenshot(token: string, dto: ScreenshotDto) {
    const device = await this.byToken(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastScreenshotUrl: dto.url },
    });
    return { ok: true };
  }

  async screenshotUpload(token: string, url: string) {
    const device = await this.byToken(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastScreenshotUrl: url },
    });
    return { ok: true, url };
  }
}
