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
import { RequirePermission } from '../auth/permission.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('clients.view')
  findAll() {
    return this.clients.findAll();
  }

  @Get(':id')
  @RequirePermission('clients.view')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Post()
  @RequirePermission('clients.manage')
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  @RequirePermission('clients.manage')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('clients.delete')
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }
}
