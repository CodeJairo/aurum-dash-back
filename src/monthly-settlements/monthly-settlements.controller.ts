import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { MonthlySettlementsService } from './monthly-settlements.service';
import { CreateMonthlySettlementDto } from './dto/create-monthly-settlement.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('monthly-settlements')
@UseGuards(AuthGuard, RolesGuard)
export class MonthlySettlementsController {
  constructor(
    private readonly monthlySettlementsService: MonthlySettlementsService,
  ) {}

  @Get('preview')
  preview(
    @CurrentCompanyId() companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.monthlySettlementsService.preview(companyId, startDate, endDate);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CreateMonthlySettlementDto,
    @Request() req: any,
  ) {
    return this.monthlySettlementsService.create(companyId, dto, req.user?.sub || req.user?.id);
  }

  @Get()
  findAll(@CurrentCompanyId() companyId: string) {
    return this.monthlySettlementsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.monthlySettlementsService.findOne(companyId, id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.monthlySettlementsService.remove(companyId, id);
  }
}
