import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { SettingsModule } from '../settings/settings.module';
import { FormalizersModule } from '../formalizers/formalizers.module';
import { CapitalModule } from '../capital/capital.module';

@Module({
  imports: [SettingsModule, FormalizersModule, CapitalModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
