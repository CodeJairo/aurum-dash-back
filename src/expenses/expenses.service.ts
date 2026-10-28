import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, ExpenseCategoryDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseCategory, Prisma } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto) {
    if (dto.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch) {
        throw new NotFoundException(`El lote con ID "${dto.batchId}" no existe.`);
      }
      if (batch.status === 'CLOSED') {
        throw new BadRequestException('No se pueden registrar gastos en un lote cerrado.');
      }
    }

    const category = (dto.category as ExpenseCategory) ?? ExpenseCategory.OPERATIONAL;

    const expense = await this.prisma.expense.create({
      data: {
        description: dto.description.trim(),
        category,
        amount: new Prisma.Decimal(Number(dto.amount).toFixed(2)),
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
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

    return expense;
  }

  async findAll(batchId?: string, category?: ExpenseCategory) {
    const where: Prisma.ExpenseWhereInput = {};
    if (batchId) {
      where.batchId = batchId;
    }
    if (category) {
      where.category = category;
    }

    return this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        batch: true,
      },
    });

    if (!expense) {
      throw new NotFoundException(`Gasto con ID "${id}" no encontrado.`);
    }

    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const existing = await this.findOne(id);

    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede modificar un gasto de un lote cerrado.');
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
        throw new BadRequestException('No se puede transferir un gasto a un lote cerrado.');
      }
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        description: dto.description !== undefined ? dto.description.trim() : existing.description,
        category: dto.category ? (dto.category as ExpenseCategory) : existing.category,
        amount: dto.amount !== undefined ? new Prisma.Decimal(Number(dto.amount).toFixed(2)) : existing.amount,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : existing.expenseDate,
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
      throw new BadRequestException('No se puede eliminar un gasto de un lote cerrado.');
    }

    const batchId = existing.batchId;
    await this.prisma.expense.delete({
      where: { id },
    });

    if (batchId) {
      await this.recalculateBatchFinancials(batchId);
    }

    return { message: 'Gasto eliminado exitosamente', id };
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
