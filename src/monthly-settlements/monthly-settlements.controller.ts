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

@Controller('monthly-settlements')
@UseGuards(AuthGuard, RolesGuard)
export class MonthlySettlementsController {
  constructor(
    private readonly monthlySettlementsService: MonthlySettlementsService,
  ) {}

  @Get('preview')
  preview(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.monthlySettlementsService.preview(startDate, endDate);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateMonthlySettlementDto, @Request() req: any) {
    return this.monthlySettlementsService.create(dto, req.user?.sub || req.user?.id);
  }

  @Get()
  findAll() {
    return this.monthlySettlementsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.monthlySettlementsService.findOne(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.monthlySettlementsService.remove(id);
  }
}
