import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { EdgeReleaseService } from './edge-release.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, EdgeReleaseService],
  exports: [DevicesService, EdgeReleaseService],
})
export class DevicesModule {}
