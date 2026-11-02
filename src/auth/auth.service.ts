import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureSuperAdmin();
  }

  private async ensureSuperAdmin() {
    try {
      const superAdmin = await this.prisma.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
      });
      const username = (process.env.SUPERADMIN_USERNAME || 'superadmin').trim().toLowerCase();
      const email = (process.env.SUPERADMIN_EMAIL || 'admin@aurumdash.com').trim().toLowerCase();
      const name = process.env.SUPERADMIN_NAME || 'Super Administrador';
      const rawPassword = process.env.SUPERADMIN_PASSWORD || 'AurumAdmin2026*';
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      if (!superAdmin) {
        await this.prisma.user.create({
          data: {
            username,
            email,
            name,
            password: hashedPassword,
            role: Role.SUPER_ADMIN,
            profitSharePercent: 0,
            isActive: true,
          },
        });
      }
    } catch {
      // Ignorar si la BD aún no ha corrido migraciones
    }
  }

  async login(dto: LoginDto) {
    const identifier = (dto.username || dto.email || '').trim().toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException('Debes ingresar tu usuario o correo electrónico.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
        ],
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas o usuario inactivo.');
    }

    if (user.company && !user.company.isActive) {
      throw new UnauthorizedException('Tu empresa se encuentra inactiva o suspendida. Contacta a soporte.');
    }

    // Validación segura con bcrypt con soporte de fallback transicional
    const isPasswordValid =
      (await bcrypt.compare(dto.password, user.password).catch(() => false)) ||
      user.password === dto.password;

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId || null,
      companyName: user.company?.name || null,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId || null,
        companyName: user.company?.name || null,
        profitSharePercent: Number(user.profitSharePercent),
      },
      company: user.company || null,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        role: true,
        profitSharePercent: true,
        isActive: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return {
      ...user,
      profitSharePercent: Number(user.profitSharePercent),
    };
  }
}
