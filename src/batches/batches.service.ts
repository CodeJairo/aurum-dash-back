import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormalizersService } from '../formalizers/formalizers.service';
import { CapitalService } from '../capital/capital.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UnifyPurchasesDto } from './dto/unify-purchases.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { SellBatchDto } from './dto/sell-batch.dto';
import { CapitalMovementType, Prisma } from '@prisma/client';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formalizersService: FormalizersService,
    private readonly capitalService: CapitalService,
  ) {}

  async create(dto: CreateBatchDto) {
    const existing = await this.prisma.batch.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un lote con el código "${dto.code}".`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear el lote inicial
      const batch = await tx.batch.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });

      // 2. Si vienen compras seleccionadas, asociarlas
      if (dto.purchaseIds && dto.purchaseIds.length > 0) {
        await tx.purchase.updateMany({
          where: { id: { in: dto.purchaseIds } },
          data: { batchId: batch.id },
        });

        // 3. Recalcular consolidación del lote
        await this.recalculateBatchInTx(tx, batch.id);
      }

      return tx.batch.findUnique({
        where: { id: batch.id },
        include: {
          purchases: {
            orderBy: { purchaseDate: 'desc' },
          },
          _count: {
            select: { purchases: true, sales: true, expenses: true },
          },
        },
      });
    });
  }

  async unifyPurchases(dto: UnifyPurchasesDto) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
    });
    if (!batch) {
      throw new NotFoundException(`El lote con ID "${dto.batchId}" no existe.`);
    }
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('No se pueden anexar compras a un lote cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Obtener compras para verificar si pertenecían a otro lote previo
      const purchases = await tx.purchase.findMany({
        where: { id: { in: dto.purchaseIds } },
        select: { id: true, batchId: true },
      });

      const previousBatchIds = Array.from(
        new Set(
          purchases
            .map((p) => p.batchId)
            .filter((id): id is string => id !== null && id !== dto.batchId),
        ),
      );

      // Asociar compras al lote destino
      await tx.purchase.updateMany({
        where: { id: { in: dto.purchaseIds } },
        data: { batchId: dto.batchId },
      });

      // Recalcular lote destino
      await this.recalculateBatchInTx(tx, dto.batchId);

      // Recalcular lotes previos de donde salieron
      for (const prevId of previousBatchIds) {
        await this.recalculateBatchInTx(tx, prevId);
      }

      return tx.batch.findUnique({
        where: { id: dto.batchId },
        include: {
          purchases: {
            orderBy: { purchaseDate: 'desc' },
          },
          _count: {
            select: { purchases: true, sales: true, expenses: true },
          },
        },
      });
    });
  }

  async disassociatePurchase(batchId: string, purchaseId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException(`El lote "${batchId}" no existe.`);
    }
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('No se pueden modificar compras de un lote cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchaseId },
        data: { batchId: null },
      });

      await this.recalculateBatchInTx(tx, batchId);

      return tx.batch.findUnique({
        where: { id: batchId },
        include: { purchases: true },
      });
    });
  }

  async findAll(status?: 'OPEN' | 'CLOSED') {
    const where: Prisma.BatchWhereInput = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.batch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { purchases: true, sales: true, expenses: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        purchases: {
          orderBy: { purchaseDate: 'desc' },
        },
        sales: {
          orderBy: { saleDate: 'desc' },
        },
        expenses: {
          orderBy: { expenseDate: 'desc' },
        },
        settlements: {
          orderBy: { settlementDate: 'desc' },
        },
        _count: {
          select: { purchases: true, sales: true, expenses: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote con ID "${id}" no encontrado.`);
    }

    return batch;
  }

  async update(id: string, dto: UpdateBatchDto) {
    const batch = await this.findOne(id);

    return this.prisma.batch.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : batch.name,
        description: dto.description !== undefined ? dto.description?.trim() : batch.description,
        status: dto.status !== undefined ? dto.status : batch.status,
      },
      include: {
        _count: {
          select: { purchases: true, sales: true, expenses: true },
        },
      },
    });
  }

  async sellBatch(id: string, dto: SellBatchDto) {
    const batch = await this.findOne(id);
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('Este lote ya se encuentra cerrado / vendido.');
    }

    const grossGrams = Number(batch.totalGrossGrams);
    if (grossGrams <= 0) {
      throw new BadRequestException('El lote no contiene gramos de oro para liquidar.');
    }

    // Regla de formalización: ceil(grossGrams / 70)
    const requiredPeople = Math.ceil(grossGrams / 70);
    if (!dto.formalizerIds || dto.formalizerIds.length !== requiredPeople) {
      throw new BadRequestException(
        `Para formalizar este lote (${grossGrams.toFixed(2)} g brutos / 70) se requieren exactamente ${requiredPeople} personas, pero se seleccionaron ${dto.formalizerIds?.length || 0}.`,
      );
    }

    const grossSale = Number(dto.grossSaleAmount);
    const fourPerThousand = Number((grossSale * 0.004).toFixed(2));
    const costPerPerson = dto.formalizationCostPerPerson !== undefined ? Number(dto.formalizationCostPerPerson) : 170000;
    const formalizationTotal = Number((requiredPeople * costPerPerson).toFixed(2));
    const otherExpenses = dto.otherExpensesAmount ? Number(dto.otherExpensesAmount) : 0;
    const netSale = Number((grossSale - fourPerThousand - formalizationTotal - otherExpenses).toFixed(2));
    const totalInvestment = Number(batch.totalInvestment);
    const netProfit = Number((netSale - totalInvestment).toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      // 1. Bloquear y marcar formalizadores como USED asociados al lote
      await this.formalizersService.markAsUsed(dto.formalizerIds, batch.id, tx);

      // 2. Cerrar lote con métricas financieras de venta
      const updatedBatch = await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: 'CLOSED',
          formalizerCount: requiredPeople,
          formalizationCostPerPerson: new Prisma.Decimal(costPerPerson.toFixed(2)),
          formalizationTotalCost: new Prisma.Decimal(formalizationTotal.toFixed(2)),
          fourPerThousandAmount: new Prisma.Decimal(fourPerThousand.toFixed(2)),
          otherExpensesAmount: new Prisma.Decimal(otherExpenses.toFixed(2)),
          otherExpensesConcept: dto.otherExpensesConcept?.trim() || null,
          grossSaleAmount: new Prisma.Decimal(grossSale.toFixed(2)),
          netSaleAmount: new Prisma.Decimal(netSale.toFixed(2)),
          totalSales: new Prisma.Decimal(netSale.toFixed(2)),
          totalExpenses: new Prisma.Decimal((fourPerThousand + formalizationTotal + otherExpenses).toFixed(2)),
          netProfit: new Prisma.Decimal(netProfit.toFixed(2)),
          salePricePerGram: dto.salePricePerGram ? new Prisma.Decimal(Number(dto.salePricePerGram).toFixed(2)) : null,
          soldAt: dto.soldDate ? new Date(dto.soldDate) : new Date(),
          closedAt: new Date(),
        },
        include: {
          formalizers: true,
          purchases: true,
        },
      });

      // 3. Registrar venta en tabla de ventas
      await tx.sale.create({
        data: {
          customer: `Venta Lote ${batch.code}`,
          description: `Venta formalizada con ${requiredPeople} personas.`,
          grossGrams: batch.totalGrossGrams,
          fineGrams: batch.totalFineGrams,
          pricePerGram: dto.salePricePerGram ? new Prisma.Decimal(Number(dto.salePricePerGram).toFixed(2)) : null,
          totalAmount: new Prisma.Decimal(grossSale.toFixed(2)),
          saleDate: dto.soldDate ? new Date(dto.soldDate) : new Date(),
          batchId: batch.id,
        },
      });

      // 4. Sumar el valor neto final a la Cartera de Capital
      await this.capitalService.recordSystemMovement(
        CapitalMovementType.BATCH_SALE_INCOME,
        netSale,
        `Ingreso neto venta lote ${batch.code} (Deducidos 4x1000, formalización y gastos)`,
        batch.id,
        tx,
      );

      return updatedBatch;
    });
  }

  async remove(id: string) {
    const batch = await this.findOne(id);
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede eliminar un lote cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Desvincular compras asociadas para no borrarlas del inventario histórico
      await tx.purchase.updateMany({
        where: { batchId: id },
        data: { batchId: null },
      });

      await tx.batch.delete({
        where: { id },
      });

      return { message: `Lote "${batch.code}" eliminado. Compras desvinculadas.`, id };
    });
  }

  private async recalculateBatchInTx(tx: Prisma.TransactionClient, batchId: string) {
    const purchases = await tx.purchase.findMany({
      where: { batchId },
    });

    let totalGross = new Prisma.Decimal(0);
    let totalFine = new Prisma.Decimal(0);
    let totalInvestment = new Prisma.Decimal(0);

    for (const p of purchases) {
      totalGross = totalGross.plus(p.grossGrams);
      totalFine = totalFine.plus(p.fineGrams);
      totalInvestment = totalInvestment.plus(p.totalCost);
    }

    const avgCostPerFineGram = totalFine.greaterThan(0)
      ? totalInvestment.dividedBy(totalFine)
      : new Prisma.Decimal(0);

    await tx.batch.update({
      where: { id: batchId },
      data: {
        totalGrossGrams: totalGross,
        totalFineGrams: totalFine,
        totalInvestment: totalInvestment,
        averageCostPerFineGram: avgCostPerFineGram,
      },
    });
  }
}
