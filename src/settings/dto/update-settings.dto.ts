import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

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
}
