import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  isActingAsClient,
  resolveClientScope,
} from '../common/condo-access';

@Controller('history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

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
    if (isActingAsClient(user)) {
      if (!user.clientId) {
        throw new ForbiddenException('Usuário sem cliente vinculado');
      }
      return this.history.findAll(user.clientId);
    }
    return this.history.findAll(resolveClientScope(user, clientId));
  }
}
