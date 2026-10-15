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
import { UsersService } from './users.service';
import {
  CreateClientUserDto,
  CreateTeamUserDto,
  UpdateTeamUserDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('clients/:clientId/users')
  @RequirePermission('client_users.manage')
  listByClient(@Param('clientId') clientId: string) {
    return this.users.listByClient(clientId);
  }

  @Post('clients/:clientId/users')
  @RequirePermission('client_users.manage')
  createForClient(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientUserDto,
  ) {
    return this.users.createForClient(clientId, dto);
  }

  @Patch('users/:id/password')
  @RequirePermission('client_users.manage')
  setPassword(@Param('id') id: string, @Body() dto: UpdateUserPasswordDto) {
    return this.users.setPassword(id, dto);
  }

  @Patch('users/:id')
  @RequirePermission('client_users.manage')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete('users/:id')
  @RequirePermission('client_users.manage')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }

  @Get('team/users')
  @Roles('lede_admin')
  listTeam() {
    return this.users.listTeam();
  }

  @Post('team/users')
  @Roles('lede_admin')
  createTeamUser(@Body() dto: CreateTeamUserDto) {
    return this.users.createTeamUser(dto);
  }

  @Patch('team/users/:id/password')
  @Roles('lede_admin')
  setTeamPassword(
    @Param('id') id: string,
    @Body() dto: UpdateUserPasswordDto,
  ) {
    return this.users.setTeamPassword(id, dto);
  }

  @Patch('team/users/:id')
  @Roles('lede_admin')
  updateTeamUser(
    @Param('id') id: string,
    @Body() dto: UpdateTeamUserDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.users.updateTeamUser(id, dto, actor.userId);
  }

  @Delete('team/users/:id')
  @Roles('lede_admin')
  removeTeamUser(
    @Param('id') id: string,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.users.removeTeamUser(id, actor.userId);
  }
}
