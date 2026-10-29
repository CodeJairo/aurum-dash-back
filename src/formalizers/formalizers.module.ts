import { Module } from '@nestjs/common';
import { FormalizersService } from './formalizers.service';
import { FormalizersController } from './formalizers.controller';
import { StorageService } from './storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FormalizersController],
  providers: [FormalizersService, StorageService],
  exports: [FormalizersService, StorageService],
})
export class FormalizersModule {}
