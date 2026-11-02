import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El usuario de acceso es obligatorio' })
  username: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener mínimo 6 caracteres' })
  password: string;

  @IsEnum(Role, { message: 'Rol inválido. Roles permitidos: ADMIN, BAREQUERO_OPERATOR, VIEWER' })
  role: Role;
}
