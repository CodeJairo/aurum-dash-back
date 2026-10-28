import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { FormalizersModule } from '../formalizers/formalizers.module';
import { CapitalModule } from '../capital/capital.module';

@Module({
  imports: [FormalizersModule, CapitalModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
