import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientKind, ScheduleChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScheduleDto,
  ScheduleChannelInput,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import { isCondoKind } from '../common/client-kind';

function toChannel(
  channel?: ScheduleChannelInput,
): ScheduleChannel | undefined {
  if (!channel) return undefined;
  if (channel === 'condo' || channel === 'condo_notice') {
    return ScheduleChannel.condo_notice;
  }
  if (channel === 'ads' || channel === 'paid_ad') {
    return ScheduleChannel.paid_ad;
  }
  return ScheduleChannel.takeover;
}

function channelKey(
  channel: ScheduleChannel,
): 'takeover' | 'condo_notice' | 'paid_ad' {
  if (channel === ScheduleChannel.condo_notice) return 'condo_notice';
  if (channel === ScheduleChannel.paid_ad) return 'paid_ad';
  return 'takeover';
}

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertChannelForClient(
    clientId: string,
    channel?: ScheduleChannelInput,
  ) {
    const resolved = toChannel(channel) ?? ScheduleChannel.takeover;
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, kind: true },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    if (isCondoKind(client.kind) && resolved === ScheduleChannel.paid_ad) {
      throw new BadRequestException(
        'Cliente condomínio não pode usar o canal Anúncios LEDE',
      );
    }
    if (
      client.kind === ClientKind.advertiser &&
      resolved === ScheduleChannel.condo_notice
    ) {
      throw new BadRequestException(
        'Cliente anunciante não pode usar o canal Condomínio',
      );
    }
  }

  async findAll(deviceId?: string, clientId?: string) {
    const rows = await this.prisma.schedule.findMany({
      where: {
        ...(deviceId ? { deviceId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        scene: true,
        plan: true,
        device: true,
        group: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, kind: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((s) => ({
      ...s,
      client: s.client
        ? {
            ...s.client,
            isCondo: isCondoKind(s.client.kind),
          }
        : s.client,
    }));
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

  private assertTarget(
    deviceId: string | null | undefined,
    groupId: string | null | undefined,
  ) {
    const hasDevice = !!deviceId;
    const hasGroup = !!groupId;
    if (hasDevice === hasGroup) {
      throw new BadRequestException(
        'Informe exatamente um alvo: tela ou grupo de telas',
      );
    }
  }

  private async assertPlanLink(
    planId: string | null | undefined,
    groupId: string | null | undefined,
    channel?: ScheduleChannelInput,
  ) {
    if (!planId) return;
    if (!groupId) {
      throw new BadRequestException(
        'Agenda com plano deve apontar para um grupo de telas do plano',
      );
    }
    const resolved = toChannel(channel) ?? ScheduleChannel.paid_ad;
    if (resolved !== ScheduleChannel.paid_ad) {
      throw new BadRequestException(
        'Agenda vinculada a plano deve usar o canal Anúncios LEDE',
      );
    }
    const link = await this.prisma.planDeviceGroup.findUnique({
      where: {
        planId_deviceGroupId: { planId, deviceGroupId: groupId },
      },
    });
    if (!link) {
      throw new BadRequestException(
        'O grupo selecionado não pertence ao plano',
      );
    }
  }

  async create(dto: CreateScheduleDto) {
    await this.assertChannelForClient(dto.clientId, dto.channel);
    this.assertTarget(dto.deviceId, dto.groupId);
    await this.assertPlanLink(dto.planId, dto.groupId, dto.channel);
    await this.bindPlanToClient(dto.planId, dto.clientId);
    return this.prisma.schedule.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        sceneId: dto.sceneId,
        planId: dto.planId ?? null,
        deviceId: dto.deviceId ?? null,
        groupId: dto.groupId ?? null,
        channel: toChannel(dto.channel) ?? ScheduleChannel.takeover,
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
    const nextDeviceId =
      dto.deviceId === undefined ? current.deviceId : dto.deviceId;
    const nextGroupId =
      dto.groupId === undefined ? current.groupId : dto.groupId;
    const nextPlanId =
      dto.planId === undefined ? current.planId : dto.planId;
    const nextChannel = dto.channel ?? channelKey(current.channel);
    this.assertTarget(nextDeviceId, nextGroupId);
    await this.assertPlanLink(nextPlanId, nextGroupId, nextChannel);
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
