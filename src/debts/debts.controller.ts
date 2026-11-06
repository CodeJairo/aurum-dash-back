import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, PaymentStatus } from '@prisma/client';
import { DebtsService } from './debts.service';
import { RegisterDebtMovementDto } from './dto/register-debt-movement.dto';
import { ToggleDebtStatusDto } from './dto/toggle-debt-status.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentCompanyId, CurrentUser } from '../auth/current-user.decorator';

@Controller('debts')
@UseGuards(AuthGuard, RolesGuard)
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get('summary')
  getSummary(@CurrentCompanyId() companyId: string) {
    return this.debtsService.getSummary(companyId);
  }

  @Get('payables')
  getPayables(
    @CurrentCompanyId() companyId: string,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.debtsService.getPayables(companyId, status);
  }

  @Get('receivables')
  getReceivables(
    @CurrentCompanyId() companyId: string,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.debtsService.getReceivables(companyId, status);
  }

  @Post('payables/:purchaseId/payment')
  @Roles(Role.ADMIN)
  registerPayablePayment(
    @CurrentCompanyId() companyId: string,
    @Param('purchaseId') purchaseId: string,
    @Body() dto: RegisterDebtMovementDto,
  ) {
    return this.debtsService.registerPayablePayment(companyId, purchaseId, dto);
  }

  @Post('receivables/:batchId/collection')
  @Roles(Role.ADMIN)
  registerReceivableCollection(
    @CurrentCompanyId() companyId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RegisterDebtMovementDto,
  ) {
    return this.debtsService.registerReceivableCollection(companyId, batchId, dto);
  }

  @Patch('payables/:purchaseId/toggle-status')
  @Roles(Role.ADMIN)
  togglePayableStatus(
    @CurrentCompanyId() companyId: string,
    @Param('purchaseId') purchaseId: string,
    @Body() dto: ToggleDebtStatusDto,
  ) {
    return this.debtsService.togglePayableStatus(companyId, purchaseId, dto);
  }

  @Patch('receivables/:batchId/toggle-status')
  @Roles(Role.ADMIN)
  toggleReceivableStatus(
    @CurrentCompanyId() companyId: string,
    @Param('batchId') batchId: string,
    @Body() dto: ToggleDebtStatusDto,
  ) {
    return this.debtsService.toggleReceivableStatus(companyId, batchId, dto);
  }

  @Post('payables/:purchaseId/send-to-debt')
  @Roles(Role.ADMIN)
  sendPurchaseToDebt(
    @CurrentCompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.debtsService.sendPurchaseToDebt(companyId, purchaseId, userId);
  }

  @Post('receivables/:batchId/send-to-debt')
  @Roles(Role.ADMIN)
  sendBatchToDebt(
    @CurrentCompanyId() companyId: string,
    @CurrentUser('id') userId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.debtsService.sendBatchToDebt(companyId, batchId, userId);
  }
}
