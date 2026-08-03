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
import { Roles } from '../auth/roles.decorator';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findAll(@Query('clientId') clientId?: string) {
    return this.plans.findAll(clientId);
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findOne(@Param('id') id: string) {
    return this.plans.findOne(id);
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
