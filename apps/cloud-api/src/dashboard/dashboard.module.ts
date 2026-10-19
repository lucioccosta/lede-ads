import { Module } from '@nestjs/common';
import { CapacityModule } from '../capacity/capacity.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CapacityModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
