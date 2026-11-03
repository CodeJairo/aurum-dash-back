import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './auth.guard';
import { getRefreshCookieOptions } from './helpers/cookie-options.helper';

const REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME || 'aurum_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
    const userAgent = req.headers['user-agent'];

    const { refreshToken, ...body } = await this.authService.login(
      dto,
      ipAddress,
      userAgent,
    );

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    return body;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw new UnauthorizedException('No se encontró el token de refresco en la sesión.');
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
    const userAgent = req.headers['user-agent'];

    const { refreshToken: newRefreshToken, ...body } = await this.authService.refresh(
      refreshToken,
      ipAddress,
      userAgent,
    );

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());

    return body;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(refreshToken);

    const { path, ...cookieOpts } = getRefreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOpts, path });
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOpts);

    return { message: 'Sesión cerrada correctamente' };
  }

  @UseGuards(AuthGuard)
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(req.user.sub);

    const { path, ...cookieOpts } = getRefreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOpts, path });
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOpts);

    return { message: 'Todas las sesiones fueron revocadas correctamente' };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.sub);
  }
}
