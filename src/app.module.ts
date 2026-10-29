import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { BatchesModule } from './batches/batches.module';
import { SalesModule } from './sales/sales.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SettlementsModule } from './settlements/settlements.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { CapitalModule } from './capital/capital.module';
import { FormalizersModule } from './formalizers/formalizers.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    StorageModule,
    PrismaModule,
    PurchasesModule,
    BatchesModule,
    SalesModule,
    ExpensesModule,
    SettlementsModule,
    AuthModule,
    DashboardModule,
    SettingsModule,
    CapitalModule,
    FormalizersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
