import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsService } from './permissions.service';

class SetRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

function parseRole(role: string): UserRole {
  if (!(Object.values(UserRole) as string[]).includes(role)) {
    throw new BadRequestException('Perfil inválido');
  }
  return role as UserRole;
}

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('lede_admin')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  matrix() {
    return this.permissions.matrix();
  }

  @Put(':role')
  setForRole(@Param('role') role: string, @Body() dto: SetRolePermissionsDto) {
    return this.permissions.setForRole(parseRole(role), dto.permissions);
  }

  @Delete(':role')
  reset(@Param('role') role: string) {
    return this.permissions.resetRole(parseRole(role));
  }
}
