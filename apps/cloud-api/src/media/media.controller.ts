import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MediaService } from './media.service';
import {
  CreateMediaDto,
  ReviewMediaDto,
  UpdateMediaDto,
} from './dto/media.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  isActingAsClient,
  requireClientId,
  resolveClientScope,
} from '../common/condo-access';
import { HistoryService } from '../history/history.service';

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly history: HistoryService,
  ) {}

  @Get()
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findAll(
    @Query('clientId') clientId: string | undefined,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    return this.media.findAll(resolveClientScope(user, clientId));
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const item = await this.media.findOne(id);
    if (isActingAsClient(user) && item.clientId !== user.clientId) {
      throw new ForbiddenException();
    }
    return item;
  }

  @Post()
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  async create(
    @Body() dto: CreateMediaDto,
    @CurrentUser() user: {
      userId: string;
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    if (isActingAsClient(user)) {
      const clientId = requireClientId(user);
      const created = await this.media.create({
        ...dto,
        clientId,
      });
      await this.history.create({
        clientId,
        userId: user.userId,
        action: 'media_uploaded',
        summary: `Mídia enviada: “${created.name}”`,
        detailsJson: {
          mediaId: created.id,
          mediaName: created.name,
          mediaUrl: created.url,
          mediaType: created.type,
        },
      });
      return created;
    }
    return this.media.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const item = await this.media.findOne(id);
    if (isActingAsClient(user)) {
      requireClientId(user);
      if (item.clientId !== user.clientId) throw new ForbiddenException();
    }
    return this.media.update(id, dto);
  }

  @Post(':id/submit')
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const item = await this.media.findOne(id);
    if (isActingAsClient(user)) {
      requireClientId(user);
      if (item.clientId !== user.clientId) throw new ForbiddenException();
    }
    return this.media.submit(id);
  }

  @Post(':id/review')
  @Roles('lede_admin', 'lede_operator', 'client_approver')
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewMediaDto,
    @CurrentUser() user: {
      userId: string;
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const item = await this.media.findOne(id);
    if (isActingAsClient(user)) {
      if (item.clientId !== user.clientId) throw new ForbiddenException();
    }
    const reviewed = await this.media.review(id, dto);
    if (item.clientId) {
      await this.history.create({
        clientId: item.clientId,
        userId: user.userId,
        action: 'media_reviewed',
        summary: dto.approved
          ? `Mídia aprovada: “${item.name}”`
          : `Mídia rejeitada: “${item.name}”`,
        detailsJson: {
          mediaId: item.id,
          mediaName: item.name,
          mediaUrl: item.url,
          approved: dto.approved,
          note: dto.note ?? null,
        },
      });
    }
    return reviewed;
  }
}
