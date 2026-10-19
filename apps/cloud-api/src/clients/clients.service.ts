import { Injectable, NotFoundException } from '@nestjs/common';
import { Client, ClientKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { clientKindToIsCondo } from '../common/client-kind';

function normalizeClientName(name: string) {
  return name.trim().toLocaleUpperCase('pt-BR');
}

function resolveKind(dto: { kind?: ClientKind; isCondo?: boolean }): ClientKind {
  if (dto.kind) return dto.kind;
  if (dto.isCondo === true) return ClientKind.condo;
  if (dto.isCondo === false) return ClientKind.advertiser;
  return ClientKind.advertiser;
}

export function serializeClient<T extends Client>(client: T) {
  return {
    ...client,
    isCondo: clientKindToIsCondo(client.kind),
  };
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.client.findMany({ orderBy: { name: 'asc' } });
    return rows.map(serializeClient);
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return serializeClient(client);
  }

  async create(dto: CreateClientDto) {
    const { isCondo: _legacy, kind: _k, ...rest } = dto;
    const created = await this.prisma.client.create({
      data: {
        ...rest,
        kind: resolveKind(dto),
        name: normalizeClientName(dto.name),
      },
    });
    return serializeClient(created);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    const { isCondo: _legacy, kind: kindDto, ...rest } = dto;
    const kind =
      kindDto !== undefined || dto.isCondo !== undefined
        ? resolveKind(dto)
        : undefined;
    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        ...rest,
        ...(kind !== undefined ? { kind } : {}),
        ...(dto.name !== undefined
          ? { name: normalizeClientName(dto.name) }
          : {}),
      },
    });
    return serializeClient(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.client.delete({ where: { id } });
  }
}
