import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLayoutDto, UpdateLayoutDto } from './dto/layout.dto';

type ZoneInput = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role?: 'full' | 'condo' | 'ads';
};

function normalizeZones(zones: ZoneInput[]) {
  return zones.map((z) => ({
    ...z,
    role: z.role ?? 'full',
  }));
}

@Injectable()
export class LayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.layout.findMany({
      orderBy: { name: 'asc' },
      include: {
        screenTypeRef: { select: { id: true, name: true, mode: true, slug: true } },
      },
    });
  }

  async findOne(id: string) {
    const layout = await this.prisma.layout.findUnique({
      where: { id },
      include: {
        screenTypeRef: { select: { id: true, name: true, mode: true, slug: true } },
      },
    });
    if (!layout) throw new NotFoundException('Layout não encontrado');
    return layout;
  }

  async create(dto: CreateLayoutDto) {
    let screenTypeLabel = dto.screenType;
    if (dto.screenTypeId) {
      const st = await this.prisma.screenType.findUnique({
        where: { id: dto.screenTypeId },
      });
      if (!st) throw new NotFoundException('Tipo de tela não encontrado');
      screenTypeLabel = st.slug;
    }
    return this.prisma.layout.create({
      data: {
        name: dto.name,
        screenType: screenTypeLabel,
        screenTypeId: dto.screenTypeId ?? null,
        width: dto.width,
        height: dto.height,
        zonesJson: normalizeZones(dto.zones) as unknown as Prisma.InputJsonValue,
      },
      include: {
        screenTypeRef: { select: { id: true, name: true, mode: true, slug: true } },
      },
    });
  }

  async update(id: string, dto: UpdateLayoutDto) {
    await this.findOne(id);
    let screenTypeLabel = dto.screenType;
    if (dto.screenTypeId) {
      const st = await this.prisma.screenType.findUnique({
        where: { id: dto.screenTypeId },
      });
      if (!st) throw new NotFoundException('Tipo de tela não encontrado');
      screenTypeLabel = st.slug;
    }
    return this.prisma.layout.update({
      where: { id },
      data: {
        name: dto.name,
        screenType: screenTypeLabel,
        screenTypeId:
          dto.screenTypeId === undefined ? undefined : dto.screenTypeId,
        width: dto.width,
        height: dto.height,
        zonesJson: dto.zones
          ? (normalizeZones(dto.zones) as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      include: {
        screenTypeRef: { select: { id: true, name: true, mode: true, slug: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.layout.delete({ where: { id } });
  }
}
