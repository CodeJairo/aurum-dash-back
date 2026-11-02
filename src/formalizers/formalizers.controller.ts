import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FormalizersService } from './formalizers.service';
import { CreateFormalizerDto } from './dto/create-formalizer.dto';
import { CompleteVinculacionDto } from './dto/complete-vinculacion.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import * as path from 'path';
import type { Response } from 'express';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('formalizers')
@UseGuards(AuthGuard, RolesGuard)
export class FormalizersController {
  constructor(private readonly formalizersService: FormalizersService) {}

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('status') status?: 'AVAILABLE' | 'USED',
  ) {
    return this.formalizersService.findAll(companyId, status);
  }

  @Get('available')
  findAvailable(@CurrentCompanyId() companyId: string) {
    return this.formalizersService.findAvailable(companyId);
  }

  @Get('by-doc/:doc')
  findByDocument(
    @CurrentCompanyId() companyId: string,
    @Param('doc') doc: string,
  ) {
    return this.formalizersService.findByDocument(companyId, doc);
  }

  @Post('vinculacion')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  completeVinculacionDirect(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CompleteVinculacionDto,
  ) {
    return this.formalizersService.completeVinculacion(companyId, dto.document, dto);
  }

  @Post(':id/vinculacion')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  completeVinculacion(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CompleteVinculacionDto,
  ) {
    return this.formalizersService.completeVinculacion(companyId, id, dto);
  }

  @Get('config/required-documents')
  getRequiredDocuments() {
    return this.formalizersService.getRequiredDocumentsConfig();
  }

  @Get('documents/:docId/download')
  async downloadDocument(@Param('docId') docId: string, @Res() res: Response) {
    const doc = await this.formalizersService.getDocumentById(docId);
    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }
    const { stream, mimeType, length } =
      await this.formalizersService.getDocumentFileStream(doc.fileKey);

    let filename = doc.name || 'documento.pdf';
    const ext = path.extname(doc.fileKey);
    if (ext && !filename.toLowerCase().endsWith(ext.toLowerCase())) {
      filename = `${filename}${ext}`;
    }

    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    stream.pipe(res);
  }

  @Public()
  @Get(['documents/file', 'documents/file/{*key}'])
  async getDocumentFile(
    @Req() req: any,
    @Query('key') queryKey: string,
    @Res() res: Response,
  ) {
    let key = queryKey;
    if (!key && req.params?.key) {
      key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    }
    if (!key && req.originalUrl?.includes('/documents/file/')) {
      const part = req.originalUrl.split('/documents/file/')[1]?.split('?')[0];
      if (part) {
        key = decodeURIComponent(part);
      }
    }
    if (key) {
      key = key.replace(/^\/+/, '');
    }
    if (!key) {
      throw new NotFoundException('Clave de archivo no provista.');
    }
    const { stream, mimeType, length } =
      await this.formalizersService.getDocumentFileStream(key);

    const filename = path.basename(key);
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    stream.pipe(res);
  }

  @Post()
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  create(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CreateFormalizerDto,
  ) {
    return this.formalizersService.create(companyId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.formalizersService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
    },
  ) {
    return this.formalizersService.update(companyId, id, dto);
  }

  @Post(':id/documents')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
    @Body('customName') customName?: string,
    @Body('period') period?: string,
  ) {
    return this.formalizersService.addDocument(companyId, id, file, category, customName, period);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.ADMIN)
  deleteDocument(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.formalizersService.deleteDocument(companyId, id, docId);
  }
}
