import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { EdgeService } from './edge.service';
import {
  AckCommandDto,
  HeartbeatDto,
  PairDeviceDto,
  ProofOfPlayDto,
  ScreenshotDto,
} from './dto/edge.dto';
import { StorageService } from '../storage/storage.service';
import {
  EdgeReleaseService,
  parseVersionCore,
} from '../devices/edge-release.service';

function clientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  const raw =
    (typeof xf === 'string' ? xf.split(',')[0] : undefined)?.trim() ||
    req.socket?.remoteAddress ||
    undefined;
  if (!raw) return undefined;
  // ::ffff:192.168.x.x → 192.168.x.x
  return raw.replace(/^::ffff:/, '');
}

@Controller('edge')
export class EdgeController {
  constructor(
    private readonly edge: EdgeService,
    private readonly storage: StorageService,
    private readonly releases: EdgeReleaseService,
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

  @Get('ticker')
  tickerFeed(@Headers('x-device-token') token?: string) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.getTicker(token);
  }

  @Post('heartbeat')
  heartbeat(
    @Headers('x-device-token') token: string | undefined,
    @Body() dto: HeartbeatDto,
    @Req() req: Request,
  ) {
    if (!token) throw new UnauthorizedException('Device token obrigatório');
    return this.edge.heartbeat(token, dto, clientIp(req));
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

  /**
   * Proxy do APK de OTA (GitHub ou pasta local).
   * Token opcional: Edge ≤0.5.13 não envia header — flavor vem da query.
   * O APK já é público no GitHub; o proxy só evita SSL/redirect nos boxes.
   */
  @Get('ota/apk')
  async otaApk(
    @Headers('x-device-token') token: string | undefined,
    @Query('v') version: string | undefined,
    @Query('flavor') flavorQuery: string | undefined,
    @Res() res: Response,
  ) {
    let flavor = flavorQuery?.trim() || 'prod';
    if (token) {
      const device = await this.edge.requireDeviceByToken(token);
      flavor = device.appFlavor || flavor;
    }
    const latest = await this.releases.resolveForFlavor(flavor);
    if (!latest) {
      throw new NotFoundException('Nenhum APK Edge disponível para este flavor');
    }
    const want = parseVersionCore(version);
    const have = parseVersionCore(latest.versionName);
    if (want && have && want !== have) {
      throw new NotFoundException(
        `APK v${want} não é o latest (atual ${have})`,
      );
    }

    if (latest.source === 'local') {
      return res.redirect(302, latest.apkUrl);
    }

    const headers: Record<string, string> = {
      Accept: 'application/octet-stream',
      'User-Agent': 'LEDE-Ads-Edge-OTA',
    };
    const ghToken = process.env.GITHUB_TOKEN?.trim();
    if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

    const upstream = await fetch(latest.apkUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(180_000),
    });
    if (!upstream.ok || !upstream.body) {
      throw new BadGatewayException(
        `Falha ao obter APK no GitHub (HTTP ${upstream.status})`,
      );
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.android.package-archive',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${latest.assetName}"`,
    );
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    await pipeline(
      Readable.fromWeb(
        upstream.body as import('stream/web').ReadableStream,
      ),
      res,
    );
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
