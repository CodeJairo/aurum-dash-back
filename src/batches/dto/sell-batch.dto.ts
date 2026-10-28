import { ArrayNotEmpty, IsArray, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SellBatchDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  grossSaleAmount: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  salePricePerGram?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  formalizationCostPerPerson?: number = 170000;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  otherExpensesAmount?: number = 0;

  @IsOptional()
  @IsString()
  otherExpensesConcept?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  formalizerIds: string[];

  @IsOptional()
  @IsString()
  soldDate?: string;
}
