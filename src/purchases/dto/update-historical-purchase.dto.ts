import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformMoney } from '../../common/transformers/money.transformer';

export class UpdateHistoricalPurchaseDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  grossGrams?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1000)
  purity?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  purityRaw?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  fineGrams?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @TransformMoney()
  pricePerGram?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @TransformMoney()
  totalCost?: number;

  @IsOptional()
  @IsBoolean()
  isFormalizedHistorically?: boolean;

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
