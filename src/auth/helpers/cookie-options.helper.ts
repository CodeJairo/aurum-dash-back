import { CookieOptions } from 'express';
import { parseDuration } from '../../common/helpers/time.helper';

/**
 * Genera opciones de cookie seguras para el Refresh Token.
 * - `httpOnly`: true (inmune a robo por XSS o JavaScript)
 * - `sameSite`: 'lax' en desarrollo, 'none' en producción con cross-origin HTTPS
 * - `secure`: true en producción o con HTTPS
 * - `maxAge`: milisegundos calculados desde JWT_REFRESH_EXPIRES_IN (default: 30 días)
 * - `path`: '/'
 */
export function getRefreshCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSameSite = process.env.AUTH_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none' | undefined;
  const sameSite: 'lax' | 'strict' | 'none' = configuredSameSite || (isProduction ? 'none' : 'lax');

  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || isProduction;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  const maxAge = parseDuration(expiresIn);

  return {
    httpOnly: true,
    sameSite,
    secure,
    maxAge,
    path: '/',
  };
}
