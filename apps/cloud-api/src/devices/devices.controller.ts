import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import {
  BatchCreateDevicesDto,
  BatchTimezoneDto,
  CreateDeviceCommandDto,
  CreateDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermission('devices.view')
  findAll() {
    return this.devices.findAll();
  }

  @Get('mine')
  @RequirePermission('devices.mine')
  mine(@CurrentUser() user: { clientId: string | null }) {
    if (!user.clientId) throw new ForbiddenException('Cliente não vinculado');
    return this.devices.findForClient(user.clientId);
  }

  @Get('monitoring')
  @RequirePermission('devices.view')
  monitoring() {
    return this.devices.monitoring();
  }

  @Get('edge-releases')
  @RequirePermission('devices.view')
  edgeReleases() {
    return this.devices.listEdgeReleases();
  }

  @Post('timezone/batch')
  @RequirePermission('devices.manage')
  batchTimezone(@Body() dto: BatchTimezoneDto) {
    return this.devices.batchTimezone(dto);
  }

  @Post('pairing/create')
  @RequirePermission('devices.manage')
  createPairing(@Body() dto: CreateDeviceDto) {
    return this.devices.createPairing(dto);
  }

  @Post('pairing/batch')
  @RequirePermission('devices.manage')
  createBatch(@Body() dto: BatchCreateDevicesDto) {
    return this.devices.createBatch(dto);
  }

  @Post(':id/pairing/reset')
  @RequirePermission('devices.manage')
  resetPairing(@Param('id') id: string) {
    return this.devices.resetPairing(id);
  }

  @Get(':id/commands')
  @RequirePermission('devices.view')
  listCommands(@Param('id') id: string) {
    return this.devices.listCommands(id);
  }

  @Post(':id/commands')
  @RequirePermission('devices.manage')
  enqueueCommand(
    @Param('id') id: string,
    @Body() dto: CreateDeviceCommandDto,
  ) {
    return this.devices.enqueueCommand(id, dto);
  }

  @Get(':id')
  @RequirePermission('devices.view')
  findOne(@Param('id') id: string) {
    return this.devices.findOne(id);
  }

  @Post()
  @RequirePermission('devices.manage')
  create(@Body() dto: CreateDeviceDto) {
    return this.devices.create(dto);
  }

  @Patch(':id')
  @RequirePermission('devices.manage')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('devices.delete')
  remove(@Param('id') id: string) {
    return this.devices.remove(id);
  }
}
