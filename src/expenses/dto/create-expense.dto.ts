import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformMoney } from '../../common/transformers/money.transformer';

export enum ExpenseCategoryDto {
  FOUR_PER_THOUSAND = 'FOUR_PER_THOUSAND',
  OPERATIONAL = 'OPERATIONAL',
  TRANSPORT = 'TRANSPORT',
  MELTING_LAB = 'MELTING_LAB',
  COMMISSION = 'COMMISSION',
  OTHER = 'OTHER',
}

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsEnum(ExpenseCategoryDto)
  category?: ExpenseCategoryDto = ExpenseCategoryDto.OPERATIONAL;

  @IsNumber()
  @IsPositive()
  @TransformMoney()
  amount: number;

  @IsOptional()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}
