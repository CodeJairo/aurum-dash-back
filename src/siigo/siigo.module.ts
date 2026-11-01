import { Module } from '@nestjs/common';
import { SiigoService } from './siigo.service';
import { SiigoController } from './siigo.controller';

@Module({
  controllers: [SiigoController],
  providers: [SiigoService],
  exports: [SiigoService],
})
export class SiigoModule {}
