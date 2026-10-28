import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CapitalService } from './capital.service';
import { CreateCapitalMovementDto } from './dto/create-capital-movement.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('capital')
@UseGuards(AuthGuard)
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
  createManualMovement(@Body() dto: CreateCapitalMovementDto) {
    return this.capitalService.createManualMovement(dto);
  }
}
