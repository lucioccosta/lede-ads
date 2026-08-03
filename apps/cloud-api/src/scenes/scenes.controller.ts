import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ScenesService } from './scenes.service';
import { CreateSceneDto, UpdateSceneDto } from './dto/scene.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
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
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
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

  /** Cena ativa do condomínio (agenda condo de maior prioridade). */
  @Get('condo/active')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  async activeCondoScene(
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    const client = await requireCondoClient(this.prisma, user);
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        clientId: client.id,
        channel: 'condo',
        active: true,
        scene: { active: true },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      include: {
        device: { select: { id: true, name: true } },
        scene: {
          include: {
            layout: true,
            zones: { include: { media: true } },
          },
        },
      },
    });
    if (!schedule) return null;
    return {
      schedule: {
        id: schedule.id,
        name: schedule.name,
        device: schedule.device,
      },
      scene: schedule.scene,
    };
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
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
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateSceneDto) {
    return this.scenes.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator', 'client_approver')
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

      // Condomínio só pode trocar mídia das zonas condo da cena ativa
      const active = await this.prisma.schedule.findFirst({
        where: {
          clientId: client.id,
          channel: 'condo',
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
      // Preserva zonas de ads / outras — só troca mídia das zonas condo
      const byKey = new Map<string, string | null>(
        scene.zones.map((z) => [z.zoneKey, z.mediaId ?? null]),
      );
      const previousCondo = condoUpdates.map((z) => ({
        zoneKey: z.zoneKey,
        mediaId: byKey.get(z.zoneKey) ?? null,
      }));
      for (const z of condoUpdates) {
        byKey.set(z.zoneKey, z.mediaId ?? null);
      }
      const zones = [...byKey.entries()].map(([zoneKey, mediaId]) => ({
        zoneKey,
        mediaId,
      }));
      const updated = await this.scenes.update(id, { zones });

      const newMediaId = condoUpdates[0]?.mediaId ?? null;
      const oldMediaId = previousCondo[0]?.mediaId ?? null;
      const mediaIds = [oldMediaId, newMediaId].filter(
        (v): v is string => Boolean(v),
      );
      const medias = mediaIds.length
        ? await this.prisma.media.findMany({
            where: { id: { in: mediaIds } },
            select: { id: true, name: true, url: true },
          })
        : [];
      const byId = new Map(medias.map((m) => [m.id, m]));
      const from = oldMediaId ? byId.get(oldMediaId) : null;
      const to = newMediaId ? byId.get(newMediaId) : null;

      await this.history.create({
        clientId: client.id,
        userId: user.userId,
        action: 'condo_media_changed',
        summary: to
          ? `Aviso atualizado para “${to.name}”`
          : 'Aviso do condomínio atualizado',
        detailsJson: {
          sceneId: scene.id,
          sceneName: scene.name,
          scheduleId: active.id,
          fromMediaId: oldMediaId,
          fromMediaName: from?.name ?? null,
          fromMediaUrl: from?.url ?? null,
          toMediaId: newMediaId,
          toMediaName: to?.name ?? null,
          toMediaUrl: to?.url ?? null,
        },
      });

      return updated;
    }
    return this.scenes.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.scenes.remove(id);
  }
}
