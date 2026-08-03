import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes, createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { publicBaseUrl } from '../common/public-url';
import { isActingAsClient, requireClientId } from '../common/condo-access';

const uploadsDir = join(process.cwd(), 'uploads');

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  @Post()
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (_req, file, cb) => {
          const id = randomBytes(8).toString('hex');
          cb(null, `${id}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/');
        cb(ok ? null : new BadRequestException('Arquivo inválido'), ok);
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    if (isActingAsClient(user)) {
      requireClientId(user);
    }
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    const checksum = createHash('sha256')
      .update(`${file.filename}:${file.size}`)
      .digest('hex');
    const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
    return {
      url: `${publicBaseUrl()}/uploads/${file.filename}`,
      mimeType: file.mimetype,
      fileSize: file.size,
      checksum,
      type,
      originalName: file.originalname,
    };
  }
}
