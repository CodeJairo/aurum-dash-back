import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { BatchSettlementExcelService } from './batch-settlement-excel.service';
import { FormalizersModule } from '../formalizers/formalizers.module';
import { CapitalModule } from '../capital/capital.module';

@Module({
  imports: [FormalizersModule, CapitalModule],
  controllers: [BatchesController],
  providers: [BatchesService, BatchSettlementExcelService],
  exports: [BatchesService, BatchSettlementExcelService],
})
export class BatchesModule {}
