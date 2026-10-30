import { ArrayNotEmpty, IsArray, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformMoney } from '../../common/transformers/money.transformer';

export class SellBatchDto {
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  grossSaleAmount: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  salePricePerGram?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  formalizationCostPerPerson?: number = 170000;

  @IsOptional()
  @IsNumber()
  @TransformMoney()
  otherExpensesAmount?: number = 0;

  @IsOptional()
  @IsString()
  otherExpensesConcept?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formalizerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formalizationPurchaseIds?: string[];

  @IsOptional()
  @IsString()
  soldDate?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  meltedGrossGrams?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  meltedFineGrams?: number;
}
