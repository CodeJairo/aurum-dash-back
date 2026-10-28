import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PricingModeDto, PurchaseTypeDto } from './create-purchase.dto';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseTypeDto)
  type?: PurchaseTypeDto;

  @IsOptional()
  @IsString()
  consecutive?: string;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  vendorDoc?: string;

  @IsOptional()
  @IsString()
  vendorAddress?: string;

  @IsOptional()
  @IsString()
  vendorPhone?: string;

  @IsOptional()
  @IsString()
  vendorCity?: string;

  @IsOptional()
  @IsString()
  vendorCountry?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientDoc?: string;

  @IsOptional()
  @IsString()
  recipientAddress?: string;

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
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  purity?: number;

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
  @IsEnum(PricingModeDto)
  pricingMode?: PricingModeDto;

  @IsOptional()
  @IsString()
  batchId?: string | null;

  @IsOptional()
  purchaseDate?: string;

  @IsOptional()
  deliveryDate?: string;
}
