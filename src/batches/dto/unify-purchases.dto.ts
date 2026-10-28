import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class UnifyPurchasesDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  purchaseIds: string[];
}
