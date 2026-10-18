import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScreenTypeMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScreenTypeDto,
  SetClientScreenTypesDto,
  UpdateScreenTypeDto,
} from './dto/screen-type.dto';

const screenTypeCountInclude = {
  _count: { select: { layouts: true, devices: true, clients: true } },
} as const;

@Injectable()
export class ScreenTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.screenType.findMany({
      orderBy: { name: 'asc' },
      include: screenTypeCountInclude,
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.screenType.findUnique({
      where: { id },
      include: {
        layouts: { select: { id: true, name: true } },
        ...screenTypeCountInclude,
      },
    });
    if (!item) throw new NotFoundException('Tipo de tela não encontrado');
    return item;
  }

  async create(dto: CreateScreenTypeDto) {
    const exists = await this.prisma.screenType.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new ConflictException('Slug já em uso');
    return this.prisma.screenType.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        mode:
          dto.mode === 'condo_split'
            ? ScreenTypeMode.condo_split
            : ScreenTypeMode.standard,
      },
    });
  }

  async update(id: string, dto: UpdateScreenTypeDto) {
    await this.findOne(id);
    if (dto.slug) {
      const exists = await this.prisma.screenType.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (exists) throw new ConflictException('Slug já em uso');
    }
    return this.prisma.screenType.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description === undefined ? undefined : dto.description,
        mode:
          dto.mode === undefined
            ? undefined
            : dto.mode === 'condo_split'
              ? ScreenTypeMode.condo_split
              : ScreenTypeMode.standard,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    const { layouts, devices } = item._count;
    if (layouts > 0 || devices > 0) {
      const parts: string[] = [];
      if (layouts > 0) parts.push(`${layouts} layout(s)`);
      if (devices > 0) parts.push(`${devices} tela(s)`);
      throw new BadRequestException(
        `Tipo em uso por ${parts.join(' e ')}. Remova ou troque o vínculo antes.`,
      );
    }
    // ClientScreenType tem onDelete Cascade — vínculos de cliente são limpos.
    return this.prisma.screenType.delete({ where: { id } });
  }

  listForClient(clientId: string) {
    return this.prisma.clientScreenType.findMany({
      where: { clientId },
      include: { screenType: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setForClient(clientId: string, dto: SetClientScreenTypesDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');

    const ids = [...new Set(dto.screenTypeIds)];
    if (ids.length > 0) {
      const found = await this.prisma.screenType.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw new NotFoundException('Um ou mais tipos de tela não existem');
      }
    }

    await this.prisma.$transaction([
      this.prisma.clientScreenType.deleteMany({ where: { clientId } }),
      ...(ids.length
        ? [
            this.prisma.clientScreenType.createMany({
              data: ids.map((screenTypeId) => ({ clientId, screenTypeId })),
            }),
          ]
        : []),
    ]);

    return this.listForClient(clientId);
  }
}
