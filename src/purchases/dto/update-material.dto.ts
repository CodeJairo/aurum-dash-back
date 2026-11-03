import { IsEnum, IsNotEmpty } from 'class-validator';
import { MaterialType } from '@prisma/client';

export class UpdateMaterialDto {
  @IsNotEmpty({ message: 'El material es obligatorio.' })
  @IsEnum(MaterialType, { message: 'El material debe ser GOLD o PLATINUM.' })
  material: MaterialType;
}
