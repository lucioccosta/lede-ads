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
import { zonedDayBounds, zonedParts } from '../common/timezone';
import { publicBaseUrl, toPublicUrl } from '../common/public-url';
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
  constructor(private readonly prisma: PrismaService) {}

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
        OR: [{ deviceId: device.id }, { deviceId: null }],
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
        const used = popCountByPlan.get(s.planId) ?? 0;
        if (used >= s.plan.samplesPerDay) return false;
      }
      return true;
    });

    const mode = device.screenType?.mode ?? ScreenTypeMode.standard;
    let scenes: SyncScene[] = [];

    if (mode === ScreenTypeMode.condo_split) {
      const condoSchedule = active.find(
        (s) =>
          s.channel === ScheduleChannel.condo &&
          !!device.clientId &&
          s.clientId === device.clientId,
      );
      const adsSchedule = active.find(
        (s) => s.channel === ScheduleChannel.ads,
      );
      // Fallback: full-channel schedules can still fill ads if no ads channel
      const adsFallback =
        adsSchedule ??
        active.find((s) => s.channel === ScheduleChannel.full);

      const layoutSource =
        condoSchedule?.scene.layout ??
        adsFallback?.scene.layout ??
        (device.screenTypeId
          ? await this.prisma.layout.findFirst({
              where: { screenTypeId: device.screenTypeId },
              orderBy: { createdAt: 'asc' },
            })
          : null);

      if (layoutSource) {
        const layoutZones = this.parseLayoutZones(layoutSource.zonesJson);
        const condoZones = condoSchedule
          ? this.buildZonesFromSchedule(condoSchedule, 'condo')
          : layoutZones
              .filter((z) => (z.role ?? 'full') === 'condo')
              .map((z) => ({
                id: `empty-condo-${z.key}`,
                key: z.key,
                label: z.label,
                x: z.x,
                y: z.y,
                width: z.width,
                height: z.height,
                media: null,
              }));

        const adsZones = adsFallback
          ? this.buildZonesFromSchedule(
              adsFallback,
              adsFallback.channel === ScheduleChannel.full ? 'ads' : 'ads',
            )
          : layoutZones
              .filter((z) => (z.role ?? 'full') === 'ads')
              .map((z) => ({
                id: `empty-ads-${z.key}`,
                key: z.key,
                label: z.label,
                x: z.x,
                y: z.y,
                width: z.width,
                height: z.height,
                media: null,
              }));

        // If adsFallback is full channel without ads-role zones, take non-condo zones
        let mergedAds = adsZones;
        if (
          adsFallback &&
          adsFallback.channel === ScheduleChannel.full &&
          !mergedAds.some((z) => z.media)
        ) {
          const layoutZs = this.parseLayoutZones(
            adsFallback.scene.layout.zonesJson,
          );
          const nonCondo = new Set(
            layoutZs
              .filter((z) => (z.role ?? 'full') !== 'condo')
              .map((z) => z.key),
          );
          mergedAds = this.buildZonesFromSchedule(adsFallback).filter((z) =>
            nonCondo.has(z.key),
          );
        }

        const zones = [...condoZones, ...mergedAds];
        const durationMs = Math.max(
          condoSchedule?.scene.durationMs ?? 0,
          adsFallback?.scene.durationMs ?? 0,
          10000,
        );

        if (zones.some((z) => z.media != null)) {
          // Prefer ads scene id so Proof-of-Play conta na cota do inventário
          const sceneId =
            adsFallback?.scene.id ??
            condoSchedule?.scene.id ??
            `merged-${device.id}`;
          scenes = [
            {
              id: sceneId,
              name: condoSchedule?.scene.name ?? adsFallback?.scene.name ?? 'Playout',
              durationMs,
              layoutId:
                condoSchedule?.scene.layoutId ??
                adsFallback?.scene.layoutId ??
                layoutSource.id,
              layout: {
                width: layoutSource.width,
                height: layoutSource.height,
              },
              zones,
            },
          ];
        }
      }
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
      timezone: tz,
      orientation: device.orientation,
      scenes,
    };
  }

  async heartbeat(token: string, dto: HeartbeatDto) {
    const device = await this.byToken(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        status: DeviceStatus.online,
        lastHeartbeatAt: new Date(),
        appVersion: dto.appVersion,
        freeStorageBytes: BigInt(dto.freeStorageBytes),
        ipAddress: dto.ipAddress,
        screenWidth: dto.screenWidth,
        screenHeight: dto.screenHeight,
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
      },
    });

    const commands = await this.prisma.deviceCommand.findMany({
      where: { deviceId: device.id, status: DeviceCommandStatus.pending },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { id: true, type: true },
    });

    return { ok: true, commands };
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

  async screenshotUpload(token: string, filename: string) {
    const device = await this.byToken(token);
    const url = `${publicBaseUrl()}/uploads/screenshots/${filename}`;
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastScreenshotUrl: url },
    });
    return { ok: true, url };
  }
}
