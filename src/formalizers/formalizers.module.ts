import { Module } from '@nestjs/common';
import { FormalizersService } from './formalizers.service';
import { FormalizersController } from './formalizers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FormalizersController],
  providers: [FormalizersService],
  exports: [FormalizersService],
})
export class FormalizersModule {}
