import { IsEnum } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class ToggleDebtStatusDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;
}
