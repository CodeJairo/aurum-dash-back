import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleDto) {
    if (dto.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch) {
        throw new NotFoundException(`El lote con ID "${dto.batchId}" no existe.`);
      }
      if (batch.status === 'CLOSED') {
        throw new BadRequestException('No se pueden registrar ventas en un lote cerrado.');
      }
    }

    const sale = await this.prisma.sale.create({
      data: {
        customer: dto.customer,
        description: dto.description,
        grossGrams: dto.grossGrams !== undefined ? new Prisma.Decimal(Number(dto.grossGrams).toFixed(4)) : null,
        fineGrams: dto.fineGrams !== undefined ? new Prisma.Decimal(Number(dto.fineGrams).toFixed(4)) : null,
        pricePerGram: dto.pricePerGram !== undefined ? new Prisma.Decimal(Number(dto.pricePerGram).toFixed(2)) : null,
        totalAmount: new Prisma.Decimal(Number(dto.totalAmount).toFixed(2)),
        saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
        batchId: dto.batchId ?? null,
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    if (dto.batchId) {
      await this.recalculateBatchFinancials(dto.batchId);
    }

    return sale;
  }

  async findAll(batchId?: string) {
    const where: Prisma.SaleWhereInput = {};
    if (batchId) {
      where.batchId = batchId;
    }

    return this.prisma.sale.findMany({
      where,
      orderBy: { saleDate: 'desc' },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        batch: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID "${id}" no encontrada.`);
    }

    return sale;
  }

  async update(id: string, dto: UpdateSaleDto) {
    const existing = await this.findOne(id);

    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede modificar una venta de un lote cerrado.');
    }

    const previousBatchId = existing.batchId;
    const newBatchId = dto.batchId !== undefined ? dto.batchId : previousBatchId;

    if (newBatchId && newBatchId !== previousBatchId) {
      const targetBatch = await this.prisma.batch.findUnique({
        where: { id: newBatchId },
      });
      if (!targetBatch) {
        throw new NotFoundException(`El lote "${newBatchId}" no existe.`);
      }
      if (targetBatch.status === 'CLOSED') {
        throw new BadRequestException('No se puede transferir una venta a un lote cerrado.');
      }
    }

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        customer: dto.customer !== undefined ? dto.customer : existing.customer,
        description: dto.description !== undefined ? dto.description : existing.description,
        grossGrams: dto.grossGrams !== undefined ? new Prisma.Decimal(Number(dto.grossGrams).toFixed(4)) : existing.grossGrams,
        fineGrams: dto.fineGrams !== undefined ? new Prisma.Decimal(Number(dto.fineGrams).toFixed(4)) : existing.fineGrams,
        pricePerGram: dto.pricePerGram !== undefined ? new Prisma.Decimal(Number(dto.pricePerGram).toFixed(2)) : existing.pricePerGram,
        totalAmount: dto.totalAmount !== undefined ? new Prisma.Decimal(Number(dto.totalAmount).toFixed(2)) : existing.totalAmount,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : existing.saleDate,
        batchId: newBatchId,
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    if (previousBatchId) {
      await this.recalculateBatchFinancials(previousBatchId);
    }
    if (newBatchId && newBatchId !== previousBatchId) {
      await this.recalculateBatchFinancials(newBatchId);
    }

    return updated;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede eliminar una venta de un lote cerrado.');
    }

    const batchId = existing.batchId;
    await this.prisma.sale.delete({
      where: { id },
    });

    if (batchId) {
      await this.recalculateBatchFinancials(batchId);
    }

    return { message: 'Venta eliminada exitosamente', id };
  }

  private async recalculateBatchFinancials(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) return;

    const salesAgg = await this.prisma.sale.aggregate({
      where: { batchId },
      _sum: { totalAmount: true },
    });

    const expensesAgg = await this.prisma.expense.aggregate({
      where: { batchId },
      _sum: { amount: true },
    });

    const totalSales = salesAgg._sum.totalAmount ?? new Prisma.Decimal(0);
    const totalExpenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalInvestment = batch.totalInvestment ?? new Prisma.Decimal(0);
    const netProfit = totalSales.minus(totalInvestment).minus(totalExpenses);

    await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        totalSales,
        totalExpenses,
        netProfit,
      },
    });
  }
}
