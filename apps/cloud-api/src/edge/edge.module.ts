import { Module } from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeController } from './edge.controller';
import { CapacityModule } from '../capacity/capacity.module';
import { TickerModule } from '../ticker/ticker.module';

@Module({
  imports: [CapacityModule, TickerModule],
  controllers: [EdgeController],
  providers: [EdgeService],
})
export class EdgeModule {}
