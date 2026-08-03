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
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator')
  findAll() {
    return this.devices.findAll();
  }

  @Get('mine')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  mine(@CurrentUser() user: { clientId: string | null }) {
    if (!user.clientId) throw new ForbiddenException('Cliente não vinculado');
    return this.devices.findForClient(user.clientId);
  }

  @Get('monitoring')
  @Roles('lede_admin', 'lede_operator')
  monitoring() {
    return this.devices.monitoring();
  }

  @Post('timezone/batch')
  @Roles('lede_admin', 'lede_operator')
  batchTimezone(@Body() dto: BatchTimezoneDto) {
    return this.devices.batchTimezone(dto);
  }

  @Post('pairing/create')
  @Roles('lede_admin', 'lede_operator')
  createPairing(@Body() dto: CreateDeviceDto) {
    return this.devices.createPairing(dto);
  }

  @Post('pairing/batch')
  @Roles('lede_admin', 'lede_operator')
  createBatch(@Body() dto: BatchCreateDevicesDto) {
    return this.devices.createBatch(dto);
  }

  @Post(':id/pairing/reset')
  @Roles('lede_admin', 'lede_operator')
  resetPairing(@Param('id') id: string) {
    return this.devices.resetPairing(id);
  }

  @Get(':id/commands')
  @Roles('lede_admin', 'lede_operator')
  listCommands(@Param('id') id: string) {
    return this.devices.listCommands(id);
  }

  @Post(':id/commands')
  @Roles('lede_admin', 'lede_operator')
  enqueueCommand(
    @Param('id') id: string,
    @Body() dto: CreateDeviceCommandDto,
  ) {
    return this.devices.enqueueCommand(id, dto);
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator')
  findOne(@Param('id') id: string) {
    return this.devices.findOne(id);
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateDeviceDto) {
    return this.devices.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin', 'lede_operator')
  remove(@Param('id') id: string) {
    return this.devices.remove(id);
  }
}
