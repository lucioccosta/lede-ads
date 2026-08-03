import { Module } from '@nestjs/common';
import { ScreenTypesController } from './screen-types.controller';
import { ScreenTypesService } from './screen-types.service';

@Module({
  controllers: [ScreenTypesController],
  providers: [ScreenTypesService],
  exports: [ScreenTypesService],
})
export class ScreenTypesModule {}
