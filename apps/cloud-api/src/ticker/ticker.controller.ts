import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TickerService } from './ticker.service';

class UpdateTickerConfigDto {
  @IsArray()
  @IsString({ each: true })
  enabledKeys!: string[];
}

@Controller('ticker')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TickerController {
  constructor(private readonly ticker: TickerService) {}

  @Get('config')
  @Roles('lede_admin', 'lede_operator')
  getConfig() {
    return this.ticker.getConfig();
  }

  @Put('config')
  @Roles('lede_admin', 'lede_operator')
  setConfig(@Body() body: UpdateTickerConfigDto) {
    return this.ticker.setConfig(body.enabledKeys ?? []);
  }
}
