import { Module } from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeController } from './edge.controller';
import { CapacityModule } from '../capacity/capacity.module';
import { TickerModule } from '../ticker/ticker.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [CapacityModule, TickerModule, DevicesModule],
  controllers: [EdgeController],
  providers: [EdgeService],
})
export class EdgeModule {}
