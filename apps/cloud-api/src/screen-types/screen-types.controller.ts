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
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScreenTypesController {
  constructor(private readonly screenTypes: ScreenTypesService) {}

  @Get('screen-types')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
  findAll() {
    return this.screenTypes.findAll();
  }

  @Get('screen-types/:id')
  @Roles('lede_admin', 'lede_operator')
  findOne(@Param('id') id: string) {
    return this.screenTypes.findOne(id);
  }

  @Post('screen-types')
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateScreenTypeDto) {
    return this.screenTypes.create(dto);
  }

  @Patch('screen-types/:id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateScreenTypeDto) {
    return this.screenTypes.update(id, dto);
  }

  @Delete('screen-types/:id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.screenTypes.remove(id);
  }

  @Get('clients/:clientId/screen-types')
  @Roles('lede_admin', 'lede_operator', 'client_viewer', 'client_approver')
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
  @Roles('lede_admin', 'lede_operator')
  setForClient(
    @Param('clientId') clientId: string,
    @Body() dto: SetClientScreenTypesDto,
  ) {
    return this.screenTypes.setForClient(clientId, dto);
  }
}
