import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type GroupCapacity = {
  groupId: string;
  groupName: string;
  clientId: string;
  clientName: string;
  deviceCount: number;
  viewingHoursPerDay: number;
  sampleDurationSec: number;
  slotsPerScreenDay: number;
  capacityPerDay: number;
  soldPerDay: number;
  vacantPerDay: number;
  occupancyPct: number;
  full: boolean;
  nextEndsAt: string | null;
  nextReleaseSamples: number | null;
  plans: Array<{
    id: string;
    name: string;
    clientId: string;
    clientName: string;
    samplesPerDay: number;
    months: number;
    startsAt: string;
    endsAt: string | null;
    active: boolean;
  }>;
};

@Injectable()
export class CapacityService {
  constructor(private readonly prisma: PrismaService) {}

  slotsPerScreenDay(viewingHoursPerDay: number, sampleDurationSec: number) {
    const hours = Math.max(1, viewingHoursPerDay);
    const duration = Math.max(1, sampleDurationSec);
    return Math.floor((hours * 3600) / duration);
  }

  async getGroupCapacity(
    groupId: string,
    options?: { excludePlanId?: string; at?: Date },
  ): Promise<GroupCapacity> {
    const at = options?.at ?? new Date();
    const group = await this.prisma.deviceGroup.findUnique({
      where: { id: groupId },
      include: {
        client: { select: { id: true, name: true } },
        devices: { select: { id: true } },
        plans: {
          include: {
            plan: {
              include: { client: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    const activePlans = group.plans
      .map((l) => l.plan)
      .filter((p) => {
        if (options?.excludePlanId && p.id === options.excludePlanId) {
          return false;
        }
        if (!p.active) return false;
        if (p.startsAt > at) return false;
        if (p.endsAt && p.endsAt < at) return false;
        return true;
      });

    const slots = this.slotsPerScreenDay(
      group.viewingHoursPerDay,
      group.sampleDurationSec,
    );
    const deviceCount = group.devices.length;
    const capacityPerDay = slots * deviceCount;
    const soldPerDay = activePlans.reduce((sum, p) => sum + p.samplesPerDay, 0);
    const vacantPerDay = Math.max(0, capacityPerDay - soldPerDay);
    const occupancyPct =
      capacityPerDay === 0
        ? 0
        : Math.min(100, Math.round((soldPerDay / capacityPerDay) * 1000) / 10);

    const endingSoon = activePlans
      .filter((p) => p.endsAt)
      .sort(
        (a, b) =>
          (a.endsAt?.getTime() ?? Infinity) - (b.endsAt?.getTime() ?? Infinity),
      )[0];

    return {
      groupId: group.id,
      groupName: group.name,
      clientId: group.clientId,
      clientName: group.client.name,
      deviceCount,
      viewingHoursPerDay: group.viewingHoursPerDay,
      sampleDurationSec: group.sampleDurationSec,
      slotsPerScreenDay: slots,
      capacityPerDay,
      soldPerDay,
      vacantPerDay,
      occupancyPct,
      full: vacantPerDay <= 0 && capacityPerDay > 0,
      nextEndsAt: endingSoon?.endsAt?.toISOString() ?? null,
      nextReleaseSamples: endingSoon?.samplesPerDay ?? null,
      plans: activePlans.map((p) => ({
        id: p.id,
        name: p.name,
        clientId: p.clientId,
        clientName: p.client.name,
        samplesPerDay: p.samplesPerDay,
        months: p.months,
        startsAt: p.startsAt.toISOString(),
        endsAt: p.endsAt?.toISOString() ?? null,
        active: p.active,
      })),
    };
  }

  async getAllCapacities() {
    const groups = await this.prisma.deviceGroup.findMany({
      where: { active: true },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    return Promise.all(groups.map((g) => this.getGroupCapacity(g.id)));
  }

  async assertCanBook(
    groupIds: string[],
    samplesPerDay: number,
    excludePlanId?: string,
  ) {
    for (const groupId of groupIds) {
      const cap = await this.getGroupCapacity(groupId, { excludePlanId });
      if (cap.soldPerDay + samplesPerDay > cap.capacityPerDay) {
        throw new BadRequestException(
          `Grupo "${cap.groupName}" sem capacidade: vagas ${cap.vacantPerDay}/dia, pedido ${samplesPerDay}/dia (capacidade ${cap.capacityPerDay})`,
        );
      }
    }
  }
}
