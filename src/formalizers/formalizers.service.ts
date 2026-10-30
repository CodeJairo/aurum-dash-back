import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {} from 'multer';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { CreateFormalizerDto } from './dto/create-formalizer.dto';
import { FormalizerStatus, Prisma } from '@prisma/client';
import {
  REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES,
  evaluateBarequeroDocuments,
} from './constants/barequero-documents.config';

@Injectable()
export class FormalizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(_status?: 'AVAILABLE' | 'USED') {
    return this.prisma.formalizer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        usedInBatch: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async findAvailable() {
    return this.prisma.formalizer.findMany({
      orderBy: { name: 'asc' },
    });
  }

  getRequiredDocumentsConfig() {
    return REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES;
  }

  async create(dto: CreateFormalizerDto) {
    const docClean = dto.document.trim();
    const existing = await this.prisma.formalizer.findUnique({
      where: { document: docClean },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una persona registrada con el documento "${docClean}".`);
    }

    return this.prisma.formalizer.create({
      data: {
        name: dto.name.trim(),
        document: docClean,
        address: dto.address.trim(),
        phone: dto.phone?.trim() || '',
        city: dto.city?.trim() || 'Quibdó-Chocó',
        country: dto.country?.trim() || 'Colombia',
        status: FormalizerStatus.AVAILABLE,
      },
    });
  }

  async upsertFromBarequero(
    data: {
      name: string;
      document: string;
      address: string;
      phone?: string;
      city?: string;
      country?: string;
    },
    txClient?: Prisma.TransactionClient,
  ) {
    const client = txClient || this.prisma;
    const docClean = data.document.trim();

    const existing = await client.formalizer.findUnique({
      where: { document: docClean },
    });

    if (!existing) {
      return client.formalizer.create({
        data: {
          name: data.name.trim(),
          document: docClean,
          address: data.address.trim(),
          phone: data.phone?.trim() || '',
          city: data.city?.trim() || 'Quibdó-Chocó',
          country: data.country?.trim() || 'Colombia',
          status: FormalizerStatus.AVAILABLE,
        },
      });
    }

    // Si ya existe, actualizamos sus datos de contacto
    return client.formalizer.update({
      where: { id: existing.id },
      data: {
        name: data.name.trim() || existing.name,
        address: data.address.trim() || existing.address,
        phone: data.phone?.trim() || existing.phone,
        city: data.city?.trim() || existing.city,
      },
    });
  }

  async markAsUsed(
    personIds: string[],
    batchId: string,
    txClient: Prisma.TransactionClient,
  ) {
    // Validar que todas existan (un barequero puede ser utilizado múltiples veces)
    const persons = await txClient.formalizer.findMany({
      where: {
        id: { in: personIds },
      },
    });

    if (persons.length !== personIds.length) {
      throw new ConflictException(
        'Una o más de las personas seleccionadas no fueron encontradas en el sistema.',
      );
    }

    const now = new Date();
    await txClient.formalizer.updateMany({
      where: { id: { in: personIds } },
      data: {
        usedInBatchId: batchId,
        usedAt: now,
      },
    });
  }

  async findOne(id: string) {
    const formalizer = await this.prisma.formalizer.findUnique({
      where: { id },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        usedInBatch: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!formalizer) {
      throw new NotFoundException(`Barequero con ID "${id}" no encontrado.`);
    }

    return formalizer;
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
    },
  ) {
    await this.findOne(id);
    return this.prisma.formalizer.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        phone: data.phone !== undefined ? data.phone.trim() : undefined,
        address: data.address !== undefined ? data.address.trim() : undefined,
        city: data.city !== undefined ? data.city.trim() : undefined,
        country: data.country !== undefined ? data.country.trim() : undefined,
      },
      include: {
        documents: true,
        usedInBatch: true,
      },
    });
  }

  private generateDocumentName(category: string, documentNumber: string, originalName?: string): string {
    const categoryMap: Record<string, string> = {
      CEDULA_FRONT: 'cedula_frontal',
      CEDULA_BACK: 'cedula_posterior',
      RUT: 'rut',
      CERTIFICADO_BANCARIO: 'certificado_bancario',
      OTRO: 'documento',
    };
    const prefix = categoryMap[category] || 'documento';
    const cleanDoc = (documentNumber || '').replace(/[^a-zA-Z0-9]/g, '');
    const ext = originalName && originalName.includes('.')
      ? path.extname(originalName).toLowerCase()
      : '.pdf';
    return `${prefix}_${cleanDoc}${ext}`;
  }

  async addDocument(
    formalizerId: string,
    file: Express.Multer.File,
    category: string = 'OTRO',
    customName?: string,
  ) {
    const formalizer = await this.findOne(formalizerId);

    const uploadRes = await this.storageService.uploadFile(
      file,
      `barequeros/${formalizer.document}`,
    );

    const docName =
      customName?.trim() ||
      this.generateDocumentName(category, formalizer.document, file.originalname);

    return this.prisma.barequeroDocument.create({
      data: {
        formalizerId: formalizer.id,
        name: docName,
        category: category || 'OTRO',
        fileKey: uploadRes.fileKey,
        fileUrl: uploadRes.fileUrl,
        mimeType: uploadRes.mimeType,
        sizeBytes: uploadRes.sizeBytes,
      },
    });
  }

  async getDocumentById(docId: string) {
    return this.prisma.barequeroDocument.findUnique({
      where: { id: docId },
    });
  }

  async deleteDocument(formalizerId: string, documentId: string) {
    const doc = await this.prisma.barequeroDocument.findFirst({
      where: { id: documentId, formalizerId },
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

    await this.storageService.deleteFile(doc.fileKey);

    await this.prisma.barequeroDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Documento eliminado exitosamente', id: documentId };
  }

  async getDocumentFileStream(fileKey: string) {
    return this.storageService.getFileStream(fileKey);
  }
}
