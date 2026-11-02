import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { CloseBatchDto } from './dto/close-batch.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('settlements')
@UseGuards(AuthGuard, RolesGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('simulate/:batchId')
  simulate(
    @CurrentCompanyId() companyId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.settlementsService.simulate(companyId, batchId);
  }

  @Post('close')
  @Roles(Role.ADMIN)
  closeBatch(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CloseBatchDto,
  ) {
    return this.settlementsService.closeBatch(companyId, dto);
  }

  @Patch('reopen/:batchId')
  @Roles(Role.ADMIN)
  reopenBatch(
    @CurrentCompanyId() companyId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.settlementsService.reopenBatch(companyId, batchId);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.settlementsService.findAll(companyId, batchId);
  }
}
