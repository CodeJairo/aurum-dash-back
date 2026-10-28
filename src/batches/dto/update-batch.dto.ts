import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum BatchStatusDto {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(BatchStatusDto)
  status?: BatchStatusDto;
}
