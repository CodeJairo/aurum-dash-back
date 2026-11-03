import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ArchiveService } from './archive.service';
import { CurrentCompanyId } from '../auth/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { Role } from '@prisma/client';
import { StorageService } from '../storage/storage.service';

@Controller('archive')
@UseGuards(AuthGuard, RolesGuard)
export class ArchiveController {
  constructor(
    private readonly archiveService: ArchiveService,
    private readonly storageService: StorageService,
  ) {}

  @Get('tree')
  getArchiveTree(@CurrentCompanyId() companyId: string) {
    return this.archiveService.getArchiveTree(companyId);
  }

  @Post('upload')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  @UseInterceptors(FilesInterceptor('files', 15))
  uploadDocuments(
    @CurrentCompanyId() companyId: string,
    @Body('purchaseId') purchaseId: string,
    @Body('formalizerId') formalizerId: string,
    @Body('period') period: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.archiveService.uploadDocuments(
      companyId,
      purchaseId,
      formalizerId || null,
      files,
      period,
    );
  }

  @Delete('documents/:documentId')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  deleteDocument(
    @CurrentCompanyId() companyId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.archiveService.deleteDocument(companyId, documentId);
  }

  @Patch('purchases/:purchaseId/checklist')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  updateChecklist(
    @CurrentCompanyId() companyId: string,
    @Param('purchaseId') purchaseId: string,
    @Body('checklist') checklist: string[],
  ) {
    return this.archiveService.updateChecklist(companyId, purchaseId, checklist || []);
  }

  @Post('purchases/:purchaseId/checklist/toggle-all')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  toggleAllChecklist(
    @CurrentCompanyId() companyId: string,
    @Param('purchaseId') purchaseId: string,
    @Body('checkAll') checkAll: boolean,
  ) {
    return this.archiveService.toggleAllChecklist(companyId, purchaseId, !!checkAll);
  }

  @Get('download-zip')
  async downloadZip(
    @CurrentCompanyId() companyId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('date') date: string,
    @Query('purchaseId') purchaseId: string,
    @Res() res: Response,
  ) {
    return this.archiveService.streamArchiveZip(
      companyId,
      { year, month, date, purchaseId },
      res,
    );
  }

  @Public()
  @Get('documents/file')
  async getDocumentFile(
    @Query('key') key: string,
    @Res() res: Response,
  ) {
    if (!key) {
      throw new NotFoundException('Clave de archivo no proporcionada.');
    }

    try {
      const fileStream = await this.storageService.getFileStream(key);
      res.setHeader('Content-Type', fileStream.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline');
      fileStream.stream.pipe(res);
    } catch {
      throw new NotFoundException('Archivo no encontrado.');
    }
  }
}
