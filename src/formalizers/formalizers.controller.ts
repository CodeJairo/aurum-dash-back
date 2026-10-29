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
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import * as path from 'path';
import type { Request, Response } from 'express';

@Controller('formalizers')
@UseGuards(AuthGuard, RolesGuard)
export class FormalizersController {
  constructor(private readonly formalizersService: FormalizersService) {}

  @Get()
  findAll(@Query('status') status?: 'AVAILABLE' | 'USED') {
    return this.formalizersService.findAll(status);
  }

  @Get('available')
  findAvailable() {
    return this.formalizersService.findAvailable();
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
      filename += ext;
    }

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    if (length) {
      res.setHeader('Content-Length', length);
    }
    stream.pipe(res);
  }

  @Get(['documents/file', 'documents/file/{*filePath}'])
  async getFile(
    @Param('filePath') filePath: string,
    @Query('key') queryKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let fileKey = queryKey || filePath;
    if (!fileKey) {
      const marker = '/documents/file';
      const idx = req.url.indexOf(marker);
      if (idx !== -1) {
        let sub = req.url.substring(idx + marker.length);
        if (sub.startsWith('/')) {
          sub = sub.substring(1);
        }
        fileKey = sub.split('?')[0];
      }
    }

    if (fileKey) {
      if (fileKey.startsWith('/')) {
        fileKey = fileKey.substring(1);
      }
      try {
        fileKey = decodeURIComponent(fileKey);
      } catch {
        // mantener como estaba si ya está decodificado
      }
    }

    if (!fileKey) {
      throw new NotFoundException('Archivo no especificado.');
    }

    const { stream, mimeType, length } =
      await this.formalizersService.getDocumentFileStream(fileKey);
    const filename = path.basename(fileKey);

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    if (length) {
      res.setHeader('Content-Length', length);
    }
    stream.pipe(res);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.formalizersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
    },
  ) {
    return this.formalizersService.update(id, body);
  }

  @Post(':id/documents')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
    @Body('name') customName?: string,
  ) {
    return this.formalizersService.addDocument(id, file, category, customName);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.ADMIN)
  deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.formalizersService.deleteDocument(id, docId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateFormalizerDto) {
    return this.formalizersService.create(dto);
  }
}
