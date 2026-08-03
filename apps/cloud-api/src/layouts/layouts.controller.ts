import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LayoutsService } from './layouts.service';
import { CreateLayoutDto, UpdateLayoutDto } from './dto/layout.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { isActingAsClient, requireClientId } from '../common/condo-access';

@Controller('layouts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LayoutsController {
  constructor(
    private readonly layouts: LayoutsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  async findAll(
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    if (isActingAsClient(user)) {
      const clientId = requireClientId(user);
      const allowed = await this.prisma.clientScreenType.findMany({
        where: { clientId },
        select: { screenTypeId: true },
      });
      const ids = allowed.map((a) => a.screenTypeId);
      return this.prisma.layout.findMany({
        where: { screenTypeId: { in: ids } },
        orderBy: { name: 'asc' },
        include: {
          screenTypeRef: {
            select: { id: true, name: true, mode: true, slug: true },
          },
        },
      });
    }
    return this.layouts.findAll();
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findOne(@Param('id') id: string) {
    return this.layouts.findOne(id);
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateLayoutDto) {
    return this.layouts.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateLayoutDto) {
    return this.layouts.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.layouts.remove(id);
  }
}
