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

@Controller('siigo')
@UseGuards(AuthGuard, RolesGuard)
export class SiigoController {
  constructor(private readonly siigoService: SiigoService) {}

  @Get('test-connection')
  @Roles(Role.ADMIN)
  async testConnection(): Promise<SiigoTestResult> {
    return this.siigoService.testConnection();
  }

  @Post('purchases/:id/sync')
  @Roles(Role.ADMIN)
  async syncPurchaseReceipt(@Param('id') purchaseId: string): Promise<SiigoSyncReceiptResult> {
    return this.siigoService.syncPurchaseReceipt(purchaseId);
  }

  @Post('import-barequeros')
  @Roles(Role.ADMIN)
  async importBarequeros(): Promise<SiigoImportCustomersResult> {
    return this.siigoService.importBarequerosFromSiigo();
  }

  @Post('import-purchases')
  @Roles(Role.ADMIN)
  async importPurchases(): Promise<SiigoImportPurchasesResult> {
    return this.siigoService.importPurchasesFromSiigo();
  }
}
