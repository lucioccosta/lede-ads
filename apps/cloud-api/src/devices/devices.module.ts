import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { EdgeReleaseService } from './edge-release.service';
import { DeviceRegistrationsService } from './device-registrations.service';
import { DeviceRegistrationsController } from './device-registrations.controller';

@Module({
  controllers: [DevicesController, DeviceRegistrationsController],
  providers: [DevicesService, EdgeReleaseService, DeviceRegistrationsService],
  exports: [DevicesService, EdgeReleaseService, DeviceRegistrationsService],
})
export class DevicesModule {}
