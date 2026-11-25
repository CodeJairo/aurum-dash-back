import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  department?: string;

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

  @IsOptional()
  @IsString()
  siigoStateCode?: string;

  @IsOptional()
  @IsString()
  siigoCityCode?: string;

  // Tasa del gravamen financiero (4x1000 = 0.004). Rango 0 a 5%.
  @IsOptional()
  @IsNumber({}, { message: 'La tasa del 4x1000 debe ser numérica.' })
  @Min(0, { message: 'La tasa del 4x1000 no puede ser negativa.' })
  @Max(0.05, { message: 'La tasa del 4x1000 no puede superar 0.05 (5%).' })
  fourPerThousandRate?: number;

  // Costo de formalización por persona sugerido al vender un lote (COP)
  @IsOptional()
  @IsNumber({}, { message: 'El costo de formalización debe ser numérico.' })
  @Min(0, { message: 'El costo de formalización no puede ser negativo.' })
  defaultFormalizationCost?: number;

  // Liquidación mensual: sin reparto o con reparto entre socios
  @IsOptional()
  @IsIn(['NONE', 'PARTNERS'], { message: 'El modo de liquidación debe ser NONE o PARTNERS.' })
  settlementMode?: 'NONE' | 'PARTNERS';

  // [{ name, percent }] — se valida en el servicio (nombres, % y suma 100)
  @IsOptional()
  @IsArray()
  settlementPartners?: { name: string; percent: number }[];
}
