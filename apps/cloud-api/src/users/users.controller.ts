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
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('clients/:clientId/users')
  @Roles('lede_admin', 'lede_operator')
  listByClient(@Param('clientId') clientId: string) {
    return this.users.listByClient(clientId);
  }

  @Post('clients/:clientId/users')
  @Roles('lede_admin', 'lede_operator')
  createForClient(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientUserDto,
  ) {
    return this.users.createForClient(clientId, dto);
  }

  @Patch('users/:id/password')
  @Roles('lede_admin', 'lede_operator')
  setPassword(@Param('id') id: string, @Body() dto: UpdateUserPasswordDto) {
    return this.users.setPassword(id, dto);
  }

  @Patch('users/:id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete('users/:id')
  @Roles('lede_admin', 'lede_operator')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
