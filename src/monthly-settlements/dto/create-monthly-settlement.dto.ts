import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SettlementExpenseItemDto {
  @IsString()
  @IsNotEmpty()
  concept: string;

  @IsNumber()
  amount: number;
}

export class CreateMonthlySettlementDto {
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  batchIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementExpenseItemDto)
  @IsOptional()
  expenses?: SettlementExpenseItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  partner1Name?: string;

  @IsNumber()
  @IsOptional()
  partner1Percent?: number;

  @IsString()
  @IsOptional()
  partner2Name?: string;

  @IsNumber()
  @IsOptional()
  partner2Percent?: number;
}
