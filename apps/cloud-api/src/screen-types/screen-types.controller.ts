import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ScreenTypesService } from './screen-types.service';
import {
  CreateScreenTypeDto,
  SetClientScreenTypesDto,
  UpdateScreenTypeDto,
} from './dto/screen-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScreenTypesController {
  constructor(private readonly screenTypes: ScreenTypesService) {}

  @Get('screen-types')
  @RequirePermission('screen_types.view')
  findAll() {
    return this.screenTypes.findAll();
  }

  @Get('screen-types/:id')
  @RequirePermission('screen_types.view')
  findOne(@Param('id') id: string) {
    return this.screenTypes.findOne(id);
  }

  @Post('screen-types')
  @RequirePermission('screen_types.manage')
  create(@Body() dto: CreateScreenTypeDto) {
    return this.screenTypes.create(dto);
  }

  @Patch('screen-types/:id')
  @RequirePermission('screen_types.manage')
  update(@Param('id') id: string, @Body() dto: UpdateScreenTypeDto) {
    return this.screenTypes.update(id, dto);
  }

  @Delete('screen-types/:id')
  @RequirePermission('screen_types.delete')
  remove(@Param('id') id: string) {
    return this.screenTypes.remove(id);
  }

  @Get('clients/:clientId/screen-types')
  @RequirePermission('screen_types.view')
  listForClient(
    @Param('clientId') clientId: string,
    @CurrentUser() user: { role: string; clientId: string | null },
  ) {
    const id =
      user.role.startsWith('client_') && user.clientId
        ? user.clientId
        : clientId;
    return this.screenTypes.listForClient(id);
  }

  @Put('clients/:clientId/screen-types')
  @RequirePermission('screen_types.manage')
  setForClient(
    @Param('clientId') clientId: string,
    @Body() dto: SetClientScreenTypesDto,
  ) {
    return this.screenTypes.setForClient(clientId, dto);
  }
}
