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
import { RequirePermission } from '../auth/permission.decorator';

@Controller('device-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceGroupsController {
  constructor(private readonly groups: DeviceGroupsService) {}

  @Get()
  @RequirePermission('device_groups.view')
  findAll() {
    return this.groups.findAll();
  }

  @Get(':id')
  @RequirePermission('device_groups.view')
  findOne(@Param('id') id: string) {
    return this.groups.findOne(id);
  }

  @Post()
  @RequirePermission('device_groups.manage')
  create(@Body() dto: CreateDeviceGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @RequirePermission('device_groups.manage')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('device_groups.delete')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
