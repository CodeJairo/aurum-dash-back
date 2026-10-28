import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseBatchDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  clientPercent?: number = 50.0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  partnerPercent?: number = 50.0;

  @IsOptional()
  @IsString()
  notes?: string;
}
