import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  consecutivePrefix?: string;

  @IsOptional()
  @IsInt()
  lastConsecutiveNum?: number;

  @IsOptional()
  @IsBoolean()
  siigoActive?: boolean;

  @IsOptional()
  @IsString()
  siigoApiUrl?: string;

  @IsOptional()
  @IsString()
  siigoUsername?: string;

  @IsOptional()
  @IsString()
  siigoAccessKey?: string;

  @IsOptional()
  @IsString()
  siigoPartnerId?: string;

  @IsOptional()
  @IsString()
  siigoDebitAccount?: string;

  @IsOptional()
  @IsString()
  siigoCreditAccount?: string;

  @IsOptional()
  @IsInt()
  siigoRpDocumentId?: number;

  @IsOptional()
  @IsInt()
  siigoCashPaymentId?: number;

  @IsOptional()
  requiredDocuments?: any;

  @IsOptional()
  @IsNumber({}, { message: 'El tope máximo por barequero debe ser numérico.' })
  @Min(0.01, { message: 'El tope máximo debe ser mayor a 0.' })
  barequeroMaxGrams?: number;
}
