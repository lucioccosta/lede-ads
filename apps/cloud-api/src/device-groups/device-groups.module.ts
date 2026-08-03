import { Module } from '@nestjs/common';
import { DeviceGroupsService } from './device-groups.service';
import { DeviceGroupsController } from './device-groups.controller';
import { CapacityModule } from '../capacity/capacity.module';

@Module({
  imports: [CapacityModule],
  controllers: [DeviceGroupsController],
  providers: [DeviceGroupsService],
  exports: [DeviceGroupsService],
})
export class DeviceGroupsModule {}
