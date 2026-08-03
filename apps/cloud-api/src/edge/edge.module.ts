import { Module } from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeController } from './edge.controller';
import { CapacityModule } from '../capacity/capacity.module';

@Module({
  imports: [CapacityModule],
  controllers: [EdgeController],
  providers: [EdgeService],
})
export class EdgeModule {}
