import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña no puede estar vacía' })
  @MinLength(6, { message: 'La nueva contraseña debe tener mínimo 6 caracteres' })
  newPassword: string;
}
