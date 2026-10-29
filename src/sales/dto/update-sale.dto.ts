import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformMoney } from '../../common/transformers/money.transformer';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  grossGrams?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  fineGrams?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  pricePerGram?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  totalAmount?: number;

  @IsOptional()
  saleDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string | null;
}
