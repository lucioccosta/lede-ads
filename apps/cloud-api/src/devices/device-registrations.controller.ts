import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeviceRegistrationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeviceRegistrationsService } from './device-registrations.service';
import {
  ApproveRegistrationDto,
  RejectRegistrationDto,
} from './dto/device-registration.dto';

/** Boxes que se registraram sozinhos e aguardam decisão da LEDE. */
@Controller('device-registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceRegistrationsController {
  constructor(private readonly registrations: DeviceRegistrationsService) {}

  @Get()
  @RequirePermission('devices.view')
  list(@Query('status') status?: string) {
    const valid = Object.values(DeviceRegistrationStatus) as string[];
    return this.registrations.list(
      status && valid.includes(status)
        ? (status as DeviceRegistrationStatus)
        : undefined,
    );
  }

  @Post(':id/approve')
  @RequirePermission('devices.manage')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRegistrationDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.registrations.approve(id, dto, user.userId);
  }

  @Post(':id/reject')
  @RequirePermission('devices.manage')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRegistrationDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.registrations.reject(id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('devices.manage')
  remove(@Param('id') id: string) {
    return this.registrations.remove(id);
  }
}
