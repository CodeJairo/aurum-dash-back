import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type {} from 'multer';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';
import { BrandingService, LOGO_MAX_BYTES } from './branding.service';

const logoUploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: LOGO_MAX_BYTES },
});

@Controller('branding')
@UseGuards(AuthGuard, RolesGuard)
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  /** Logo público de una empresa (se usa en <img>, que no envía token). Solo expone el logo. */
  @Public()
  @Get('logo/:companyId')
  async getLogo(@Param('companyId') companyId: string, @Res() res: Response) {
    let file: Awaited<ReturnType<BrandingService['getLogoStream']>>;
    try {
      file = await this.brandingService.getLogoStream(companyId);
    } catch {
      throw new NotFoundException('Logo no encontrado.');
    }
    res.setHeader('Content-Type', file.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    file.stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });
    file.stream.pipe(res);
  }

  /** El administrador de la empresa sube o reemplaza su propio logo. */
  @Post('logo')
  @Roles(Role.ADMIN)
  @UseInterceptors(logoUploadInterceptor)
  uploadOwnLogo(
    @CurrentCompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brandingService.setLogo(companyId, file);
  }

  @Delete('logo')
  @Roles(Role.ADMIN)
  removeOwnLogo(@CurrentCompanyId() companyId: string) {
    return this.brandingService.removeLogo(companyId);
  }

  /** El super administrador gestiona el logo de cualquier empresa. */
  @Post('companies/:companyId/logo')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(logoUploadInterceptor)
  uploadCompanyLogo(
    @Param('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brandingService.setLogo(companyId, file);
  }

  @Delete('companies/:companyId/logo')
  @Roles(Role.SUPER_ADMIN)
  removeCompanyLogo(@Param('companyId') companyId: string) {
    return this.brandingService.removeLogo(companyId);
  }
}
