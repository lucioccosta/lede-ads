import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDeviceGroupDto,
  UpdateDeviceGroupDto,
} from './dto/device-group.dto';
import { CapacityService } from '../capacity/capacity.service';

@Injectable()
export class DeviceGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  findAll() {
    return this.prisma.deviceGroup.findMany({
      include: {
        client: { select: { id: true, name: true, isCondo: true } },
        houseScene: { select: { id: true, name: true } },
        devices: {
          select: { id: true, name: true, locationLabel: true, status: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { devices: true, plans: true, schedules: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.deviceGroup.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, isCondo: true } },
        houseScene: { select: { id: true, name: true, isHouseAd: true } },
        devices: {
          select: {
            id: true,
            name: true,
            locationLabel: true,
            status: true,
            screenTypeId: true,
          },
          orderBy: { name: 'asc' },
        },
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
    const capacity = await this.capacity.getGroupCapacity(id);
    return { ...group, capacity };
  }

  async create(dto: CreateDeviceGroupDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    if (!client.isCondo) {
      throw new BadRequestException(
        'Grupo de telas deve pertencer a um cliente condomínio',
      );
    }

    const group = await this.prisma.deviceGroup.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        viewingHoursPerDay: dto.viewingHoursPerDay ?? 18,
        sampleDurationSec: dto.sampleDurationSec ?? 10,
        houseSceneId: dto.houseSceneId ?? null,
      },
    });

    if (dto.deviceIds?.length) {
      await this.assignDevices(group.id, dto.deviceIds, dto.clientId);
    }

    return this.findOne(group.id);
  }

  async update(id: string, dto: UpdateDeviceGroupDto) {
    await this.findOne(id);

    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
      });
      if (!client?.isCondo) {
        throw new BadRequestException(
          'Grupo de telas deve pertencer a um cliente condomínio',
        );
      }
    }

    await this.prisma.deviceGroup.update({
      where: { id },
      data: {
        name: dto.name,
        clientId: dto.clientId,
        active: dto.active,
        viewingHoursPerDay: dto.viewingHoursPerDay,
        sampleDurationSec: dto.sampleDurationSec,
        houseSceneId:
          dto.houseSceneId === undefined ? undefined : dto.houseSceneId,
      },
    });

    if (dto.deviceIds) {
      const group = await this.prisma.deviceGroup.findUniqueOrThrow({
        where: { id },
      });
      await this.prisma.device.updateMany({
        where: { groupId: id },
        data: { groupId: null },
      });
      if (dto.deviceIds.length) {
        await this.assignDevices(id, dto.deviceIds, group.clientId);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.device.updateMany({
      where: { groupId: id },
      data: { groupId: null },
    });
    return this.prisma.deviceGroup.delete({ where: { id } });
  }

  private async assignDevices(
    groupId: string,
    deviceIds: string[],
    clientId: string,
  ) {
    const devices = await this.prisma.device.findMany({
      where: { id: { in: deviceIds } },
    });
    if (devices.length !== deviceIds.length) {
      throw new BadRequestException('Uma ou mais telas não foram encontradas');
    }
    for (const d of devices) {
      if (d.clientId && d.clientId !== clientId) {
        throw new BadRequestException(
          `Tela "${d.name}" pertence a outro cliente`,
        );
      }
    }
    await this.prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { groupId, clientId },
    });
  }
}
