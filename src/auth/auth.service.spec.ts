import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './helpers/token.helper';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;

  beforeEach(() => {
    prismaService = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaService)),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('test_token'),
      verifyAsync: jest.fn(),
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
      tokenVersion: 0,
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
      tokenVersion: 0,
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

  it('should refresh tokens and rotate session when valid', async () => {
    const refreshToken = 'valid_refresh_token';
    const jti = 'jti-123';
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'usr-1',
      tokenType: 'refresh',
      jti,
      tokenVersion: 0,
    });

    prismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      username: 'daniel',
      email: 'daniel@aurumdash.com',
      name: 'Daniel',
      role: Role.ADMIN,
      isActive: true,
      profitSharePercent: 50,
      tokenVersion: 0,
      company: null,
    });

    prismaService.refreshSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'usr-1',
      jti,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
    });

    const result = await service.refresh(refreshToken);
    expect(result.accessToken).toBe('test_token');
    expect(result.refreshToken).toBe('test_token');
    expect(prismaService.refreshSession.update).toHaveBeenCalled();
  });

  it('should detect suspicious reuse and revoke all sessions', async () => {
    const refreshToken = 'reused_refresh_token';
    const jti = 'jti-stolen';
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'usr-1',
      tokenType: 'refresh',
      jti,
      tokenVersion: 0,
    });

    prismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      username: 'daniel',
      email: 'daniel@aurumdash.com',
      isActive: true,
      tokenVersion: 0,
      company: null,
    });

    // Session was already revoked
    prismaService.refreshSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'usr-1',
      jti,
      tokenHash: hashToken(refreshToken),
      revokedAt: new Date(),
      revokeReason: 'ROTATED',
    });

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(prismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tokenVersion: { increment: 1 } },
      }),
    );
  });
});
