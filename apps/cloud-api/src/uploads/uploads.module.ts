import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { VideoProcessService } from './video-process.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [VideoProcessService],
})
export class UploadsModule {}
