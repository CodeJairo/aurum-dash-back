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
import { CapitalMovementType, PaymentAccount, Prisma } from '@prisma/client';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formalizersService: FormalizersService,
    private readonly capitalService: CapitalService,
  ) {}

  async create(companyId: string, dto: CreateBatchDto) {
    const existing = await this.prisma.batch.findFirst({
      where: { companyId, code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un lote con el código "${dto.code}".`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear el lote inicial
      const batch = await tx.batch.create({
        data: {
          companyId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });

      // 2. Si vienen compras seleccionadas, asociarlas (verificando que sean normales)
      if (dto.purchaseIds && dto.purchaseIds.length > 0) {
        const candidatePurchases = await tx.purchase.findMany({
          where: { id: { in: dto.purchaseIds }, companyId },
          select: { id: true, type: true, material: true },
        });

        if (candidatePurchases.length !== dto.purchaseIds.length) {
          throw new BadRequestException('Una o más compras seleccionadas no existen en la empresa.');
        }

        if (candidatePurchases.some((p) => p.type !== 'ACCOUNTING')) {
          throw new BadRequestException('Solo las compras normales se pueden asociar a un lote. Las compras a barequeros se usan para formalizar la venta.');
        }

        const materials = new Set(candidatePurchases.map((p) => p.material));
        if (materials.size > 1) {
          throw new BadRequestException('No se pueden mezclar compras de diferentes materiales en un mismo lote.');
        }
        const batchMaterial = candidatePurchases[0]?.material || 'GOLD';

        await tx.batch.update({
          where: { id: batch.id },
          data: { material: batchMaterial },
        });

        await tx.purchase.updateMany({
          where: { id: { in: dto.purchaseIds }, companyId },
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

  async unifyPurchases(companyId: string, dto: UnifyPurchasesDto) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: dto.batchId, companyId },
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
        where: { id: { in: dto.purchaseIds }, companyId },
        select: { id: true, batchId: true, type: true, material: true },
      });

      if (purchases.length !== dto.purchaseIds.length) {
        throw new BadRequestException('Una o más compras seleccionadas no pertenecen a la empresa.');
      }

      if (purchases.some((p) => p.type !== 'ACCOUNTING')) {
        throw new BadRequestException('Solo las compras normales se pueden asociar a un lote. Las compras a barequeros se usan para formalizar la venta.');
      }

      if (purchases.some((p) => p.material !== batch.material)) {
        throw new BadRequestException(
          `No se pueden anexar compras de material diferente al del lote (${batch.material === 'GOLD' ? 'Oro' : 'Platino'}).`,
        );
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
        where: { id: { in: dto.purchaseIds }, companyId },
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

  async disassociatePurchase(companyId: string, batchId: string, purchaseId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) {
      throw new NotFoundException(`El lote "${batchId}" no existe.`);
    }
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('No se pueden modificar compras de un lote cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.updateMany({
        where: { id: purchaseId, companyId },
        data: { batchId: null },
      });

      await this.recalculateBatchInTx(tx, batchId);

      return tx.batch.findUnique({
        where: { id: batchId },
        include: { purchases: true },
      });
    });
  }

  async findAll(companyId: string, status?: 'OPEN' | 'CLOSED') {
    const where: Prisma.BatchWhereInput = { companyId };
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

  async findOne(companyId: string, id: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id, companyId },
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

  async update(companyId: string, id: string, dto: UpdateBatchDto) {
    const batch = await this.findOne(companyId, id);

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

  async sellBatch(companyId: string, id: string, dto: SellBatchDto) {
    const batch = await this.findOne(companyId, id);
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
        where: { id: { in: dto.formalizationPurchaseIds }, companyId },
      });

      if (formalPurchases.length !== dto.formalizationPurchaseIds!.length) {
        throw new BadRequestException('Una o más compras a barequeros seleccionadas no fueron encontradas.');
      }

      for (const p of formalPurchases) {
        if (p.type !== 'FORMAL') {
          throw new BadRequestException(`La compra ${p.consecutive || p.id} no es de tipo Barequero.`);
        }
        if (p.material !== batch.material) {
          throw new BadRequestException(
            `La recepción ${p.consecutive || p.id} es de ${p.material === 'GOLD' ? 'Oro' : 'Platino'} y no puede formalizar un lote de ${batch.material === 'GOLD' ? 'Oro' : 'Platino'}.`,
          );
        }
        if (p.formalizedBatchId && p.formalizedBatchId !== batch.id) {
          throw new BadRequestException(`La compra a barequero ${p.consecutive || p.id} ya fue utilizada en otro lote.`);
        }
        if (p.isFormalizedHistorically) {
          throw new BadRequestException(`La compra a barequero ${p.consecutive || p.id} está marcada como ya formalizada históricamente.`);
        }
      }

      const totalBarequeroGross = formalPurchases.reduce((acc, p) => acc + Number(p.grossGrams), 0);
      const diff = Math.abs(totalBarequeroGross - finalGrossGrams);
      if (diff > 0.005 && !dto.allowDiscrepancy) {
        throw new BadRequestException(
          `Los gramos brutos de las compras a barequeros (${totalBarequeroGross.toFixed(2)} g) deben igualar exactamente los gramos brutos refundidos del lote (${finalGrossGrams.toFixed(2)} g). Diferencia: ${(totalBarequeroGross - finalGrossGrams).toFixed(2)} g.`,
        );
      }

      formalizerCount = formalPurchases.length;
    } else if (dto.formalizerIds && dto.formalizerIds.length > 0) {
      formalizerCount = dto.formalizerIds.length;
    } else if (dto.allowDiscrepancy) {
      formalizerCount = 0;
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
          where: { id: { in: dto.formalizationPurchaseIds }, companyId },
          data: { formalizedBatchId: batch.id },
        });
      }

      // Si se enviaron formalizadores personas (compatibilidad), marcarlos
      if (dto.formalizerIds && dto.formalizerIds.length > 0) {
        await this.formalizersService.markAsUsed(companyId, dto.formalizerIds, batch.id, tx);
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

      const destinationAccount = dto.destinationAccount || PaymentAccount.BANK;

      // 3. Registrar venta en tabla de ventas
      await tx.sale.create({
        data: {
          companyId,
          customer: `Venta Lote ${batch.code}`,
          description: dto.allowDiscrepancy
            ? `Venta con discrepancia / datos arbitrarios (${formalizerCount} compras a barequeros vinculadas, ${finalGrossGrams.toFixed(2)} g brutos / ${finalFineGrams.toFixed(2)} g finos).`
            : `Venta formalizada con ${formalizerCount} compras a barequeros (Gramos refundidos: ${finalGrossGrams.toFixed(2)} g brutos / ${finalFineGrams.toFixed(2)} g finos).`,
          grossGrams: new Prisma.Decimal(finalGrossGrams.toFixed(4)),
          fineGrams: new Prisma.Decimal(finalFineGrams.toFixed(4)),
          pricePerGram: dto.salePricePerGram ? new Prisma.Decimal(Number(dto.salePricePerGram).toFixed(2)) : null,
          totalAmount: new Prisma.Decimal(grossSale.toFixed(2)),
          destinationAccount,
          saleDate: dto.soldDate ? new Date(`${dto.soldDate.slice(0, 10)}T12:00:00`) : new Date(),
          batchId: batch.id,
        },
      });

      // 4. Ingresar la venta neta completa (capital invertido + utilidad) a la Cartera de Capital de Trabajo seleccionada
      // La utilidad queda retenida en el capital rotatorio hasta que se realice la liquidación del periodo
      if (netSale > 0) {
        await this.capitalService.recordSystemMovement(
          companyId,
          CapitalMovementType.BATCH_SALE_INCOME,
          netSale,
          `Ingreso venta neta lote ${batch.code} (${destinationAccount === PaymentAccount.BANK ? 'Banco' : 'Efectivo'})`,
          destinationAccount,
          batch.id,
          tx,
        );
      }

      return updatedBatch;
    });
  }

  async getFormalizationSuggestions(
    companyId: string,
    id: string,
    targetGrossOverride?: number,
    targetFineOverride?: number,
  ) {
    const batch = await this.findOne(companyId, id);
    const targetGrossGrams =
      targetGrossOverride !== undefined && targetGrossOverride > 0
        ? targetGrossOverride
        : Number(batch.meltedGrossGrams || batch.totalGrossGrams);
    const targetFineGrams =
      targetFineOverride !== undefined && targetFineOverride > 0
        ? targetFineOverride
        : Number(batch.meltedFineGrams || batch.totalFineGrams);

    const targetGrossCents = Math.round(targetGrossGrams * 100);
    const targetFineCents = Math.round(targetFineGrams * 100);

    const availablePurchases = await this.prisma.purchase.findMany({
      where: {
        companyId,
        type: 'FORMAL',
        material: batch.material,
        formalizedBatchId: null,
        grossGrams: { gt: 0 },
        isFormalizedHistorically: false,
      },
      orderBy: { consecutive: 'asc' },
    });

    const items = availablePurchases.map((p) => ({
      id: p.id,
      consecutive: p.consecutive || 'DH-?',
      supplier: p.supplier || 'Barequero',
      grossGrams: Number(p.grossGrams),
      fineGrams: Number(p.fineGrams),
      centsGross: Math.round(Number(p.grossGrams) * 100),
      centsFine: Math.round(Number(p.fineGrams) * 100),
      raw: p,
    }));

    const exactCombinations: Array<{
      purchaseIds: string[];
      consecutives: string[];
      totalGrossGrams: number;
      totalFineGrams: number;
      count: number;
    }> = [];

    type ClosestMatch = {
      selection: typeof items;
      sumGrossCents: number;
      sumFineCents: number;
      deficitCents: number;
    };

    let bestClosest: ClosestMatch | null = null;

    let iterations = 0;
    const maxIterations = 60000;

    function search(
      index: number,
      currentGross: number,
      currentFine: number,
      currentSelection: typeof items,
    ) {
      iterations++;
      if (iterations > maxIterations) return;
      if (exactCombinations.length >= 10) return;

      // Evaluar coincidencia exacta de brutos y finos (tolerancia de 1 centésima de gramo)
      const matchesGross = Math.abs(currentGross - targetGrossCents) <= 1;
      const matchesFine = Math.abs(currentFine - targetFineCents) <= 1;

      if (matchesGross && matchesFine && currentSelection.length > 0) {
        exactCombinations.push({
          purchaseIds: currentSelection.map((i) => i.id),
          consecutives: currentSelection.map((i) => i.consecutive),
          totalGrossGrams: Number((currentGross / 100).toFixed(2)),
          totalFineGrams: Number((currentFine / 100).toFixed(2)),
          count: currentSelection.length,
        });
        return;
      }

      // Evaluar como candidato de combinación más cercana sin pasarse
      if (currentGross <= targetGrossCents && currentFine <= targetFineCents && currentSelection.length > 0) {
        const deficit = (targetGrossCents - currentGross) + (targetFineCents - currentFine);
        if (!bestClosest || deficit < bestClosest.deficitCents) {
          bestClosest = {
            selection: currentSelection,
            sumGrossCents: currentGross,
            sumFineCents: currentFine,
            deficitCents: deficit,
          };
        }
      }

      // Poda si se pasa del objetivo
      if (currentGross > targetGrossCents || currentFine > targetFineCents || index >= items.length) {
        return;
      }

      for (let i = index; i < items.length; i++) {
        if (
          currentGross + items[i].centsGross <= targetGrossCents + 1 &&
          currentFine + items[i].centsFine <= targetFineCents + 1
        ) {
          search(
            i + 1,
            currentGross + items[i].centsGross,
            currentFine + items[i].centsFine,
            [...currentSelection, items[i]],
          );
        }
      }
    }

    search(0, 0, 0, []);

    exactCombinations.sort((a, b) => a.count - b.count);

    const hasExactMatch = exactCombinations.length > 0;
    let recommendation: any = null;

    if (!hasExactMatch) {
      const currentBest = bestClosest as ClosestMatch | null;
      const selectedItems: typeof items = currentBest ? currentBest.selection : [];
      const selectedGross = currentBest ? Number((currentBest.sumGrossCents / 100).toFixed(2)) : 0;
      const selectedFine = currentBest ? Number((currentBest.sumFineCents / 100).toFixed(2)) : 0;

      const missingGross = Math.max(0, Number((targetGrossGrams - selectedGross).toFixed(2)));
      const missingFine = Math.max(0, Number((targetFineGrams - selectedFine).toFixed(2)));
      const maxShortfall = Math.max(missingGross, missingFine);

      const setting = await this.prisma.systemSetting.findUnique({
        where: { companyId },
        select: { barequeroMaxGrams: true },
      });
      const limitPerBarequero = setting?.barequeroMaxGrams ? Number(setting.barequeroMaxGrams) : 70.9;
      const neededBarequeros = maxShortfall > 0 ? Math.ceil(maxShortfall / limitPerBarequero) : 1;
      const suggestedGrossPerBarequero = Number((missingGross / neededBarequeros).toFixed(2));
      const suggestedFinePerBarequero = Number((missingFine / neededBarequeros).toFixed(2));
      const suggestedPurity =
        suggestedGrossPerBarequero > 0
          ? Number(((suggestedFinePerBarequero / suggestedGrossPerBarequero) * 1000).toFixed(1))
          : 0;

      recommendation = {
        closestCombination: {
          purchaseIds: selectedItems.map((i) => i.id),
          consecutives: selectedItems.map((i) => i.consecutive),
          totalGrossGrams: selectedGross,
          totalFineGrams: selectedFine,
          count: selectedItems.length,
        },
        missingGrossGrams: missingGross,
        missingFineGrams: missingFine,
        neededBarequeros,
        suggestedGrossPerBarequero,
        suggestedFinePerBarequero,
        suggestedPurity,
        limitPerBarequero,
        message:
          neededBarequeros === 1
            ? `Se seleccionó la combinación más cercana disponible. Faltan ${missingGross.toFixed(2)} g brutos y ${missingFine.toFixed(2)} g finos. Se requiere registrar 1 compra a barequero adicional con ~${missingGross.toFixed(2)} g brutos y ~${missingFine.toFixed(2)} g finos (Ley ~${suggestedPurity}) para igualar el lote.`
            : `Se seleccionó la combinación más cercana disponible. Faltan ${missingGross.toFixed(2)} g brutos y ${missingFine.toFixed(2)} g finos. Dado que supera el límite por barequero de ${limitPerBarequero} g, se requiere registrar ${neededBarequeros} compras a barequeros adicionales con aprox. ~${suggestedGrossPerBarequero.toFixed(2)} g brutos y ~${suggestedFinePerBarequero.toFixed(2)} g finos (Ley ~${suggestedPurity}) cada una para completar el lote.`,
      };
    }

    const companySetting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
      select: { barequeroMaxGrams: true },
    });
    const finalLimitPerBarequero = companySetting?.barequeroMaxGrams ? Number(companySetting.barequeroMaxGrams) : 70.9;

    return {
      batchId: batch.id,
      batchCode: batch.code,
      targetGrossGrams,
      targetFineGrams,
      availablePurchases,
      limitPerBarequero: finalLimitPerBarequero,
      combinations: hasExactMatch
        ? exactCombinations
        : recommendation?.closestCombination
          ? [recommendation.closestCombination]
          : [],
      hasExactMatch,
      recommendation,
    };
  }

  async remove(companyId: string, id: string) {
    const batch = await this.findOne(companyId, id);
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede eliminar un lote cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Desvincular compras asociadas para no borrarlas del inventario histórico
      await tx.purchase.updateMany({
        where: { batchId: id, companyId },
        data: { batchId: null },
      });

      await tx.purchase.updateMany({
        where: { formalizedBatchId: id, companyId },
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
