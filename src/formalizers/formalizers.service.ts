import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormalizerDto } from './dto/create-formalizer.dto';
import { FormalizerStatus, Prisma } from '@prisma/client';

@Injectable()
export class FormalizersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: 'AVAILABLE' | 'USED') {
    const where: Prisma.FormalizerWhereInput = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.formalizer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        usedInBatch: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async findAvailable() {
    return this.prisma.formalizer.findMany({
      where: { status: FormalizerStatus.AVAILABLE },
      orderBy: { name: 'asc' },
    });
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

    // Si ya existe pero aún está disponible, actualizamos sus datos de contacto
    if (existing.status === FormalizerStatus.AVAILABLE) {
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

    return existing;
  }

  async markAsUsed(
    personIds: string[],
    batchId: string,
    txClient: Prisma.TransactionClient,
  ) {
    // Validar que todas existan y estén en estado AVAILABLE
    const persons = await txClient.formalizer.findMany({
      where: {
        id: { in: personIds },
        status: FormalizerStatus.AVAILABLE,
      },
    });

    if (persons.length !== personIds.length) {
      throw new ConflictException(
        'Una o más de las personas seleccionadas ya han sido utilizadas o no están disponibles.',
      );
    }

    const now = new Date();
    await txClient.formalizer.updateMany({
      where: { id: { in: personIds } },
      data: {
        status: FormalizerStatus.USED,
        usedInBatchId: batchId,
        usedAt: now,
      },
    });
  }
}
