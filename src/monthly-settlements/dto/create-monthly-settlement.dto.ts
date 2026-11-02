import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentAccount } from '@prisma/client';
import { TransformMoney } from '../../common/transformers/money.transformer';

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
  @IsString({ each: true })
  @IsOptional()
  expenseIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementExpenseItemDto)
  @IsOptional()
  expenses?: SettlementExpenseItemDto[];

  @IsOptional()
  @IsEnum(PaymentAccount)
  payoutAccount?: PaymentAccount = PaymentAccount.BANK;

  @IsOptional()
  @IsNumber()
  @TransformMoney()
  payoutCashAmount?: number;

  @IsOptional()
  @IsNumber()
  @TransformMoney()
  payoutBankAmount?: number;

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
