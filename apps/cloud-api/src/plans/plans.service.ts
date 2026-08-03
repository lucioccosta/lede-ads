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
        select: { id: true, name: true, clientId: true },
      },
    },
  },
} as const;

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  findAll(clientId?: string) {
    return this.prisma.plan.findMany({
      where: clientId ? { clientId } : undefined,
      include: planInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const months = dto.months ?? 1;
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : addMonths(startsAt, months);
    const groupIds = dto.groupIds ?? [];

    if (groupIds.length) {
      await this.capacity.assertCanBook(groupIds, dto.samplesPerDay);
    }

    return this.prisma.plan.create({
      data: {
        clientId: dto.clientId,
        name: dto.name,
        samplesPerDay: dto.samplesPerDay,
        sampleDurationSec: dto.sampleDurationSec ?? 10,
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
  }

  async update(id: string, dto: UpdatePlanDto) {
    const existing = await this.findOne(id);
    const samplesPerDay = dto.samplesPerDay ?? existing.samplesPerDay;
    const months = dto.months ?? existing.months;
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    let endsAt =
      dto.endsAt !== undefined
        ? dto.endsAt
          ? new Date(dto.endsAt)
          : null
        : existing.endsAt;

    if (dto.months !== undefined && dto.endsAt === undefined) {
      endsAt = addMonths(startsAt, months);
    }

    const groupIds =
      dto.groupIds ??
      existing.deviceGroups.map((g) => g.deviceGroupId);

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

    return this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name,
        samplesPerDay: dto.samplesPerDay,
        sampleDurationSec: dto.sampleDurationSec,
        months: dto.months,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt !== undefined || dto.months !== undefined ? endsAt : undefined,
        active: dto.active,
      },
      include: planInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.plan.delete({ where: { id } });
  }
}
