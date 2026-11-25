import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {} from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** URL pública (relativa al API) del logo de una empresa. `v` evita caché al reemplazarlo. */
  private buildLogoUrl(companyId: string): string {
    return `/api/branding/logo/${companyId}?v=${Date.now()}`;
  }

  async setLogo(companyId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar una imagen para el logo.');
    }
    if (!LOGO_ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('El logo debe ser una imagen PNG, JPG o WEBP.');
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException('El logo no puede superar 2 MB.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, logoKey: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    const upload = await this.storageService.uploadFile(
      file,
      `companies/${companyId}/branding`,
      '/api/branding/logo',
    );

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { logoKey: upload.fileKey, logoUrl: this.buildLogoUrl(companyId) },
      select: { id: true, name: true, logoUrl: true },
    });

    // Borrar el logo anterior (mejor esfuerzo, nunca bloquea)
    if (company.logoKey && company.logoKey !== upload.fileKey) {
      this.storageService.deleteFile(company.logoKey).catch((err) => {
        this.logger.warn(`No se pudo borrar el logo anterior (${company.logoKey}): ${String(err)}`);
      });
    }

    return updated;
  }

  async removeLogo(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, logoKey: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { logoKey: null, logoUrl: null },
      select: { id: true, name: true, logoUrl: true },
    });

    if (company.logoKey) {
      this.storageService.deleteFile(company.logoKey).catch((err) => {
        this.logger.warn(`No se pudo borrar el logo (${company.logoKey}): ${String(err)}`);
      });
    }

    return updated;
  }

  async getLogoStream(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { logoKey: true },
    });
    if (!company?.logoKey) {
      throw new NotFoundException('La empresa no tiene logo configurado.');
    }
    return this.storageService.getFileStream(company.logoKey);
  }
}
