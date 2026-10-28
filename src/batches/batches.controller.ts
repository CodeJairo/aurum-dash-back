import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UnifyPurchasesDto } from './dto/unify-purchases.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { SellBatchDto } from './dto/sell-batch.dto';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.batchesService.create(dto);
  }

  @Post('unify')
  unifyPurchases(@Body() dto: UnifyPurchasesDto) {
    return this.batchesService.unifyPurchases(dto);
  }

  @Post(':id/sell')
  sellBatch(@Param('id') id: string, @Body() dto: SellBatchDto) {
    return this.batchesService.sellBatch(id, dto);
  }

  @Delete(':id/purchases/:purchaseId')
  disassociatePurchase(
    @Param('id') id: string,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.batchesService.disassociatePurchase(id, purchaseId);
  }

  @Get()
  findAll(@Query('status') status?: 'OPEN' | 'CLOSED') {
    return this.batchesService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.batchesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.batchesService.remove(id);
  }
}
