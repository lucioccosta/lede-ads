import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { resolveClientScope } from '../common/condo-access';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly media: MediaService) {}

  @Get('sampling')
  @RequirePermission('reports.view')
  sampling(
    @Query('clientId') clientId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: {
      role: string;
      clientId: string | null;
      actingAsClient?: boolean;
    },
  ) {
    return this.media.samplingReport(
      resolveClientScope(user, clientId),
      from,
      to,
    );
  }
}
