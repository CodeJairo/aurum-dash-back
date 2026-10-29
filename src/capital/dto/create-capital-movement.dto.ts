import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { TransformMoney } from '../../common/transformers/money.transformer';

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
  @IsString()
  referenceId?: string;
}
