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

      // 2. Si vienen compras seleccionadas, asociarlas (verificando que sean normales)
      if (dto.purchaseIds && dto.purchaseIds.length > 0) {
        const candidatePurchases = await tx.purchase.findMany({
          where: { id: { in: dto.purchaseIds } },
          select: { id: true, type: true },
        });

        if (candidatePurchases.some((p) => p.type !== 'ACCOUNTING')) {
          throw new BadRequestException('Solo las compras normales se pueden asociar a un lote. Las compras a barequeros se usan para formalizar la venta.');
        }

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
      // Obtener compras para verificar si pertenecían a otro lote previo y validar que sean contables normales
      const purchases = await tx.purchase.findMany({
        where: { id: { in: dto.purchaseIds } },
        select: { id: true, batchId: true, type: true },
      });

      if (purchases.some((p) => p.type !== 'ACCOUNTING')) {
        throw new BadRequestException('Solo las compras normales se pueden asociar a un lote. Las compras a barequeros se usan para formalizar la venta.');
      }

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
        purchases: {
          select: { id: true, consecutive: true, supplier: true, grossGrams: true, fineGrams: true, totalCost: true },
        },
        formalizedPurchases: {
          select: { id: true, consecutive: true, supplier: true, grossGrams: true, fineGrams: true, totalCost: true },
        },
        _count: {
          select: { purchases: true, formalizedPurchases: true, sales: true, expenses: true },
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
        formalizedPurchases: {
          orderBy: { consecutive: 'asc' },
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
        formalizers: true,
        _count: {
          select: { purchases: true, formalizedPurchases: true, sales: true, expenses: true },
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
          select: { purchases: true, formalizedPurchases: true, sales: true, expenses: true },
        },
      },
    });
  }

  async sellBatch(id: string, dto: SellBatchDto) {
    const batch = await this.findOne(id);
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('Este lote ya se encuentra cerrado / vendido.');
    }

    const initialGross = Number(batch.totalGrossGrams);
    const initialFine = Number(batch.totalFineGrams);
    if (initialGross <= 0) {
      throw new BadRequestException('El lote no contiene gramos de oro para liquidar.');
    }

    // Permitir modificar gramos brutos y finos por proceso de refundición
    const finalGrossGrams =
      dto.meltedGrossGrams !== undefined && Number(dto.meltedGrossGrams) > 0
        ? Number(Number(dto.meltedGrossGrams).toFixed(4))
        : initialGross;
    const finalFineGrams =
      dto.meltedFineGrams !== undefined && Number(dto.meltedFineGrams) > 0
        ? Number(Number(dto.meltedFineGrams).toFixed(4))
        : initialFine;

    let formalizerCount = 0;
    const usesFormalPurchases = dto.formalizationPurchaseIds && dto.formalizationPurchaseIds.length > 0;

    if (usesFormalPurchases) {
      const formalPurchases = await this.prisma.purchase.findMany({
        where: { id: { in: dto.formalizationPurchaseIds } },
      });

      if (formalPurchases.length !== dto.formalizationPurchaseIds!.length) {
        throw new BadRequestException('Una o más compras a barequeros seleccionadas no fueron encontradas.');
      }

      for (const p of formalPurchases) {
        if (p.type !== 'FORMAL') {
          throw new BadRequestException(`La compra ${p.consecutive || p.id} no es de tipo Barequero.`);
        }
        if (p.formalizedBatchId && p.formalizedBatchId !== batch.id) {
          throw new BadRequestException(`La compra a barequero ${p.consecutive || p.id} ya fue utilizada en otro lote.`);
        }
      }

      const totalBarequeroGross = formalPurchases.reduce((acc, p) => acc + Number(p.grossGrams), 0);
      const diff = Math.abs(totalBarequeroGross - finalGrossGrams);
      if (diff > 0.005) {
        throw new BadRequestException(
          `Los gramos brutos de las compras a barequeros (${totalBarequeroGross.toFixed(2)} g) deben igualar exactamente los gramos brutos refundidos del lote (${finalGrossGrams.toFixed(2)} g). Diferencia: ${(totalBarequeroGross - finalGrossGrams).toFixed(2)} g.`,
        );
      }

      formalizerCount = formalPurchases.length;
    } else if (dto.formalizerIds && dto.formalizerIds.length > 0) {
      formalizerCount = dto.formalizerIds.length;
    } else {
      throw new BadRequestException('Debes seleccionar las compras a barequeros necesarias para formalizar la venta del lote.');
    }

    const grossSale = Number(dto.grossSaleAmount);
    const fourPerThousand = Number((grossSale * 0.004).toFixed(2));
    const costPerPerson = dto.formalizationCostPerPerson !== undefined ? Number(dto.formalizationCostPerPerson) : 170000;
    const formalizationTotal = Number((formalizerCount * costPerPerson).toFixed(2));
    const otherExpenses = dto.otherExpensesAmount ? Number(dto.otherExpensesAmount) : 0;
    const netSale = Number((grossSale - fourPerThousand - formalizationTotal - otherExpenses).toFixed(2));
    const totalInvestment = Number(batch.totalInvestment);
    const netProfit = Number((netSale - totalInvestment).toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      // 1. Vincular compras a barequeros al lote si aplica
      if (usesFormalPurchases && dto.formalizationPurchaseIds) {
        await tx.purchase.updateMany({
          where: { id: { in: dto.formalizationPurchaseIds } },
          data: { formalizedBatchId: batch.id },
        });
      }

      // Si se enviaron formalizadores personas (compatibilidad), marcarlos
      if (dto.formalizerIds && dto.formalizerIds.length > 0) {
        await this.formalizersService.markAsUsed(dto.formalizerIds, batch.id, tx);
      }

      // 2. Cerrar lote con métricas financieras de venta y gramos refundidos
      const updatedBatch = await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: 'CLOSED',
          initialGrossGrams: new Prisma.Decimal(initialGross.toFixed(4)),
          initialFineGrams: new Prisma.Decimal(initialFine.toFixed(4)),
          meltedGrossGrams: new Prisma.Decimal(finalGrossGrams.toFixed(4)),
          meltedFineGrams: new Prisma.Decimal(finalFineGrams.toFixed(4)),
          totalGrossGrams: new Prisma.Decimal(finalGrossGrams.toFixed(4)),
          totalFineGrams: new Prisma.Decimal(finalFineGrams.toFixed(4)),
          formalizerCount,
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
          soldAt: dto.soldDate ? new Date(`${dto.soldDate.slice(0, 10)}T12:00:00`) : new Date(),
          closedAt: new Date(),
        },
        include: {
          formalizers: true,
          purchases: true,
          formalizedPurchases: true,
        },
      });

      // 3. Registrar venta en tabla de ventas
      await tx.sale.create({
        data: {
          customer: `Venta Lote ${batch.code}`,
          description: `Venta formalizada con ${formalizerCount} compras a barequeros (Gramos refundidos: ${finalGrossGrams.toFixed(2)} g brutos / ${finalFineGrams.toFixed(2)} g finos).`,
          grossGrams: new Prisma.Decimal(finalGrossGrams.toFixed(4)),
          fineGrams: new Prisma.Decimal(finalFineGrams.toFixed(4)),
          pricePerGram: dto.salePricePerGram ? new Prisma.Decimal(Number(dto.salePricePerGram).toFixed(2)) : null,
          totalAmount: new Prisma.Decimal(grossSale.toFixed(2)),
          saleDate: dto.soldDate ? new Date(`${dto.soldDate.slice(0, 10)}T12:00:00`) : new Date(),
          batchId: batch.id,
        },
      });

      // 4. Reintegrar únicamente el capital invertido a la Cartera de Capital de Trabajo
      // La utilidad neta generada no se mezcla en el capital rotatorio; queda en la bolsa de utilidades del periodo
      const capitalReplenishment = Math.max(0, Math.min(totalInvestment, netSale));
      if (capitalReplenishment > 0) {
        await this.capitalService.recordSystemMovement(
          CapitalMovementType.BATCH_SALE_INCOME,
          capitalReplenishment,
          `Reintegro de capital invertido lote ${batch.code}`,
          batch.id,
          tx,
        );
      }

      return updatedBatch;
    });
  }

  async getFormalizationSuggestions(id: string, targetGrossOverride?: number) {
    const batch = await this.findOne(id);
    const targetGrams =
      targetGrossOverride !== undefined && targetGrossOverride > 0
        ? targetGrossOverride
        : Number(batch.totalGrossGrams);
    const targetCents = Math.round(targetGrams * 100);

    const availablePurchases = await this.prisma.purchase.findMany({
      where: {
        type: 'FORMAL',
        formalizedBatchId: null,
      },
      orderBy: { consecutive: 'asc' },
    });

    const items = availablePurchases.map((p) => ({
      id: p.id,
      consecutive: p.consecutive || 'DH-?',
      supplier: p.supplier || 'Barequero',
      grossGrams: Number(p.grossGrams),
      cents: Math.round(Number(p.grossGrams) * 100),
      raw: p,
    }));

    const combinations: Array<{
      purchaseIds: string[];
      consecutives: string[];
      totalGrams: number;
      count: number;
    }> = [];

    function search(index: number, currentSum: number, currentSelection: typeof items) {
      if (combinations.length >= 10) return;
      if (currentSum === targetCents) {
        combinations.push({
          purchaseIds: currentSelection.map((i) => i.id),
          consecutives: currentSelection.map((i) => i.consecutive),
          totalGrams: Number((currentSum / 100).toFixed(2)),
          count: currentSelection.length,
        });
        return;
      }
      if (currentSum > targetCents || index >= items.length) return;

      for (let i = index; i < items.length; i++) {
        if (currentSum + items[i].cents <= targetCents) {
          search(i + 1, currentSum + items[i].cents, [...currentSelection, items[i]]);
        }
      }
    }

    search(0, 0, []);

    combinations.sort((a, b) => a.count - b.count);

    return {
      batchId: batch.id,
      batchCode: batch.code,
      targetGrossGrams: targetGrams,
      availablePurchases,
      combinations,
      hasExactMatch: combinations.length > 0,
    };
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

      await tx.purchase.updateMany({
        where: { formalizedBatchId: id },
        data: { formalizedBatchId: null },
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
