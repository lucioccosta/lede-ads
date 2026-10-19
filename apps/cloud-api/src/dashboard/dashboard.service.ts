import { Injectable } from '@nestjs/common';
import { MediaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapacityService } from '../capacity/capacity.service';

const OFFLINE_MS = 2 * 60 * 1000;

type DayCountRow = { day: Date; count: bigint | number };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  async overview() {
    const now = new Date();
    const offlineBefore = new Date(now.getTime() - OFFLINE_MS);
    const fromDate = new Date(now.getTime() - 7 * 86400000);

    const [
      clientGroups,
      deviceRows,
      mediaGroups,
      scheduleGroups,
      sceneGroups,
      planGroups,
      playsByDayRows,
      totalPlays,
      recentPlays,
      recentHistory,
      pendingMediaList,
      capacities,
    ] = await Promise.all([
      this.prisma.client.groupBy({
        by: ['kind'],
        _count: { _all: true },
      }),
      this.prisma.device.findMany({
        select: {
          id: true,
          name: true,
          pairingCode: true,
          lastHeartbeatAt: true,
          client: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.media.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.schedule.groupBy({
        by: ['active'],
        _count: { _all: true },
      }),
      this.prisma.scene.groupBy({
        by: ['active'],
        _count: { _all: true },
      }),
      this.prisma.plan.groupBy({
        by: ['active'],
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT DATE_TRUNC('day', "startedAt") AS day, COUNT(*)::int AS count
        FROM "ProofOfPlay"
        WHERE "startedAt" >= ${fromDate} AND "startedAt" <= ${now}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.proofOfPlay.count({
        where: { startedAt: { gte: fromDate, lte: now } },
      }),
      this.prisma.proofOfPlay.findMany({
        where: { startedAt: { gte: fromDate, lte: now } },
        select: {
          id: true,
          startedAt: true,
          media: { select: { name: true } },
          device: { select: { name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 8,
      }),
      this.prisma.changeLog.findMany({
        select: {
          id: true,
          action: true,
          summary: true,
          createdAt: true,
          user: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.media.findMany({
        where: { status: MediaStatus.pending_approval },
        select: {
          id: true,
          name: true,
          status: true,
          client: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.capacity.getAllCapacities(),
    ]);

    let clientsCondo = 0;
    let clientsAds = 0;
    for (const row of clientGroups) {
      if (row.kind === 'condo') clientsCondo += row._count._all;
      else clientsAds += row._count._all;
    }

    let devicesOnline = 0;
    let devicesOffline = 0;
    let devicesPairing = 0;
    const offlineDevices: Array<{
      id: string;
      name: string;
      lastHeartbeatAt: string | null;
      client: { name: string } | null;
    }> = [];

    for (const d of deviceRows) {
      if (d.pairingCode) {
        devicesPairing += 1;
        continue;
      }
      const online =
        !!d.lastHeartbeatAt &&
        d.lastHeartbeatAt.getTime() >= offlineBefore.getTime();
      if (online) {
        devicesOnline += 1;
      } else {
        devicesOffline += 1;
        if (offlineDevices.length < 8) {
          offlineDevices.push({
            id: d.id,
            name: d.name,
            lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
            client: d.client,
          });
        }
      }
    }

    const mediaCount = (status: MediaStatus) =>
      mediaGroups.find((g) => g.status === status)?._count._all ?? 0;

    const boolCount = (
      rows: Array<{ active: boolean; _count: { _all: number } }>,
      active: boolean,
    ) => rows.find((r) => r.active === active)?._count._all ?? 0;

    const schedulesActive = boolCount(scheduleGroups, true);
    const schedulesInactive = boolCount(scheduleGroups, false);
    const scenesActive = boolCount(sceneGroups, true);
    const scenesInactive = boolCount(sceneGroups, false);
    const plansActive = boolCount(planGroups, true);
    const plansInactive = boolCount(planGroups, false);

    const byDay: Record<string, number> = {};
    for (const row of playsByDayRows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      byDay[key] = Number(row.count);
    }

    const occupancy =
      capacities.length > 0
        ? Math.round(
            capacities.reduce((acc, g) => acc + g.occupancyPct, 0) /
              capacities.length,
          )
        : 0;

    const capacityTop = [...capacities]
      .sort((a, b) => b.occupancyPct - a.occupancyPct)
      .slice(0, 4)
      .map((g) => ({
        label: g.groupName,
        pct: g.occupancyPct,
        full: g.full,
      }));

    return {
      clientsTotal: clientsCondo + clientsAds,
      clientsCondo,
      clientsAds,
      devicesOnline,
      devicesOffline,
      devicesPairing,
      devicesTotal: deviceRows.length,
      pendingMedia: mediaCount(MediaStatus.pending_approval),
      approvedMedia: mediaCount(MediaStatus.approved),
      schedulesActive,
      schedulesTotal: schedulesActive + schedulesInactive,
      scenesActive,
      scenesTotal: scenesActive + scenesInactive,
      plansActive,
      plansTotal: plansActive + plansInactive,
      capacityFull: capacities.filter((g) => g.full).length,
      capacityGroups: capacities.length,
      capacityAvgOccupancy: occupancy,
      capacityTop,
      plays7d: totalPlays,
      playsByDay: byDay,
      offlineDevices,
      pendingMediaList,
      recentPlays: recentPlays.map((p) => ({
        id: p.id,
        startedAt: p.startedAt.toISOString(),
        media: p.media,
        device: p.device,
      })),
      recentHistory: recentHistory.map((h) => ({
        id: h.id,
        action: h.action,
        summary: h.summary,
        createdAt: h.createdAt.toISOString(),
        user: h.user,
        client: h.client,
      })),
      generatedAt: now.toISOString(),
    };
  }
}
