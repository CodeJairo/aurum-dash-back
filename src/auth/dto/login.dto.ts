import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString({ message: 'El usuario debe ser una cadena de texto' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  password: string;
}
