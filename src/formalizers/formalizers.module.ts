import { Module } from '@nestjs/common';
import { FormalizersService } from './formalizers.service';
import { FormalizersController } from './formalizers.controller';
import { StorageService } from './storage.service';
import { VinculacionExcelService } from './vinculacion-excel.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FormalizersController],
  providers: [FormalizersService, StorageService, VinculacionExcelService],
  exports: [FormalizersService, StorageService, VinculacionExcelService],
})
export class FormalizersModule {}
