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
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { EdgeService } from './edge.service';
import {
  AckCommandDto,
  HeartbeatDto,
  PairDeviceDto,
  ProofOfPlayDto,
  ScreenshotDto,
} from './dto/edge.dto';

const screenshotsDir = join(process.cwd(), 'uploads', 'screenshots');

if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true });
}

@Controller('edge')
export class EdgeController {
  constructor(private readonly edge: EdgeService) {}

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
      storage: diskStorage({
        destination: screenshotsDir,
        filename: (_req, file, cb) => {
          const id = randomBytes(8).toString('hex');
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${id}${ext}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.startsWith('image/');
        cb(ok ? null : new BadRequestException('Arquivo inválido'), ok);
      },
    }),
  )
  screenshotUpload(
    @Headers('x-device-token') token: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    return this.edge.screenshotUpload(token, file.filename);
  }
}
