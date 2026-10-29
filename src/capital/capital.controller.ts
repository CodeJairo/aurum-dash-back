import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CapitalService } from './capital.service';
import { CreateCapitalMovementDto } from './dto/create-capital-movement.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('capital')
@UseGuards(AuthGuard, RolesGuard)
export class CapitalController {
  constructor(private readonly capitalService: CapitalService) {}

  @Get('balance')
  getBalance() {
    return this.capitalService.getBalance();
  }

  @Get('movements')
  getMovements(@Query('limit') limit?: string) {
    const num = limit ? parseInt(limit, 10) : 100;
    return this.capitalService.getMovements(num);
  }

  @Post('manual-movement')
  @Roles(Role.ADMIN)
  createManualMovement(@Body() dto: CreateCapitalMovementDto) {
    return this.capitalService.createManualMovement(dto);
  }
}
