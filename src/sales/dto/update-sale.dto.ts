import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Number)
  pricePerGram?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  totalAmount?: number;

  @IsOptional()
  saleDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string | null;
}
