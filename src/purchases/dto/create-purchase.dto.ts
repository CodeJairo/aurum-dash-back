import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformMoney } from '../../common/transformers/money.transformer';

export enum PricingModeDto {
  PER_FINE_GRAM = 'PER_FINE_GRAM',
  PER_GROSS_GRAM = 'PER_GROSS_GRAM',
}

export enum PurchaseTypeDto {
  ACCOUNTING = 'ACCOUNTING',
  FORMAL = 'FORMAL',
}

export class CreatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseTypeDto)
  type?: PurchaseTypeDto = PurchaseTypeDto.ACCOUNTING;

  @IsOptional()
  @IsString()
  consecutive?: string;

  // Proveedor o Barequero
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

  // Receptor
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

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  grossGrams: number;

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

  @IsNumber()
  @IsPositive()
  @TransformMoney()
  pricePerGram: number;

  @IsOptional()
  @IsEnum(PricingModeDto)
  pricingMode?: PricingModeDto = PricingModeDto.PER_FINE_GRAM;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  purchaseDate?: string;

  @IsOptional()
  deliveryDate?: string;
}
