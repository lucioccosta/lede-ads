import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EdgeService } from './edge.service';
import {
  AckCommandDto,
  HeartbeatDto,
  PairDeviceDto,
  ProofOfPlayDto,
  ScreenshotDto,
} from './dto/edge.dto';
import { StorageService } from '../storage/storage.service';

@Controller('edge')
export class EdgeController {
  constructor(
    private readonly edge: EdgeService,
    private readonly storage: StorageService,
  ) {}

  @Post('pair')
  pair(@Body() dto: PairDeviceDto) {
    return this.edge.pair(dto);
  }

  @Get('sync')
  sync(@Headers('x-device-token') token?: string) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.sync(token);
  }

  @Post('heartbeat')
  heartbeat(
    @Headers('x-device-token') token: string | undefined,
    @Body() dto: HeartbeatDto,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.heartbeat(token, dto);
  }

  @Post('commands/:id/ack')
  ackCommand(
    @Headers('x-device-token') token: string | undefined,
    @Param('id') id: string,
    @Body() dto: AckCommandDto,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.ackCommand(token, id, dto);
  }

  @Post('proof-of-play')
  proof(
    @Headers('x-device-token') token: string | undefined,
    @Body() dto: ProofOfPlayDto,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.proofOfPlay(token, dto);
  }

  @Post('screenshot')
  screenshot(
    @Headers('x-device-token') token: string | undefined,
    @Body() dto: ScreenshotDto,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.screenshot(token, dto);
  }

  @Post('screenshot-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.startsWith('image/');
        cb(ok ? null : new BadRequestException('Arquivo inválido'), ok);
      },
    }),
  )
  async screenshotUpload(
    @Headers('x-device-token') token: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    const stored = await this.storage.putMulterFile(file, 'screenshots');
    return this.edge.screenshotUpload(token, stored.url);
  }
}
