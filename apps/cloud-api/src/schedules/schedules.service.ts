import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  private async assertChannelForClient(
    clientId: string,
    channel?: 'full' | 'condo' | 'ads',
  ) {
    const resolved = channel ?? 'full';
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, isCondo: true },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    if (client.isCondo && resolved === 'ads') {
      throw new BadRequestException(
        'Cliente condomínio não pode usar o canal Anúncios LEDE',
      );
    }
    if (!client.isCondo && resolved === 'condo') {
      throw new BadRequestException(
        'Cliente anunciante não pode usar o canal Condomínio',
      );
    }
  }

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
        group: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, isCondo: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        scene: true,
        plan: true,
        device: true,
        group: { select: { id: true, name: true } },
      },
    });
    if (!schedule) throw new NotFoundException('Agendamento não encontrado');
    return schedule;
  }

  /**
   * Se a agenda aponta a um plano sem anunciante, atribui o cliente da agenda.
   * Se o plano já tem outro anunciante, rejeita.
   */
  private async bindPlanToClient(
    planId: string | null | undefined,
    clientId: string,
  ) {
    if (!planId) return;
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, clientId: true, name: true },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    if (plan.clientId && plan.clientId !== clientId) {
      throw new BadRequestException(
        `Plano "${plan.name}" já está vinculado a outro anunciante`,
      );
    }
    if (!plan.clientId) {
      await this.prisma.plan.update({
        where: { id: plan.id },
        data: { clientId },
      });
    }
  }

  async create(dto: CreateScheduleDto) {
    await this.assertChannelForClient(dto.clientId, dto.channel);
    await this.bindPlanToClient(dto.planId, dto.clientId);
    return this.prisma.schedule.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        sceneId: dto.sceneId,
        planId: dto.planId ?? null,
        deviceId: dto.deviceId ?? null,
        groupId: dto.groupId ?? null,
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
    const current = await this.findOne(id);
    if (dto.channel !== undefined) {
      await this.assertChannelForClient(current.clientId, dto.channel);
    }
    const nextPlanId =
      dto.planId === undefined ? current.planId : dto.planId;
    await this.bindPlanToClient(nextPlanId, current.clientId);
    return this.prisma.schedule.update({
      where: { id },
      data: {
        name: dto.name,
        sceneId: dto.sceneId,
        planId: dto.planId === undefined ? undefined : dto.planId,
        deviceId: dto.deviceId === undefined ? undefined : dto.deviceId,
        groupId: dto.groupId === undefined ? undefined : dto.groupId,
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
