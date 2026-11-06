import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentAccount } from '@prisma/client';
import { TransformMoney } from '../../common/transformers/money.transformer';

export class RegisterDebtMovementDto {
  @IsNumber()
  @IsPositive()
  @TransformMoney()
  amount: number;

  @IsEnum(PaymentAccount)
  account: PaymentAccount = PaymentAccount.CASH;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
