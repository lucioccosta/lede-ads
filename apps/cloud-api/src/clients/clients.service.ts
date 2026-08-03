import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

function normalizeClientName(name: string) {
  return name.trim().toLocaleUpperCase('pt-BR');
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  create(dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        ...dto,
        name: normalizeClientName(dto.name),
      },
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.name !== undefined
          ? { name: normalizeClientName(dto.name) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.client.delete({ where: { id } });
  }
}
