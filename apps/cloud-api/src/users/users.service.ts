import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateClientUserDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto/user.dto';

const SAFE_USER = {
  id: true,
  email: true,
  name: true,
  role: true,
  clientId: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listByClient(clientId: string) {
    return this.prisma.user.findMany({
      where: { clientId },
      select: SAFE_USER,
      orderBy: { name: 'asc' },
    });
  }

  async createForClient(clientId: string, dto: CreateClientUserDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        clientId,
        role:
          dto.role === 'client_viewer'
            ? UserRole.client_viewer
            : UserRole.client_approver,
      },
      select: SAFE_USER,
    });
  }

  async setPassword(id: string, dto: UpdateUserPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.clientId) {
      throw new BadRequestException(
        'Só é permitido redefinir senha de usuários de cliente/condomínio por aqui',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    return { ok: true };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.clientId) {
      throw new BadRequestException(
        'Só é permitido editar usuários de cliente/condomínio por aqui',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        active: dto.active,
        role:
          dto.role === undefined
            ? undefined
            : dto.role === 'client_viewer'
              ? UserRole.client_viewer
              : UserRole.client_approver,
      },
      select: SAFE_USER,
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.clientId) {
      throw new BadRequestException(
        'Só é permitido remover usuários de cliente/condomínio por aqui',
      );
    }
    if (
      user.role !== UserRole.client_approver &&
      user.role !== UserRole.client_viewer
    ) {
      throw new BadRequestException('Perfil de usuário inválido para remoção');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
