import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role: string;
  companyId: string | null;
  companyName: string | null;
  tokenVersion?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenType: 'refresh';
  jti: string;
  tokenVersion: number;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function generateAccessToken(
  jwtService: JwtService,
  payload: AccessTokenPayload,
): Promise<string> {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'aurum_dash_super_secret_dev_key_2026_oro';
  const expiresIn = (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any;

  return jwtService.signAsync(payload, {
    secret,
    expiresIn,
  });
}

export async function generateRefreshToken(
  jwtService: JwtService,
  userId: string,
  tokenVersion = 0,
): Promise<{ token: string; jti: string }> {
  const secret = process.env.JWT_REFRESH_SECRET || 'aurum_dash_refresh_super_secret_dev_key_2026_oro';
  const expiresIn = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any;
  const jti = randomUUID();

  const payload: RefreshTokenPayload = {
    sub: userId,
    tokenType: 'refresh',
    jti,
    tokenVersion,
  };

  const token = await jwtService.signAsync(payload, {
    secret,
    expiresIn,
  });

  return { token, jti };
}
