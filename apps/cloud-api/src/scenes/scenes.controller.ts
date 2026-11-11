import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ScenesService } from './scenes.service';
import {
  CreateSceneDto,
  UpdateSceneDto,
  UpsertCondoNoticeDto,
} from './dto/scene.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertClientCanUseLayout,
  isActingAsClient,
  isClientRole,
  requireCondoClient,
  resolveClientScope,
} from '../common/condo-access';
import { HistoryService } from '../history/history.service';

@Controller('scenes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScenesController {
  constructor(
    private readonly scenes: ScenesService,
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  @Get()
  @RequirePermission('scenes.view')
  findAll(
    @Query('clientId') clientId: string | undefined,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    return this.scenes.findAll(resolveClientScope(user, clientId));
  }

  /** Lista avisos condo (grupo + telas) com playlist e tamanhos ideais. */
  @Get('condo/notices')
  @RequirePermission('scenes.view')
  async listCondoNotices(
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const client = await requireCondoClient(this.prisma, user);
    return this.scenes.listCondoNotices(client.id);
  }

  /** Upsert aviso Stories para grupo ou tela. */
  @Put('condo/notices')
  @RequirePermission('scenes.edit')
  async upsertCondoNotice(
    @Body() dto: UpsertCondoNoticeDto,
    @CurrentUser() user: {
      userId: string;
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const client = await requireCondoClient(this.prisma, user);
    const result = await this.scenes.upsertCondoNotice(client.id, dto);
    await this.history.create({
      clientId: client.id,
      userId: user.userId,
      action: 'condo_media_changed',
      summary: `Aviso atualizado (${dto.mediaIds.length} story(ies))`,
      detailsJson: {
        groupId: dto.groupId ?? null,
        deviceId: dto.deviceId ?? null,
        mediaIds: dto.mediaIds,
        durationMs: dto.durationMs ?? 10000,
      },
    });
    return result;
  }

  /** Cena ativa do condomínio (compat). */
  @Get('condo/active')
  @RequirePermission('scenes.view')
  async activeCondoScene(
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const client = await requireCondoClient(this.prisma, user);
    const { notices } = await this.scenes.listCondoNotices(client.id);
    const first = notices[0];
    if (!first) {
      return { schedule: null, scene: null };
    }
    const scene = await this.scenes.findOne(first.sceneId);
    return {
      schedule: {
        id: first.scheduleId,
        name: first.name,
        device: first.device,
        group: first.group,
        groupId: first.groupId,
        deviceId: first.deviceId,
      },
      scene,
    };
  }

  @Get(':id')
  @RequirePermission('scenes.view')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { role: string; clientId: string | null },
  ) {
    const scene = await this.scenes.findOne(id);
    if (isClientRole(user.role) && scene.clientId !== user.clientId) {
      throw new ForbiddenException();
    }
    return scene;
  }

  @Post()
  @RequirePermission('scenes.create')
  create(@Body() dto: CreateSceneDto) {
    return this.scenes.create(dto);
  }

  @Patch(':id')
  @RequirePermission('scenes.edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSceneDto,
    @CurrentUser() user: {
      userId: string;
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const scene = await this.scenes.findOne(id);
    if (isActingAsClient(user)) {
      const client = await requireCondoClient(this.prisma, user);
      if (scene.clientId !== client.id) throw new ForbiddenException();

      const active = await this.prisma.schedule.findFirst({
        where: {
          clientId: client.id,
          channel: 'condo_notice',
          active: true,
          sceneId: id,
          scene: { active: true },
        },
      });
      if (!active) {
        throw new ForbiddenException(
          'Só é permitido alterar a mídia da cena ativa do condomínio',
        );
      }

      const { condoKeys } = await assertClientCanUseLayout(
        this.prisma,
        client.id,
        scene.layoutId,
      );
      if (!dto.zones?.length) {
        throw new ForbiddenException('Informe a mídia da zona do condomínio');
      }
      const condoUpdates = dto.zones.filter((z) => condoKeys.has(z.zoneKey));
      if (condoUpdates.length === 0) {
        throw new ForbiddenException('Nenhuma zona de condomínio válida');
      }

      type ZonePatch = {
        mediaId: string | null;
        items?: Array<{ mediaId: string; durationMs?: number }>;
      };
      const byKey = new Map<string, ZonePatch>(
        scene.zones.map((z) => [
          z.zoneKey,
          {
            mediaId: z.mediaId ?? null,
            items: z.items?.map((it) => ({
              mediaId: it.mediaId,
              durationMs: it.durationMs,
            })),
          },
        ]),
      );
      for (const z of condoUpdates) {
        byKey.set(z.zoneKey, {
          mediaId: z.mediaId ?? z.items?.[0]?.mediaId ?? null,
          items: z.items,
        });
      }
      const zones = [...byKey.entries()].map(([zoneKey, val]) => ({
        zoneKey,
        mediaId: val.mediaId,
        items: val.items,
      }));
      const updated = await this.scenes.update(id, {
        zones,
        durationMs: dto.durationMs,
      });

      await this.history.create({
        clientId: client.id,
        userId: user.userId,
        action: 'condo_media_changed',
        summary: 'Aviso do condomínio atualizado',
        detailsJson: {
          sceneId: scene.id,
          sceneName: scene.name,
          scheduleId: active.id,
          mediaIds: condoUpdates.flatMap(
            (z) => z.items?.map((i) => i.mediaId) ?? (z.mediaId ? [z.mediaId] : []),
          ),
        },
      });

      return updated;
    }
    return this.scenes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('scenes.delete')
  remove(@Param('id') id: string) {
    return this.scenes.remove(id);
  }
}
