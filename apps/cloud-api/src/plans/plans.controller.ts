import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermission('plans.view')
  findAll(@Query('clientId') clientId?: string) {
    return this.plans.findAll(clientId);
  }

  @Get(':id')
  @RequirePermission('plans.view')
  findOne(@Param('id') id: string) {
    return this.plans.findOne(id);
  }

  @Post()
  @RequirePermission('plans.manage')
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  @RequirePermission('plans.manage')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('plans.delete')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
