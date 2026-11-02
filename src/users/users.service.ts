import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const USER_SELECT = {
  id: true,
  companyId: true,
  name: true,
  username: true,
  email: true,
  role: true,
  profitSharePercent: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe o no pertenece a esta empresa.');
    }
    return user;
  }

  async create(companyId: string, dto: CreateUserDto) {
    if (dto.role === Role.SUPER_ADMIN) {
      throw new BadRequestException('No es posible asignar el rol de Super Admin a un usuario de empresa.');
    }

    const cleanUsername = dto.username.trim().toLowerCase();
    const cleanEmail = dto.email?.trim().toLowerCase() || null;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        existingUser.username?.toLowerCase() === cleanUsername
          ? `El usuario "${cleanUsername}" ya se encuentra registrado.`
          : `El correo "${cleanEmail}" ya se encuentra registrado.`,
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        companyId,
        name: dto.name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        role: dto.role,
        isActive: true,
        profitSharePercent: dto.role === Role.ADMIN ? 50.0 : 0.0,
      },
      select: USER_SELECT,
    });
  }

  async update(companyId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(companyId, id);

    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : undefined;

    if (cleanEmail) {
      const emailConflict = await this.prisma.user.findFirst({
        where: {
          email: cleanEmail,
          NOT: { id },
        },
      });
      if (emailConflict) {
        throw new ConflictException(`El correo "${cleanEmail}" ya está en uso.`);
      }
    }

    if (dto.role === Role.SUPER_ADMIN) {
      throw new BadRequestException('No se puede promover un usuario a Super Admin.');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: cleanEmail,
        role: dto.role,
      },
      select: USER_SELECT,
    });
  }

  async resetPassword(companyId: string, id: string, newPass: string) {
    await this.findOne(companyId, id);

    if (!newPass || newPass.trim().length < 6) {
      throw new BadRequestException('La nueva contraseña debe tener mínimo 6 caracteres.');
    }

    const hashedPassword = await bcrypt.hash(newPass.trim(), 10);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { success: true, message: 'Contraseña actualizada exitosamente.' };
  }

  async toggleActive(companyId: string, id: string, currentUserId?: string) {
    const user = await this.findOne(companyId, id);

    if (currentUserId && user.id === currentUserId) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta de acceso.');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: USER_SELECT,
    });
  }
}
