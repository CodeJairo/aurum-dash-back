import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UnifyPurchasesDto } from './dto/unify-purchases.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { SellBatchDto } from './dto/sell-batch.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('batches')
@UseGuards(AuthGuard, RolesGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateBatchDto) {
    return this.batchesService.create(dto);
  }

  @Post('unify')
  @Roles(Role.ADMIN)
  unifyPurchases(@Body() dto: UnifyPurchasesDto) {
    return this.batchesService.unifyPurchases(dto);
  }

  @Post(':id/sell')
  @Roles(Role.ADMIN)
  sellBatch(@Param('id') id: string, @Body() dto: SellBatchDto) {
    return this.batchesService.sellBatch(id, dto);
  }

  @Get(':id/formalization-suggestions')
  getFormalizationSuggestions(@Param('id') id: string) {
    return this.batchesService.getFormalizationSuggestions(id);
  }

  @Delete(':id/purchases/:purchaseId')
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.batchesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.batchesService.remove(id);
  }
}
