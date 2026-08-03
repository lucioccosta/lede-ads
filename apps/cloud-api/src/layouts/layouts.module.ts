import { Module } from '@nestjs/common';
import { LayoutsService } from './layouts.service';
import { LayoutsController } from './layouts.controller';

@Module({
  controllers: [LayoutsController],
  providers: [LayoutsService],
  exports: [LayoutsService],
})
export class LayoutsModule {}
