import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MaterialType } from '@prisma/client';
import { PricingModeDto } from './create-purchase.dto';

export class UpdateReceptionDto {
  @IsOptional()
  @IsEnum(MaterialType, { message: 'El material debe ser GOLD o PLATINUM.' })
  material?: MaterialType;

  @IsOptional()
  @IsNumber({}, { message: 'El gramaje bruto debe ser numérico.' })
  @Min(0.0001, { message: 'El gramaje bruto debe ser mayor a 0.' })
  grossGrams?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La pureza debe ser un valor numérico.' })
  purity?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Los gramos finos deben ser numéricos.' })
  fineGrams?: number;

  @IsOptional()
  @IsEnum(PricingModeDto, { message: 'Modalidad de liquidación inválida.' })
  pricingMode?: PricingModeDto;

  @IsOptional()
  @IsNumber({}, { message: 'El precio por gramo debe ser numérico.' })
  @Min(0, { message: 'El precio por gramo no puede ser negativo.' })
  pricePerGram?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El total de la compra debe ser numérico.' })
  @Min(0, { message: 'El total de la compra no puede ser negativo.' })
  totalCost?: number; // Total manual override

  @IsOptional()
  @IsString({ message: 'El consecutivo debe ser una cadena de texto.' })
  consecutive?: string;

  @IsOptional()
  @IsString({ message: 'La fecha de compra debe ser una cadena válida.' })
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
