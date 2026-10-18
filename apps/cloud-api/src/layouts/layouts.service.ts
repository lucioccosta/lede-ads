import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

const layoutInclude = {
  screenTypeRef: {
    select: { id: true, name: true, mode: true, slug: true },
  },
  _count: { select: { scenes: true } },
} as const;

@Injectable()
export class LayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(where?: Prisma.LayoutWhereInput) {
    return this.prisma.layout.findMany({
      where,
      orderBy: { name: 'asc' },
      include: layoutInclude,
    });
  }

  async findOne(id: string) {
    const layout = await this.prisma.layout.findUnique({
      where: { id },
      include: layoutInclude,
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
      include: layoutInclude,
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
      include: layoutInclude,
    });
  }

  async remove(id: string) {
    const layout = await this.findOne(id);
    if (layout._count.scenes > 0) {
      throw new BadRequestException(
        `Layout em uso por ${layout._count.scenes} cena(s). Remova ou troque o layout das cenas antes.`,
      );
    }
    return this.prisma.layout.delete({ where: { id } });
  }
}
