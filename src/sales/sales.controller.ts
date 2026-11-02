import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('sales')
@UseGuards(AuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentCompanyId() companyId: string, @Body() dto: CreateSaleDto) {
    return this.salesService.create(companyId, dto);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.salesService.findAll(companyId, batchId);
  }

  @Get(':id')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.salesService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.salesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.salesService.remove(companyId, id);
  }
}
