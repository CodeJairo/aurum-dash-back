import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;

  beforeEach(() => {
    prismaService = {
      user: {
        findFirst: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('test_token'),
    };
    service = new AuthService(prismaService as PrismaService, jwtService as JwtService);
  });

  it('should authenticate user by username "daniel" and return role ADMIN', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    prismaService.user.findFirst.mockResolvedValue({
      id: 'usr-1',
      username: 'daniel',
      email: 'daniel@aurumdash.com',
      password: hashedPassword,
      name: 'Daniel',
      role: Role.ADMIN,
      isActive: true,
      profitSharePercent: 50,
    });

    const result = await service.login({ username: 'daniel', password: 'password123' });

    expect(result.accessToken).toBe('test_token');
    expect(result.user.username).toBe('daniel');
    expect(result.user.role).toBe(Role.ADMIN);
  });

  it('should authenticate user by username "andres" and return role VIEWER', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    prismaService.user.findFirst.mockResolvedValue({
      id: 'usr-2',
      username: 'andres',
      email: 'andres@aurumdash.com',
      password: hashedPassword,
      name: 'Andres',
      role: Role.VIEWER,
      isActive: true,
      profitSharePercent: 50,
    });

    const result = await service.login({ username: 'andres', password: 'password123' });

    expect(result.accessToken).toBe('test_token');
    expect(result.user.username).toBe('andres');
    expect(result.user.role).toBe(Role.VIEWER);
  });

  it('should reject invalid password with UnauthorizedException', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    prismaService.user.findFirst.mockResolvedValue({
      id: 'usr-2',
      username: 'andres',
      password: hashedPassword,
      role: Role.VIEWER,
      isActive: true,
    });

    await expect(
      service.login({ username: 'andres', password: 'wrongpassword' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
