import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Role } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  async create(dto: CreateCompanyDto) {
    const rawSlug = this.slugify(dto.name);
    let slug = rawSlug || 'empresa';

    const existingSlug = await this.prisma.company.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${rawSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.adminUsername.trim().toLowerCase() },
          ...(dto.adminEmail ? [{ email: dto.adminEmail.trim().toLowerCase() }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'El nombre de usuario o correo para el administrador ya está registrado en la plataforma.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name.trim(),
          nit: dto.nit?.trim() || null,
          slug,
          phone: dto.phone?.trim() || null,
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || 'Quibdó',
          isActive: true,
        },
      });

      await tx.systemSetting.create({
        data: {
          companyId: company.id,
          legalName: dto.name.trim(),
          document: dto.nit?.trim() || '',
          address: dto.address?.trim() || '',
          phone: dto.phone?.trim() || '',
          city: dto.city?.trim() || 'Quibdó',
          consecutivePrefix: dto.consecutivePrefix?.trim() || 'DH-',
          lastConsecutiveNum: 0,
          lastPurchaseNum: 0,
          currentCapital: 0,
          cashCapital: 0,
          bankCapital: 0,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          companyId: company.id,
          name: dto.adminName.trim(),
          username: dto.adminUsername.trim().toLowerCase(),
          email: dto.adminEmail?.trim().toLowerCase() || null,
          password: hashedPassword,
          role: Role.ADMIN,
          profitSharePercent: 50.0,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return {
        company,
        adminUser,
      };
    });
  }

  async findAll() {
    const companies = await this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            purchases: true,
            batches: true,
          },
        },
      },
    });

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      nit: c.nit,
      slug: c.slug,
      phone: c.phone,
      address: c.address,
      city: c.city,
      isActive: c.isActive,
      createdAt: c.createdAt,
      stats: {
        usersCount: c._count.users,
        purchasesCount: c._count.purchases,
        batchesCount: c._count.batches,
      },
    }));
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        systemSetting: true,
        _count: {
          select: {
            purchases: true,
            batches: true,
            formalizers: true,
            expenses: true,
            monthlySettlements: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);
    return this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.nit !== undefined ? { nit: dto.nit?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async toggleActive(id: string) {
    const company = await this.findOne(id);
    const updated = await this.prisma.company.update({
      where: { id },
      data: { isActive: !company.isActive },
    });
    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
    };
  }

  async impersonate(superAdminUser: any, companyId: string) {
    const company = await this.findOne(companyId);
    if (!company.isActive) {
      throw new BadRequestException('No es posible ingresar a una empresa suspendida o inactiva.');
    }

    const companyAdmin = await this.prisma.user.findFirst({
      where: { companyId, role: Role.ADMIN, isActive: true },
    });

    const payload = {
      sub: companyAdmin ? companyAdmin.id : superAdminUser.sub,
      username: companyAdmin ? companyAdmin.username : `impersonate-${company.slug}`,
      email: companyAdmin?.email || superAdminUser.email,
      name: companyAdmin?.name || `${superAdminUser.name || 'Soporte'} (Soporte)`,
      role: Role.ADMIN,
      companyId: company.id,
      companyName: company.name,
      isImpersonating: true,
      originalSuperAdminId: superAdminUser.sub,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
      },
      user: {
        id: payload.sub,
        username: payload.username,
        name: payload.name,
        role: payload.role,
        companyId: company.id,
        isImpersonating: true,
      },
    };
  }
}
