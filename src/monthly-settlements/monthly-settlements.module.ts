import { Module } from '@nestjs/common';
import { MonthlySettlementsService } from './monthly-settlements.service';
import { MonthlySettlementsController } from './monthly-settlements.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MonthlySettlementsController],
  providers: [MonthlySettlementsService],
  exports: [MonthlySettlementsService],
})
export class MonthlySettlementsModule {}
