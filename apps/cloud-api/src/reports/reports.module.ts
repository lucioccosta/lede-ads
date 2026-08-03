import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
