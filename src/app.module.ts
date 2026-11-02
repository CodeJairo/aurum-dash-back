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
import { MonthlySettlementsModule } from './monthly-settlements/monthly-settlements.module';
import { SiigoModule } from './siigo/siigo.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    StorageModule,
    PrismaModule,
    CompaniesModule,
    UsersModule,
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
    MonthlySettlementsModule,
    SiigoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
