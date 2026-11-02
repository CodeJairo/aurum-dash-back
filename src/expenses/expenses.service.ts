import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapitalService } from '../capital/capital.service';
import { StorageService } from '../storage/storage.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  CapitalMovementType,
  ExpenseCategory,
  ExpenseStatus,
  PaymentAccount,
  Prisma,
} from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capitalService: CapitalService,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateExpenseDto, userId?: string) {
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
    const paymentAccount = dto.paymentAccount || PaymentAccount.CASH;
    const amountVal = Math.abs(Number(dto.amount));

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          description: dto.description.trim(),
          category,
          amount: new Prisma.Decimal(amountVal.toFixed(2)),
          paymentAccount,
          receiptUrl: dto.receiptUrl?.trim() || null,
          receiptKey: dto.receiptKey?.trim() || null,
          status: ExpenseStatus.PENDING,
          expenseDate: dto.expenseDate ? new Date(`${dto.expenseDate.slice(0, 10)}T12:00:00`) : new Date(),
          batchId: dto.batchId ?? null,
          createdById: userId ?? null,
        },
        include: {
          batch: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      });

      // Descontar inmediatamente de la cuenta de capital seleccionada (Caja o Banco)
      await this.capitalService.recordSystemMovement(
        CapitalMovementType.EXPENSE_PAYMENT,
        -amountVal,
        `Gasto: ${expense.description} (${paymentAccount === PaymentAccount.BANK ? 'Banco' : 'Efectivo'})`,
        paymentAccount,
        expense.id,
        tx,
      );

      if (dto.batchId) {
        await this.recalculateBatchFinancials(dto.batchId, tx);
      }

      return expense;
    });
  }

  async findAll(options?: {
    batchId?: string;
    category?: ExpenseCategory;
    status?: ExpenseStatus;
    paymentAccount?: PaymentAccount;
    startDate?: string;
    endDate?: string;
  }) {
    const where: Prisma.ExpenseWhereInput = {};

    if (options?.batchId) {
      where.batchId = options.batchId;
    }
    if (options?.category) {
      where.category = options.category;
    }
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.paymentAccount) {
      where.paymentAccount = options.paymentAccount;
    }
    if (options?.startDate || options?.endDate) {
      where.expenseDate = {};
      if (options.startDate) {
        where.expenseDate.gte = new Date(`${options.startDate.slice(0, 10)}T00:00:00`);
      }
      if (options.endDate) {
        where.expenseDate.lte = new Date(`${options.endDate.slice(0, 10)}T23:59:59.999`);
      }
    }

    return this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        monthlySettlement: {
          select: { id: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        batch: true,
        monthlySettlement: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException(`Gasto con ID "${id}" no encontrado.`);
    }

    return expense;
  }

  async uploadReceipt(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún comprobante.');
    }
    const uploaded = await this.storageService.uploadFile(file, 'expenses', '/api/expenses/receipt/file');
    return {
      fileUrl: uploaded.fileUrl,
      fileKey: uploaded.fileKey,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async getReceiptStream(key: string) {
    return this.storageService.getFileStream(key);
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const existing = await this.findOne(id);

    if (existing.status === ExpenseStatus.LIQUIDATED) {
      throw new BadRequestException('No se puede modificar un gasto que ya fue liquidado en un cierre mensual.');
    }

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

    if (existing.status === ExpenseStatus.LIQUIDATED) {
      throw new BadRequestException('No se puede eliminar un gasto que ya fue liquidado en un cierre mensual.');
    }

    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede eliminar un gasto de un lote cerrado.');
    }

    // Si tiene archivo de soporte, eliminarlo
    if (existing.receiptKey) {
      try {
        await this.storageService.deleteFile(existing.receiptKey);
      } catch (err) {
        // Ignorar si ya no existía en el bucket
      }
    }

    const batchId = existing.batchId;
    const amountVal = Number(existing.amount);
    const account = existing.paymentAccount;

    return this.prisma.$transaction(async (tx) => {
      // 1. Revertir el dinero al bolsillo de origen (Caja o Banco)
      await this.capitalService.recordSystemMovement(
        CapitalMovementType.MANUAL_ADJUSTMENT,
        amountVal,
        `Reintegro por eliminación de gasto: ${existing.description}`,
        account,
        existing.id,
        tx,
      );

      // 2. Eliminar el registro
      await tx.expense.delete({
        where: { id },
      });

      if (batchId) {
        await this.recalculateBatchFinancials(batchId, tx);
      }

      return { message: 'Gasto eliminado y capital reintegrado exitosamente', id };
    });
  }

  private async recalculateBatchFinancials(batchId: string, txClient?: Prisma.TransactionClient) {
    const client = txClient || this.prisma;
    const batch = await client.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) return;

    const salesAgg = await client.sale.aggregate({
      where: { batchId },
      _sum: { totalAmount: true },
    });

    const expensesAgg = await client.expense.aggregate({
      where: { batchId },
      _sum: { amount: true },
    });

    const totalSales = salesAgg._sum.totalAmount ?? new Prisma.Decimal(0);
    const totalExpenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalInvestment = batch.totalInvestment ?? new Prisma.Decimal(0);
    const netProfit = totalSales.minus(totalInvestment).minus(totalExpenses);

    await client.batch.update({
      where: { id: batchId },
      data: {
        totalSales,
        totalExpenses,
        netProfit,
      },
    });
  }
}
