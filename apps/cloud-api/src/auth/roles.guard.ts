import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    const permission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      targets,
    );
    if (!roles?.length && !permission) return true;

    const { user } = context.switchToHttp().getRequest<{
      user?: { role: UserRole };
    }>();
    if (!user) throw new ForbiddenException('Sem permissão');
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Sem permissão');
    }
    if (permission && !(await this.permissions.has(user.role, permission))) {
      throw new ForbiddenException('Sem permissão');
    }
    return true;
  }
}
