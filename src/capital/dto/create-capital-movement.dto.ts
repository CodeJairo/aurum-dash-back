import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { TransformMoney } from '../../common/transformers/money.transformer';
import { PaymentAccount } from '@prisma/client';

export enum CapitalActionDto {
  INJECTION = 'CAPITAL_INJECTION',
  WITHDRAWAL = 'CAPITAL_WITHDRAWAL',
  ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

export class CreateCapitalMovementDto {
  @IsEnum(CapitalActionDto)
  action: CapitalActionDto;

  @TransformMoney()
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(PaymentAccount)
  account?: PaymentAccount = PaymentAccount.CASH;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  receiptKey?: string;
}

export class TransferCapitalDto {
  @TransformMoney()
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(PaymentAccount)
  fromAccount: PaymentAccount;

  @IsEnum(PaymentAccount)
  toAccount: PaymentAccount;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  receiptKey?: string;
}
