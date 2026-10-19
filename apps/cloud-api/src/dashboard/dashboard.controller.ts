import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Agregado leve para a Visão geral (evita 9 listagens pesadas no client). */
  @Get('overview')
  @Roles(UserRole.lede_admin, UserRole.lede_operator)
  overview() {
    return this.dashboard.overview();
  }
}
