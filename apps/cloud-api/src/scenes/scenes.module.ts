import { Module } from '@nestjs/common';
import { ScenesService } from './scenes.service';
import { ScenesController } from './scenes.controller';
import { HistoryModule } from '../history/history.module';

@Module({
  imports: [HistoryModule],
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}
