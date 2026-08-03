import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('capacity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator')
  findAll() {
    return this.capacity.getAllCapacities();
  }

  @Get('groups/:id')
  @Roles('lede_admin', 'lede_operator')
  findOne(@Param('id') id: string) {
    return this.capacity.getGroupCapacity(id);
  }
}
