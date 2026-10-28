import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloseBatchDto } from './dto/close-batch.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async simulate(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        purchases: {
          select: { id: true, grossGrams: true, fineGrams: true, totalCost: true },
        },
        sales: {
          select: { id: true, totalAmount: true, customer: true, saleDate: true },
        },
        expenses: {
          select: { id: true, amount: true, category: true, description: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote con ID "${batchId}" no encontrado.`);
    }

    const totalInvestment = Number(batch.totalInvestment);

    const totalSales = batch.sales.reduce(
      (sum, s) => sum + Number(s.totalAmount),
      0,
    );

    let fourPerThousand = 0;
    let otherExpenses = 0;
    for (const exp of batch.expenses) {
      const amt = Number(exp.amount);
      if (exp.category === 'FOUR_PER_THOUSAND') {
        fourPerThousand += amt;
      } else {
        otherExpenses += amt;
      }
    }
    const totalExpenses = fourPerThousand + otherExpenses;

    const netProfit = totalSales - totalInvestment - totalExpenses;

    const defaultClientPercent = 50.0;
    const defaultPartnerPercent = 50.0;
    const clientProfit = (netProfit * defaultClientPercent) / 100.0;
    const partnerProfit = (netProfit * defaultPartnerPercent) / 100.0;

    return {
      batch: {
        id: batch.id,
        code: batch.code,
        name: batch.name,
        status: batch.status,
        totalGrossGrams: Number(batch.totalGrossGrams),
        totalFineGrams: Number(batch.totalFineGrams),
        averageCostPerFineGram: Number(batch.averageCostPerFineGram),
        purchasesCount: batch.purchases.length,
        salesCount: batch.sales.length,
        expensesCount: batch.expenses.length,
      },
      financials: {
        totalInvestment,
        totalSales,
        fourPerThousand,
        otherExpenses,
        totalExpenses,
        netProfit,
        profitMarginPercent: totalSales > 0 ? (netProfit / totalSales) * 100 : 0,
      },
      distribution: {
        clientPercent: defaultClientPercent,
        clientProfit,
        partnerPercent: defaultPartnerPercent,
        partnerProfit,
      },
    };
  }

  async closeBatch(dto: CloseBatchDto) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
      include: {
        sales: true,
        expenses: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote con ID "${dto.batchId}" no encontrado.`);
    }

    if (batch.status === 'CLOSED') {
      throw new BadRequestException('Este lote ya se encuentra cerrado / liquidado.');
    }

    const clientPercent = dto.clientPercent !== undefined ? Number(dto.clientPercent) : 50.0;
    const partnerPercent = dto.partnerPercent !== undefined ? Number(dto.partnerPercent) : 50.0;

    if (Math.abs(clientPercent + partnerPercent - 100) > 0.01) {
      throw new BadRequestException('La suma de los porcentajes de los socios debe ser exactamente 100%.');
    }

    return this.prisma.$transaction(async (tx) => {
      const totalInvestment = batch.totalInvestment;

      const salesAgg = await tx.sale.aggregate({
        where: { batchId: dto.batchId },
        _sum: { totalAmount: true },
      });
      const totalSales = salesAgg._sum.totalAmount ?? new Prisma.Decimal(0);

      const expensesAgg = await tx.expense.aggregate({
        where: { batchId: dto.batchId },
        _sum: { amount: true },
      });
      const totalExpenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);

      const netProfit = totalSales.minus(totalInvestment).minus(totalExpenses);

      const clientRatio = new Prisma.Decimal(clientPercent / 100.0);
      const partnerRatio = new Prisma.Decimal(partnerPercent / 100.0);

      const clientProfit = netProfit.mul(clientRatio);
      const partnerProfit = netProfit.mul(partnerRatio);

      // Crear registro inmutable de liquidación
      const settlement = await tx.settlement.create({
        data: {
          batchId: dto.batchId,
          totalSales,
          totalCost: totalInvestment,
          totalExpenses,
          netProfit,
          clientProfit,
          partnerProfit,
          clientPercent: new Prisma.Decimal(clientPercent.toFixed(2)),
          partnerPercent: new Prisma.Decimal(partnerPercent.toFixed(2)),
          notes: dto.notes?.trim(),
          settlementDate: new Date(),
        },
      });

      // Congelar y cerrar el lote
      const closedBatch = await tx.batch.update({
        where: { id: dto.batchId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          totalSales,
          totalExpenses,
          netProfit,
        },
      });

      return {
        settlement,
        batch: closedBatch,
      };
    });
  }

  async reopenBatch(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Lote "${batchId}" no encontrado.`);
    }

    if (batch.status === 'OPEN') {
      throw new BadRequestException('El lote ya se encuentra abierto.');
    }

    return this.prisma.batch.update({
      where: { id: batchId },
      data: {
        status: 'OPEN',
        closedAt: null,
      },
    });
  }

  async findAll(batchId?: string) {
    const where: Prisma.SettlementWhereInput = {};
    if (batchId) {
      where.batchId = batchId;
    }

    return this.prisma.settlement.findMany({
      where,
      orderBy: { settlementDate: 'desc' },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }
}
