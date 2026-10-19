import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { CapacityService } from '../capacity/capacity.service';

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const planInclude = {
  client: { select: { id: true, name: true } },
  deviceGroups: {
    include: {
      deviceGroup: {
        select: {
          id: true,
          name: true,
          clientId: true,
          impactedPeople: true,
          pricePerScreenCents: true,
          _count: { select: { devices: true } },
        },
      },
    },
  },
} as const;

type PlanWithGroups = Awaited<
  ReturnType<PrismaService['plan']['findMany']>
>[number] & {
  deviceGroups: Array<{
    deviceGroupId: string;
    deviceGroup: {
      id: string;
      name: string;
      clientId: string;
      impactedPeople: number;
      pricePerScreenCents: number;
      _count: { devices: number };
    };
  }>;
  months: number;
};

function withQuote<T extends PlanWithGroups>(plan: T) {
  const groups = plan.deviceGroups.map((link) => {
    const screenCount = link.deviceGroup._count.devices;
    const condoPriceCents =
      screenCount * link.deviceGroup.pricePerScreenCents;
    return {
      ...link,
      deviceGroup: {
        ...link.deviceGroup,
        screenCount,
        condoPriceCents,
      },
    };
  });
  const monthlyPriceCents = groups.reduce(
    (sum, g) => sum + g.deviceGroup.condoPriceCents,
    0,
  );
  return {
    ...plan,
    deviceGroups: groups,
    monthlyPriceCents,
    totalPriceCents: monthlyPriceCents * plan.months,
  };
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  async findAll(clientId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: clientId ? { clientId } : undefined,
      include: planInclude,
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((p) => withQuote(p as PlanWithGroups));
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    return withQuote(plan as PlanWithGroups);
  }

  async create(dto: CreatePlanDto) {
    const months = dto.months ?? 1;
    const startsAt = new Date(dto.startsAt);
    const endsAt = addMonths(startsAt, months);
    const groupIds = dto.groupIds ?? [];

    if (groupIds.length) {
      await this.capacity.assertCanBook(groupIds, dto.samplesPerDay);
    }

    const created = await this.prisma.plan.create({
      data: {
        clientId: dto.clientId ?? null,
        name: dto.name,
        samplesPerDay: dto.samplesPerDay,
        months,
        startsAt,
        endsAt,
        deviceGroups: groupIds.length
          ? {
              create: groupIds.map((deviceGroupId) => ({ deviceGroupId })),
            }
          : undefined,
      },
      include: planInclude,
    });
    return withQuote(created as PlanWithGroups);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const existing = await this.findOne(id);
    const samplesPerDay = dto.samplesPerDay ?? existing.samplesPerDay;
    const months = dto.months ?? existing.months;
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    // Sempre deriva endsAt de months + startsAt
    const endsAt = addMonths(startsAt, months);

    const groupIds =
      dto.groupIds ?? existing.deviceGroups.map((g) => g.deviceGroupId);

    if (groupIds.length && (dto.samplesPerDay !== undefined || dto.groupIds)) {
      await this.capacity.assertCanBook(groupIds, samplesPerDay, id);
    }

    if (dto.groupIds) {
      await this.prisma.planDeviceGroup.deleteMany({ where: { planId: id } });
      if (dto.groupIds.length) {
        await this.prisma.planDeviceGroup.createMany({
          data: dto.groupIds.map((deviceGroupId) => ({
            planId: id,
            deviceGroupId,
          })),
        });
      }
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
        name: dto.name,
        samplesPerDay: dto.samplesPerDay,
        months,
        startsAt,
        endsAt,
        active: dto.active,
      },
      include: planInclude,
    });
    return withQuote(updated as PlanWithGroups);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.plan.delete({ where: { id } });
  }
}
