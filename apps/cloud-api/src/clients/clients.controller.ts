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
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles('lede_admin', 'lede_operator')
  findAll() {
    return this.clients.findAll();
  }

  @Get(':id')
  @Roles('lede_admin', 'lede_operator')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Post()
  @Roles('lede_admin', 'lede_operator')
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  @Roles('lede_admin', 'lede_operator')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Delete(':id')
  @Roles('lede_admin')
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }
}
