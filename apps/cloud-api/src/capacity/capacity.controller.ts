import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';

@Controller('capacity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get()
  @RequirePermission('capacity.view')
  findAll() {
    return this.capacity.getAllCapacities();
  }

  @Get('groups/:id')
  @RequirePermission('capacity.view')
  findOne(@Param('id') id: string) {
    return this.capacity.getGroupCapacity(id);
  }
}
