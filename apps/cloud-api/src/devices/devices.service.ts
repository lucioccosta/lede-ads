import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Device,
  DeviceCommandType,
  DeviceOrientation,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchTimezoneDto,
  CreateDeviceCommandDto,
  CreateDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

const OFFLINE_MS = 2 * 60 * 1000;

const deviceInclude = {
  client: { select: { id: true, name: true } },
  screenType: {
    select: { id: true, name: true, slug: true, mode: true },
  },
} satisfies Prisma.DeviceInclude;

type DeviceWithRels = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

function serializeDevice(device: Device | DeviceWithRels) {
  return {
    ...device,
    freeStorageBytes: device.freeStorageBytes?.toString() ?? null,
  };
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const devices = await this.prisma.device.findMany({
      orderBy: { name: 'asc' },
      include: deviceInclude,
    });
    return devices.map(serializeDevice);
  }

  async findForClient(clientId: string) {
    const devices = await this.prisma.device.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      include: deviceInclude,
    });
    const now = Date.now();
    return devices.map((d) => {
      const last = d.lastHeartbeatAt?.getTime() ?? 0;
      return {
        ...serializeDevice(d),
        computedStatus: now - last < OFFLINE_MS ? 'online' : 'offline',
      };
    });
  }

  async monitoring() {
    const devices = await this.prisma.device.findMany({
      orderBy: { name: 'asc' },
      include: deviceInclude,
    });
    const now = Date.now();
    return devices.map((d) => {
      const last = d.lastHeartbeatAt?.getTime() ?? 0;
      const online = now - last < OFFLINE_MS;
      return {
        ...serializeDevice(d),
        computedStatus: online ? 'online' : 'offline',
      };
    });
  }

  async findOne(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: deviceInclude,
    });
    if (!device) throw new NotFoundException('Device não encontrado');
    return serializeDevice(device);
  }

  create(dto: CreateDeviceDto) {
    return this.createPairing(dto);
  }

  async createPairing(dto: CreateDeviceDto) {
    const pairingCode = randomBytes(3).toString('hex').toUpperCase();
    if (dto.screenTypeId) {
      const st = await this.prisma.screenType.findUnique({
        where: { id: dto.screenTypeId },
      });
      if (!st) throw new NotFoundException('Tipo de tela não encontrado');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
      });
      if (!client) throw new NotFoundException('Cliente não encontrado');
    }
    const device = await this.prisma.device.create({
      data: {
        name: dto.name,
        locationLabel: dto.locationLabel,
        timezone: dto.timezone || 'America/Manaus',
        orientation:
          dto.orientation === 'portrait'
            ? DeviceOrientation.portrait
            : DeviceOrientation.landscape,
        clientId: dto.clientId ?? null,
        screenTypeId: dto.screenTypeId ?? null,
        pairingCode,
        status: DeviceStatus.pairing,
      },
      include: deviceInclude,
    });
    return serializeDevice(device);
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.findOne(id);
    if (dto.screenTypeId) {
      const st = await this.prisma.screenType.findUnique({
        where: { id: dto.screenTypeId },
      });
      if (!st) throw new NotFoundException('Tipo de tela não encontrado');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
      });
      if (!client) throw new NotFoundException('Cliente não encontrado');
    }
    const device = await this.prisma.device.update({
      where: { id },
      data: {
        name: dto.name,
        locationLabel: dto.locationLabel,
        timezone: dto.timezone,
        orientation:
          dto.orientation === undefined
            ? undefined
            : dto.orientation === 'portrait'
              ? DeviceOrientation.portrait
              : DeviceOrientation.landscape,
        clientId: dto.clientId === undefined ? undefined : dto.clientId,
        screenTypeId:
          dto.screenTypeId === undefined ? undefined : dto.screenTypeId,
      },
      include: deviceInclude,
    });
    return serializeDevice(device);
  }

  async enqueueCommand(id: string, dto: CreateDeviceCommandDto) {
    await this.findOne(id);
    return this.prisma.deviceCommand.create({
      data: {
        deviceId: id,
        type: dto.type as DeviceCommandType,
      },
    });
  }

  async listCommands(id: string) {
    await this.findOne(id);
    return this.prisma.deviceCommand.findMany({
      where: { deviceId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async batchTimezone(dto: BatchTimezoneDto) {
    const result = await this.prisma.device.updateMany({
      where: { id: { in: dto.deviceIds } },
      data: { timezone: dto.timezone },
    });
    return { updated: result.count };
  }
}
