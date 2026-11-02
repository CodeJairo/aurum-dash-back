import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import {
  SiigoService,
  SiigoTestResult,
  SiigoSyncReceiptResult,
  SiigoImportCustomersResult,
  SiigoImportPurchasesResult,
} from './siigo.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('siigo')
@UseGuards(AuthGuard, RolesGuard)
export class SiigoController {
  constructor(private readonly siigoService: SiigoService) {}

  @Get('test-connection')
  @Roles(Role.ADMIN)
  async testConnection(@CurrentCompanyId() companyId: string): Promise<SiigoTestResult> {
    return this.siigoService.testConnection(companyId);
  }

  @Post('purchases/:id/sync')
  @Roles(Role.ADMIN)
  async syncPurchaseReceipt(
    @CurrentCompanyId() companyId: string,
    @Param('id') purchaseId: string,
  ): Promise<SiigoSyncReceiptResult> {
    return this.siigoService.syncPurchaseReceipt(purchaseId, companyId);
  }

  @Post('import-barequeros')
  @Roles(Role.ADMIN)
  async importBarequeros(@CurrentCompanyId() companyId: string): Promise<SiigoImportCustomersResult> {
    return this.siigoService.importBarequerosFromSiigo(companyId);
  }

  @Post('import-purchases')
  @Roles(Role.ADMIN)
  async importPurchases(@CurrentCompanyId() companyId: string): Promise<SiigoImportPurchasesResult> {
    return this.siigoService.importPurchasesFromSiigo(companyId);
  }
}
