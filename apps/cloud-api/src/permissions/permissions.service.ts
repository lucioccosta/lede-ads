import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CLIENT_ROLES,
  PERMISSIONS,
  PERMISSION_KEYS,
  defaultPermissions,
} from './permissions.catalog';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class PermissionsService {
  private cache: { at: number; map: Map<UserRole, Set<string>> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async has(role: UserRole, permission: string): Promise<boolean> {
    if (role === UserRole.lede_admin) return true;
    const map = await this.load();
    return map.get(role)?.has(permission) ?? false;
  }

  async forRole(role: UserRole): Promise<string[]> {
    if (role === UserRole.lede_admin) return [...PERMISSION_KEYS];
    const map = await this.load();
    return [...(map.get(role) ?? [])];
  }

  async matrix() {
    const map = await this.load();
    const roles = Object.fromEntries(
      Object.values(UserRole).map((role) => [
        role,
        role === UserRole.lede_admin
          ? [...PERMISSION_KEYS]
          : [...(map.get(role) ?? [])],
      ]),
    );
    const defaults = Object.fromEntries(
      Object.values(UserRole).map((role) => [role, defaultPermissions(role)]),
    );
    return {
      catalog: PERMISSIONS.map(({ key, label, group, clientAssignable }) => ({
        key,
        label,
        group,
        clientAssignable,
      })),
      roles,
      defaults,
    };
  }

  async setForRole(role: UserRole, permissions: string[]) {
    if (role === UserRole.lede_admin) {
      throw new BadRequestException(
        'O perfil Administrador sempre tem todas as permissões',
      );
    }
    const unique = [...new Set(permissions)];
    const unknown = unique.filter((p) => !PERMISSION_KEYS.has(p));
    if (unknown.length) {
      throw new BadRequestException(
        `Permissões desconhecidas: ${unknown.join(', ')}`,
      );
    }
    if (CLIENT_ROLES.includes(role)) {
      const forbidden = unique.filter(
        (key) => !PERMISSIONS.find((p) => p.key === key)?.clientAssignable,
      );
      if (forbidden.length) {
        throw new BadRequestException(
          `Permissões exclusivas da equipe LEDE: ${forbidden.join(', ')}`,
        );
      }
    }

    await this.prisma.rolePermission.upsert({
      where: { role },
      create: { role, permissions: unique },
      update: { permissions: unique },
    });
    this.cache = null;
    return this.matrix();
  }

  async resetRole(role: UserRole) {
    await this.prisma.rolePermission.deleteMany({ where: { role } });
    this.cache = null;
    return this.matrix();
  }

  private async load(): Promise<Map<UserRole, Set<string>>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.map;
    }
    const rows = await this.prisma.rolePermission.findMany();
    const stored = new Map(rows.map((r) => [r.role, r.permissions]));
    const map = new Map<UserRole, Set<string>>();
    for (const role of Object.values(UserRole)) {
      const perms = stored.get(role) ?? defaultPermissions(role);
      map.set(role, new Set(perms.filter((p) => PERMISSION_KEYS.has(p))));
    }
    this.cache = { at: Date.now(), map };
    return map;
  }
}
