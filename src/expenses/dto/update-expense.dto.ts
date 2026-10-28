import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategoryDto } from './create-expense.dto';

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ExpenseCategoryDto)
  category?: ExpenseCategoryDto;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string | null;
}
