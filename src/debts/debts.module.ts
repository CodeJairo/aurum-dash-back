import { Module } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CapitalModule } from '../capital/capital.module';

@Module({
  imports: [PrismaModule, CapitalModule],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
