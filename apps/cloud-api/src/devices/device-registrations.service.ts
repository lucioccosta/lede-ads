import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeviceOrientation,
  DeviceRegistrationStatus,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertClientScreenType } from '../common/condo-access';
import { newDeviceShortCode } from './devices.service';
import {
  ApproveRegistrationDto,
  RegisterEdgeDto,
  RejectRegistrationDto,
} from './dto/device-registration.dto';

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para leitura na TV. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_PENDING = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 20;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Código de conferência determinístico (mesmo box → mesmo código). */
export function registrationCode(hardwareId: string) {
  const digest = createHash('sha256').update(hardwareId).digest();
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  }
  return out;
}

const listSelect = {
  id: true,
  hardwareId: true,
  code: true,
  status: true,
  hostname: true,
  model: true,
  macAddress: true,
  ipAddress: true,
  externalIp: true,
  appVersion: true,
  appFlavor: true,
  screenWidth: true,
  screenHeight: true,
  rejectReason: true,
  deviceId: true,
  decidedAt: true,
  lastSeenAt: true,
  createdAt: true,
  device: { select: { id: true, name: true, shortCode: true } },
} satisfies Prisma.DeviceRegistrationSelect;

@Injectable()
export class DeviceRegistrationsService {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- Edge

  /**
   * Edge sem token se apresenta. Idempotente por hardwareId.
   * - Segredo novo (box reinstalado) → volta para pendente (exige nova aprovação).
   * - Aprovado mas a tela foi excluída/re-pareada no Cloud → volta para pendente.
   * - Recusado continua recusado até a LEDE excluir o registro.
   */
  async register(dto: RegisterEdgeDto, externalIp?: string) {
    this.rateLimit(externalIp ?? 'unknown');

    const requiredKey = process.env.EDGE_ENROLLMENT_KEY?.trim();
    if (requiredKey && dto.enrollmentKey?.trim() !== requiredKey) {
      throw new ForbiddenException('Chave de cadastro inválida');
    }

    const secretHash = sha256(dto.secret);
    const info = {
      hostname: dto.hostname ?? null,
      model: dto.model ?? null,
      macAddress: dto.macAddress ?? null,
      ipAddress: dto.ipAddress ?? null,
      externalIp: externalIp ?? null,
      appVersion: dto.appVersion ?? null,
      appFlavor: dto.appFlavor ?? null,
      screenWidth: dto.screenWidth ?? null,
      screenHeight: dto.screenHeight ?? null,
      lastSeenAt: new Date(),
    };

    const existing = await this.prisma.deviceRegistration.findUnique({
      where: { hardwareId: dto.hardwareId },
      include: { device: { select: { id: true, deviceToken: true } } },
    });

    if (!existing) {
      const pending = await this.prisma.deviceRegistration.count({
        where: { status: DeviceRegistrationStatus.pending },
      });
      if (pending >= MAX_PENDING) {
        throw new HttpException(
          'Muitos registros pendentes — tente mais tarde',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const created = await this.prisma.deviceRegistration.create({
        data: {
          hardwareId: dto.hardwareId,
          secretHash,
          code: registrationCode(dto.hardwareId),
          ...info,
        },
      });
      return { status: created.status, code: created.code };
    }

    let status = existing.status;
    const secretChanged = !sameHash(existing.secretHash, secretHash);
    const deviceGone = !existing.device || !existing.device.deviceToken;
    if (
      status === DeviceRegistrationStatus.approved &&
      (secretChanged || deviceGone)
    ) {
      status = DeviceRegistrationStatus.pending;
    }

    const updated = await this.prisma.deviceRegistration.update({
      where: { id: existing.id },
      data: {
        ...info,
        secretHash,
        status,
        ...(status !== existing.status
          ? { decidedAt: null, decidedById: null }
          : {}),
      },
    });
    return {
      status: updated.status,
      code: updated.code,
      ...(updated.status === DeviceRegistrationStatus.rejected
        ? { reason: updated.rejectReason }
        : {}),
    };
  }

  /** Edge consulta se já foi aceito. Exige o segredo do registro. */
  async status(hardwareId: string, secret: string) {
    const reg = await this.prisma.deviceRegistration.findUnique({
      where: { hardwareId },
      include: { device: true },
    });
    if (!reg) return { status: 'unknown' as const };
    if (!sameHash(reg.secretHash, sha256(secret))) {
      throw new UnauthorizedException('Segredo de registro inválido');
    }
    await this.prisma.deviceRegistration.update({
      where: { id: reg.id },
      data: { lastSeenAt: new Date() },
    });

    if (reg.status === DeviceRegistrationStatus.rejected) {
      return { status: 'rejected' as const, reason: reg.rejectReason };
    }
    if (
      reg.status !== DeviceRegistrationStatus.approved ||
      !reg.device?.deviceToken
    ) {
      return { status: 'pending' as const, code: reg.code };
    }
    // Mesmo payload do POST /edge/pair
    return {
      status: 'approved' as const,
      deviceId: reg.device.id,
      deviceToken: reg.device.deviceToken,
      name: reg.device.name,
      shortCode: reg.device.shortCode,
      orientation: reg.device.orientation,
    };
  }

  // ---------------------------------------------------------------- Cloud

  list(status?: DeviceRegistrationStatus) {
    return this.prisma.deviceRegistration.findMany({
      where: status ? { status } : undefined,
      select: listSelect,
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
    });
  }

  async approve(id: string, dto: ApproveRegistrationDto, userId: string) {
    const reg = await this.prisma.deviceRegistration.findUnique({
      where: { id },
      include: { device: true },
    });
    if (!reg) throw new NotFoundException('Registro não encontrado');
    if (reg.status === DeviceRegistrationStatus.approved && reg.device?.deviceToken) {
      throw new BadRequestException('Registro já aprovado');
    }

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
      if (client.kind === 'condo') {
        await assertClientScreenType(this.prisma, dto.clientId, dto.screenTypeId);
      }
    }
    if (dto.groupId) {
      const group = await this.prisma.deviceGroup.findUnique({
        where: { id: dto.groupId },
      });
      if (!group) throw new NotFoundException('Grupo não encontrado');
      if (dto.clientId && group.clientId !== dto.clientId) {
        throw new BadRequestException('Grupo pertence a outro condomínio');
      }
    }

    const deviceToken = randomBytes(32).toString('hex');
    const fields = {
      name: dto.name.trim(),
      locationLabel: dto.locationLabel ?? null,
      timezone: dto.timezone || 'America/Manaus',
      orientation: (dto.orientation ?? 'landscape') as DeviceOrientation,
      clientId: dto.clientId ?? null,
      groupId: dto.groupId ?? null,
      screenTypeId: dto.screenTypeId ?? null,
      deviceToken,
      pairingCode: null,
      status: DeviceStatus.online,
      appVersion: reg.appVersion,
      appFlavor: reg.appFlavor,
      ipAddress: reg.ipAddress,
      externalIp: reg.externalIp,
      screenWidth: reg.screenWidth,
      screenHeight: reg.screenHeight,
      lastHeartbeatAt: new Date(),
    };

    return this.prisma.$transaction(async (tx) => {
      let deviceId: string;
      if (reg.device) {
        // Box já conhecido (re-registro): reaproveita a tela e troca o token
        await tx.device.update({ where: { id: reg.device.id }, data: fields });
        deviceId = reg.device.id;
      } else {
        const device = await tx.device.create({
          data: { ...fields, shortCode: await this.uniqueShortCode(tx) },
        });
        deviceId = device.id;
      }
      return tx.deviceRegistration.update({
        where: { id },
        data: {
          status: DeviceRegistrationStatus.approved,
          deviceId,
          rejectReason: null,
          decidedAt: new Date(),
          decidedById: userId,
        },
        select: listSelect,
      });
    });
  }

  async reject(id: string, dto: RejectRegistrationDto, userId: string) {
    const reg = await this.prisma.deviceRegistration.findUnique({ where: { id } });
    if (!reg) throw new NotFoundException('Registro não encontrado');
    return this.prisma.deviceRegistration.update({
      where: { id },
      data: {
        status: DeviceRegistrationStatus.rejected,
        rejectReason: dto.reason?.trim() || null,
        decidedAt: new Date(),
        decidedById: userId,
      },
      select: listSelect,
    });
  }

  /** Remove o registro — o box volta a aparecer como pendente no próximo contato. */
  async remove(id: string) {
    const reg = await this.prisma.deviceRegistration.findUnique({ where: { id } });
    if (!reg) throw new NotFoundException('Registro não encontrado');
    await this.prisma.deviceRegistration.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- util

  private async uniqueShortCode(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 12; i++) {
      const code = newDeviceShortCode();
      const exists = await tx.device.findUnique({
        where: { shortCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    return randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  }

  private rateLimit(ip: string) {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX_PER_IP) {
      throw new HttpException(
        'Muitas tentativas de registro — aguarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > 5000) this.hits.clear();
  }
}
