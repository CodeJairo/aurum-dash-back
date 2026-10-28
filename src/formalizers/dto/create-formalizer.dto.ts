import { IsOptional, IsString } from 'class-validator';

export class CreateFormalizerDto {
  @IsString()
  name: string;

  @IsString()
  document: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string = 'Quibdó-Chocó';

  @IsOptional()
  @IsString()
  country?: string = 'Colombia';
}
