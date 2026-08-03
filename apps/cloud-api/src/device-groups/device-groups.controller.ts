import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DeviceGroupsService } from './device-groups.service';
import {
  CreateDeviceGroupDto,
  UpdateDeviceGroupDto,
} from './dto/device-group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('device-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceGroupsController {
  constructor(private readonly groups: DeviceGroupsService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator')
  findAll() {
    return this.groups.findAll();
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator')
  findOne(@Param('id') id: string) {
    return this.groups.findOne(id);
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateDeviceGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
