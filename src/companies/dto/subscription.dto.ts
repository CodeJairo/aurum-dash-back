import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TransformMoney } from '../../common/transformers/money.transformer';

export const BILLING_CYCLES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY', 'ONE_TIME'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Todos los campos son opcionales; enviar null limpia el valor. */
export class UpdateSubscriptionDto {
  @IsOptional()
  @IsNumber({}, { message: 'El valor de la suscripción debe ser numérico.' })
  @Min(0, { message: 'El valor de la suscripción no puede ser negativo.' })
  @TransformMoney()
  subscriptionPrice?: number | null;

  @IsOptional()
  @IsIn(BILLING_CYCLES as unknown as string[], { message: 'Ciclo de cobro no válido.' })
  billingCycle?: BillingCycle | null;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio no es válida.' })
  subscriptionStartDate?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha del próximo cobro no es válida.' })
  nextBillingDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  subscriptionNotes?: string | null;
}

export class CreateSubscriptionPaymentDto {
  @IsNumber({}, { message: 'El valor del pago debe ser numérico.' })
  @Min(1, { message: 'El valor del pago debe ser mayor a 0.' })
  @TransformMoney()
  amount: number;

  @IsDateString({}, { message: 'La fecha de pago no es válida.' })
  paidAt: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Si es true, el próximo cobro avanza un ciclo (según el plan de la empresa). */
  @IsOptional()
  @IsBoolean()
  advanceNextBillingDate?: boolean;
}
