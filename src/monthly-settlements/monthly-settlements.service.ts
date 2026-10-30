import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMonthlySettlementDto } from './dto/create-monthly-settlement.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MonthlySettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDateBoundaries(startDateStr: string, endDateStr: string) {
    const [sYear, sMonth, sDay] = startDateStr.slice(0, 10).split('-').map(Number);
    const [eYear, eMonth, eDay] = endDateStr.slice(0, 10).split('-').map(Number);

    // Para la consulta de lotes: cubrimos desde las 00:00:00.000 locales del primer día
    // hasta las 23:59:59.999 locales del último día
    const queryStart = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
    const queryEnd = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);

    // Para almacenar en BD como fecha representativa del periodo (al mediodía local para evitar desfases de huso horario):
    const storeStart = new Date(sYear, sMonth - 1, sDay, 12, 0, 0, 0);
    const storeEnd = new Date(eYear, eMonth - 1, eDay, 12, 0, 0, 0);

    return { queryStart, queryEnd, storeStart, storeEnd };
  }

  async preview(startDateStr: string, endDateStr: string) {
    if (!startDateStr || !endDateStr) {
      throw new BadRequestException('Se requieren las fechas de inicio y fin.');
    }

    const { queryStart, queryEnd, storeStart, storeEnd } = this.parseDateBoundaries(
      startDateStr,
      endDateStr,
    );

    if (queryStart > queryEnd) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha fin.');
    }

    // Buscar lotes vendidos y cerrados en el rango que no hayan sido liquidados aún
    const batches = await this.prisma.batch.findMany({
      where: {
        status: 'CLOSED',
        monthlySettlementId: null,
        soldAt: {
          gte: queryStart,
          lte: queryEnd,
        },
      },
      orderBy: { soldAt: 'asc' },
    });

    let totalGrossSales = 0;
    let totalDirectExpenses = 0;
    let totalNetSales = 0;
    let totalInvestmentCost = 0;
    let commercialProfit = 0;
    let totalFineGrams = 0;
    let totalGrossGrams = 0;

    for (const b of batches) {
      totalGrossSales += Number(b.grossSaleAmount || 0);
      totalDirectExpenses += Number(b.totalExpenses || 0);
      totalNetSales += Number(b.netSaleAmount || 0);
      totalInvestmentCost += Number(b.totalInvestment || 0);
      commercialProfit += Number(b.netProfit || 0);
      totalFineGrams += Number(b.totalFineGrams || 0);
      totalGrossGrams += Number(b.totalGrossGrams || 0);
    }

    return {
      period: {
        startDate: storeStart,
        endDate: storeEnd,
      },
      batchesCount: batches.length,
      totals: {
        totalGrossGrams: Number(totalGrossGrams.toFixed(2)),
        totalFineGrams: Number(totalFineGrams.toFixed(2)),
        totalGrossSales: Number(totalGrossSales.toFixed(2)),
        totalDirectExpenses: Number(totalDirectExpenses.toFixed(2)),
        totalNetSales: Number(totalNetSales.toFixed(2)),
        totalInvestmentCost: Number(totalInvestmentCost.toFixed(2)),
        commercialProfit: Number(commercialProfit.toFixed(2)),
      },
      batches: batches.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        soldAt: b.soldAt,
        grossGrams: Number(b.totalGrossGrams),
        fineGrams: Number(b.totalFineGrams),
        grossSaleAmount: Number(b.grossSaleAmount || 0),
        directExpenses: Number(b.totalExpenses || 0),
        netSaleAmount: Number(b.netSaleAmount || 0),
        totalInvestment: Number(b.totalInvestment || 0),
        netProfit: Number(b.netProfit || 0),
      })),
    };
  }

  async create(dto: CreateMonthlySettlementDto, userId?: string) {
    const { queryStart, queryEnd, storeStart, storeEnd } = this.parseDateBoundaries(
      dto.startDate,
      dto.endDate,
    );

    if (queryStart > queryEnd) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha fin.');
    }

    // Identificar lotes a incluir
    let batchIds = dto.batchIds;
    if (!batchIds || batchIds.length === 0) {
      const candidates = await this.prisma.batch.findMany({
        where: {
          status: 'CLOSED',
          monthlySettlementId: null,
          soldAt: {
            gte: queryStart,
            lte: queryEnd,
          },
        },
        select: { id: true },
      });
      batchIds = candidates.map((c) => c.id);
    }

    const batches = await this.prisma.batch.findMany({
      where: {
        id: { in: batchIds },
        status: 'CLOSED',
        monthlySettlementId: null,
      },
    });

    if (batches.length !== batchIds.length) {
      throw new BadRequestException('Uno o más lotes seleccionados no están cerrados o ya fueron liquidados en otro periodo.');
    }

    let totalGrossSales = 0;
    let totalDirectExpenses = 0;
    let totalNetSales = 0;
    let totalInvestmentCost = 0;
    let commercialProfit = 0;

    for (const b of batches) {
      totalGrossSales += Number(b.grossSaleAmount || 0);
      totalDirectExpenses += Number(b.totalExpenses || 0);
      totalNetSales += Number(b.netSaleAmount || 0);
      totalInvestmentCost += Number(b.totalInvestment || 0);
      commercialProfit += Number(b.netProfit || 0);
    }

    // Calcular gastos generales ingresados por el usuario
    const expensesList = dto.expenses || [];
    let generalExpensesTotal = 0;
    for (const exp of expensesList) {
      generalExpensesTotal += Math.max(0, Number(exp.amount) || 0);
    }

    // Utilidad Neta Real = Utilidad Comercial de Lotes - Gastos Generales
    const netProfit = Number((commercialProfit - generalExpensesTotal).toFixed(2));

    const p1Name = dto.partner1Name?.trim() || 'Daniel Herrera';
    const p1Percent = dto.partner1Percent !== undefined ? Number(dto.partner1Percent) : 50.0;
    const p1Amount = Number(((netProfit * p1Percent) / 100).toFixed(2));

    const p2Name = dto.partner2Name?.trim() || 'Andres Herrera';
    const p2Percent = dto.partner2Percent !== undefined ? Number(dto.partner2Percent) : 50.0;
    const p2Amount = Number(((netProfit * p2Percent) / 100).toFixed(2));

    // Validar si el usuario existe para evitar violación de FK si el token tiene un ID obsoleto
    let validCreatedById: string | null = null;
    if (userId) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (userExists) {
        validCreatedById = userExists.id;
      }
    }

    // Generar código consecutivo: LIQ-YYYY-MM-XXX
    const year = storeEnd.getFullYear();
    const month = String(storeEnd.getMonth() + 1).padStart(2, '0');
    const prefix = `LIQ-${year}-${month}-`;

    const count = await this.prisma.monthlySettlement.count({
      where: {
        code: { startsWith: prefix },
      },
    });
    const code = `${prefix}${String(count + 1).padStart(3, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.monthlySettlement.create({
        data: {
          code,
          startDate: storeStart,
          endDate: storeEnd,
          settlementDate: new Date(),
          totalGrossSales: new Prisma.Decimal(totalGrossSales.toFixed(2)),
          totalDirectExpenses: new Prisma.Decimal(totalDirectExpenses.toFixed(2)),
          totalNetSales: new Prisma.Decimal(totalNetSales.toFixed(2)),
          totalInvestmentCost: new Prisma.Decimal(totalInvestmentCost.toFixed(2)),
          commercialProfit: new Prisma.Decimal(commercialProfit.toFixed(2)),
          generalExpensesTotal: new Prisma.Decimal(generalExpensesTotal.toFixed(2)),
          netProfit: new Prisma.Decimal(netProfit.toFixed(2)),
          partner1Name: p1Name,
          partner1Percent: new Prisma.Decimal(p1Percent.toFixed(2)),
          partner1Amount: new Prisma.Decimal(p1Amount.toFixed(2)),
          partner2Name: p2Name,
          partner2Percent: new Prisma.Decimal(p2Percent.toFixed(2)),
          partner2Amount: new Prisma.Decimal(p2Amount.toFixed(2)),
          notes: dto.notes?.trim() || null,
          createdById: validCreatedById,
        },
      });

      // Crear los gastos generales
      if (expensesList.length > 0) {
        await tx.monthlySettlementExpense.createMany({
          data: expensesList.map((e) => ({
            monthlySettlementId: settlement.id,
            concept: e.concept.trim(),
            amount: new Prisma.Decimal(Number(e.amount).toFixed(2)),
          })),
        });
      }

      // Asociar los lotes liquidados
      if (batchIds.length > 0) {
        await tx.batch.updateMany({
          where: { id: { in: batchIds } },
          data: { monthlySettlementId: settlement.id },
        });
      }

      return tx.monthlySettlement.findUnique({
        where: { id: settlement.id },
        include: {
          expenses: true,
          batches: {
            select: {
              id: true,
              code: true,
              name: true,
              soldAt: true,
              totalGrossGrams: true,
              totalFineGrams: true,
              grossSaleAmount: true,
              totalExpenses: true,
              netSaleAmount: true,
              totalInvestment: true,
              netProfit: true,
            },
          },
        },
      });
    });
  }

  async findAll() {
    return this.prisma.monthlySettlement.findMany({
      orderBy: { settlementDate: 'desc' },
      include: {
        expenses: true,
        _count: {
          select: { batches: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const settlement = await this.prisma.monthlySettlement.findUnique({
      where: { id },
      include: {
        expenses: { orderBy: { createdAt: 'asc' } },
        batches: {
          orderBy: { soldAt: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            soldAt: true,
            totalGrossGrams: true,
            totalFineGrams: true,
            grossSaleAmount: true,
            totalExpenses: true,
            netSaleAmount: true,
            totalInvestment: true,
            netProfit: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException(`Liquidación con ID "${id}" no encontrada.`);
    }

    return settlement;
  }

  async remove(id: string) {
    const settlement = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      // Desvincular lotes para que puedan ser reliquidados
      await tx.batch.updateMany({
        where: { monthlySettlementId: id },
        data: { monthlySettlementId: null },
      });

      // Eliminar gastos y liquidación (cascada)
      await tx.monthlySettlement.delete({
        where: { id },
      });

      return { message: `Liquidación ${settlement.code} eliminada exitosamente. Lotes liberados.`, id };
    });
  }
}
