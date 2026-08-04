import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Device,
  DeviceCommandStatus,
  DeviceCommandType,
  DeviceOrientation,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchCreateDevicesDto,
  BatchTimezoneDto,
  CreateDeviceCommandDto,
  CreateDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

const OFFLINE_MS = 2 * 60 * 1000;

const deviceInclude = {
  client: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  screenType: {
    select: { id: true, name: true, slug: true, mode: true },
  },
} satisfies Prisma.DeviceInclude;

type DeviceWithRels = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

function serializeDevice(device: Device | DeviceWithRels) {
  return {
    ...device,
    freeStorageBytes: device.freeStorageBytes?.toString() ?? null,
    totalStorageBytes: device.totalStorageBytes?.toString() ?? null,
    ramAvailBytes: device.ramAvailBytes?.toString() ?? null,
    ramTotalBytes: device.ramTotalBytes?.toString() ?? null,
    uptimeMs: device.uptimeMs?.toString() ?? null,
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
        computedStatus: d.pairingCode
          ? 'pairing'
          : online
            ? 'online'
            : 'offline',
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
        orientation: dto.orientation
          ? (dto.orientation as DeviceOrientation)
          : DeviceOrientation.landscape,
        clientId: dto.clientId ?? null,
        groupId: dto.groupId ?? null,
        screenTypeId: dto.screenTypeId ?? null,
        pairingCode,
        status: DeviceStatus.pairing,
      },
      include: deviceInclude,
    });
    return serializeDevice(device);
  }

  async createBatch(dto: BatchCreateDevicesDto) {
    const names = [
      ...new Set(
        dto.names
          .map((n) => n.trim())
          .filter((n) => n.length >= 2),
      ),
    ];
    if (names.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um nome com 2 ou mais caracteres',
      );
    }
    const created = [];
    for (const name of names) {
      created.push(
        await this.createPairing({
          name,
          locationLabel: dto.locationLabel,
          timezone: dto.timezone,
          orientation: dto.orientation,
          clientId: dto.clientId,
          groupId: dto.groupId,
          screenTypeId: dto.screenTypeId,
        }),
      );
    }
    return created;
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
            : (dto.orientation as DeviceOrientation),
        clientId: dto.clientId === undefined ? undefined : dto.clientId,
        groupId: dto.groupId === undefined ? undefined : dto.groupId,
        screenTypeId:
          dto.screenTypeId === undefined ? undefined : dto.screenTypeId,
      },
      include: deviceInclude,
    });
    return serializeDevice(device);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.proofOfPlay.deleteMany({ where: { deviceId: id } }),
      this.prisma.schedule.updateMany({
        where: { deviceId: id },
        data: { deviceId: null },
      }),
      this.prisma.deviceCommand.deleteMany({ where: { deviceId: id } }),
      this.prisma.device.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  async resetPairing(id: string) {
    await this.findOne(id);
    const pairingCode = randomBytes(3).toString('hex').toUpperCase();
    const device = await this.prisma.device.update({
      where: { id },
      data: {
        pairingCode,
        deviceToken: null,
        status: DeviceStatus.pairing,
        lastHeartbeatAt: null,
        lastScreenshotUrl: null,
        appVersion: null,
        freeStorageBytes: null,
        totalStorageBytes: null,
        ramAvailBytes: null,
        ramTotalBytes: null,
        cpuUsagePercent: null,
        uptimeMs: null,
        ipAddress: null,
        screenWidth: null,
        screenHeight: null,
      },
      include: deviceInclude,
    });
    // Invalida comandos pendentes do token antigo
    await this.prisma.deviceCommand.updateMany({
      where: { deviceId: id, status: DeviceCommandStatus.pending },
      data: {
        status: DeviceCommandStatus.failed,
        error: 'Pairing reiniciado',
      },
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
