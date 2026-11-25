import {
  IsArray,
  IsBoolean,
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

  /**
   * Solo aplica a empresas sin reparto entre socios: si es true, la utilidad neta se
   * registra como retiro del capital de trabajo. Con socios, el reparto siempre se registra.
   */
  @IsOptional()
  @IsBoolean()
  registerProfitWithdrawal?: boolean;

  // Campos históricos (ignorados): los socios ahora salen de Ajustes > Liquidación.
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
