import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { CloseBatchDto } from './dto/close-batch.dto';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('simulate/:batchId')
  simulate(@Param('batchId') batchId: string) {
    return this.settlementsService.simulate(batchId);
  }

  @Post('close')
  closeBatch(@Body() dto: CloseBatchDto) {
    return this.settlementsService.closeBatch(dto);
  }

  @Patch('reopen/:batchId')
  reopenBatch(@Param('batchId') batchId: string) {
    return this.settlementsService.reopenBatch(batchId);
  }

  @Get()
  findAll(@Query('batchId') batchId?: string) {
    return this.settlementsService.findAll(batchId);
  }
}
