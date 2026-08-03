import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { isActingAsClient, requireClientId } from '../common/condo-access';
import { StorageService } from '../storage/storage.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/');
        cb(ok ? null : new BadRequestException('Arquivo inválido'), ok);
      },
    }),
  )
  async upload(
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

    const stored = await this.storage.putMulterFile(file, 'media');
    const type = file.mimetype.startsWith('video/') ? 'video' : 'image';

    return {
      url: stored.url,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      checksum: stored.checksum,
      type,
      originalName: file.originalname,
      key: stored.key,
    };
  }
}
