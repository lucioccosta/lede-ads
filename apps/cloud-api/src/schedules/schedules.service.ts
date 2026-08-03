import { Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

function toChannel(
  channel?: 'full' | 'condo' | 'ads',
): ScheduleChannel | undefined {
  if (!channel) return undefined;
  if (channel === 'condo') return ScheduleChannel.condo;
  if (channel === 'ads') return ScheduleChannel.ads;
  return ScheduleChannel.full;
}

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(deviceId?: string, clientId?: string) {
    return this.prisma.schedule.findMany({
      where: {
        ...(deviceId ? { deviceId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        scene: true,
        plan: true,
        device: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: { scene: true, plan: true, device: true },
    });
    if (!schedule) throw new NotFoundException('Agendamento não encontrado');
    return schedule;
  }

  create(dto: CreateScheduleDto) {
    return this.prisma.schedule.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        sceneId: dto.sceneId,
        planId: dto.planId ?? null,
        deviceId: dto.deviceId ?? null,
        channel: toChannel(dto.channel) ?? ScheduleChannel.full,
        priority: dto.priority ?? 0,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateScheduleDto) {
    await this.findOne(id);
    return this.prisma.schedule.update({
      where: { id },
      data: {
        name: dto.name,
        sceneId: dto.sceneId,
        planId: dto.planId === undefined ? undefined : dto.planId,
        deviceId: dto.deviceId === undefined ? undefined : dto.deviceId,
        channel: toChannel(dto.channel),
        priority: dto.priority,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        startsAt:
          dto.startsAt === undefined
            ? undefined
            : dto.startsAt
              ? new Date(dto.startsAt)
              : null,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt
              ? new Date(dto.endsAt)
              : null,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.schedule.delete({ where: { id } });
  }
}
