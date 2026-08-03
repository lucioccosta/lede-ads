import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { isClientRole } from '../common/condo-access';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findAll(
    @Query('deviceId') deviceId: string | undefined,
    @CurrentUser() user: { role: string; clientId: string | null },
  ) {
    const clientId =
      isClientRole(user.role) && user.clientId ? user.clientId : undefined;
    return this.schedules.findAll(deviceId, clientId);
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { role: string; clientId: string | null },
  ) {
    const schedule = await this.schedules.findOne(id);
    if (isClientRole(user.role) && schedule.clientId !== user.clientId) {
      throw new ForbiddenException();
    }
    return schedule;
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedules.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.schedules.remove(id);
  }
}
