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
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('batches')
@UseGuards(AuthGuard, RolesGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentCompanyId() companyId: string, @Body() dto: CreateBatchDto) {
    return this.batchesService.create(companyId, dto);
  }

  @Post('unify')
  @Roles(Role.ADMIN)
  unifyPurchases(@CurrentCompanyId() companyId: string, @Body() dto: UnifyPurchasesDto) {
    return this.batchesService.unifyPurchases(companyId, dto);
  }

  @Post(':id/sell')
  @Roles(Role.ADMIN)
  sellBatch(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: SellBatchDto,
  ) {
    return this.batchesService.sellBatch(companyId, id, dto);
  }

  @Get(':id/formalization-suggestions')
  getFormalizationSuggestions(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Query('targetGrossGrams') targetGrossGrams?: string,
  ) {
    const target = targetGrossGrams ? Number(targetGrossGrams) : undefined;
    return this.batchesService.getFormalizationSuggestions(companyId, id, target);
  }

  @Delete(':id/purchases/:purchaseId')
  @Roles(Role.ADMIN)
  disassociatePurchase(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.batchesService.disassociatePurchase(companyId, id, purchaseId);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('status') status?: 'OPEN' | 'CLOSED',
  ) {
    return this.batchesService.findAll(companyId, status);
  }

  @Get(':id')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.batchesService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.batchesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.batchesService.remove(companyId, id);
  }
}
