import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleDto {
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

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  totalAmount: number;

  @IsOptional()
  saleDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}
