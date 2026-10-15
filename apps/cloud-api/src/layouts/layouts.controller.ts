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
import { RequirePermission } from '../auth/permission.decorator';
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
  @RequirePermission('layouts.view')
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
  @RequirePermission('layouts.view')
  findOne(@Param('id') id: string) {
    return this.layouts.findOne(id);
  }

  @Post()
  @RequirePermission('layouts.manage')
  create(@Body() dto: CreateLayoutDto) {
    return this.layouts.create(dto);
  }

  @Patch(':id')
  @RequirePermission('layouts.manage')
  update(@Param('id') id: string, @Body() dto: UpdateLayoutDto) {
    return this.layouts.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('layouts.delete')
  remove(@Param('id') id: string) {
    return this.layouts.remove(id);
  }
}
