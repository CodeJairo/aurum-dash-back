import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapitalService } from '../capital/capital.service';
import { CreateMonthlySettlementDto } from './dto/create-monthly-settlement.dto';
import { CapitalMovementType, ExpenseStatus, PaymentAccount, Prisma } from '@prisma/client';

@Injectable()
export class MonthlySettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capitalService: CapitalService,
  ) {}

  private parseDateBoundaries(startDateStr: string, endDateStr: string) {
    const sClean = startDateStr.slice(0, 10);
    const eClean = endDateStr.slice(0, 10);

    // En Colombia (UTC-5), el periodo abarca desde las 00:00:00.000 del primer día
    // hasta las 23:59:59.999 del último día en hora local colombiana (-05:00)
    const queryStart = new Date(`${sClean}T00:00:00.000-05:00`);
    const queryEnd = new Date(`${eClean}T23:59:59.999-05:00`);

    // Para almacenar en BD como fecha representativa del periodo (al mediodía en Colombia para evitar desfases de calendario)
    const storeStart = new Date(`${sClean}T12:00:00.000-05:00`);
    const storeEnd = new Date(`${eClean}T12:00:00.000-05:00`);

    return { queryStart, queryEnd, storeStart, storeEnd };
  }

  async preview(companyId: string, startDateStr: string, endDateStr: string) {
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
        companyId,
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

    // Buscar gastos operativos registrados y pendientes en el rango de fechas
    const pendingExpenses = await this.prisma.expense.findMany({
      where: {
        companyId,
        status: ExpenseStatus.PENDING,
        expenseDate: {
          gte: queryStart,
          lte: queryEnd,
        },
      },
      orderBy: { expenseDate: 'asc' },
    });

    let pendingExpensesTotal = 0;
    for (const exp of pendingExpenses) {
      pendingExpensesTotal += Number(exp.amount || 0);
    }

    const projectedNetProfit = Number(
      Math.max(0, commercialProfit - pendingExpensesTotal).toFixed(2),
    );

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
        pendingExpensesTotal: Number(pendingExpensesTotal.toFixed(2)),
        projectedNetProfit,
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
      pendingExpenses: pendingExpenses.map((e) => ({
        id: e.id,
        description: e.description,
        category: e.category,
        amount: Number(e.amount),
        paymentAccount: e.paymentAccount,
        expenseDate: e.expenseDate,
        receiptUrl: e.receiptUrl,
      })),
    };
  }

  async create(companyId: string, dto: CreateMonthlySettlementDto, userId?: string) {
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
          companyId,
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
        companyId,
        status: 'CLOSED',
        monthlySettlementId: null,
      },
    });

    if (batches.length !== batchIds.length) {
      throw new BadRequestException('Uno o más lotes seleccionados no pertenecen a la empresa, no están cerrados o ya fueron liquidados en otro periodo.');
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

    // Identificar gastos del módulo de gastos a incluir
    let targetExpenseIds = dto.expenseIds;
    if (!targetExpenseIds) {
      const candidates = await this.prisma.expense.findMany({
        where: {
          companyId,
          status: ExpenseStatus.PENDING,
          expenseDate: {
            gte: queryStart,
            lte: queryEnd,
          },
        },
        select: { id: true },
      });
      targetExpenseIds = candidates.map((c) => c.id);
    }

    const registeredExpenses = await this.prisma.expense.findMany({
      where: {
        id: { in: targetExpenseIds },
        companyId,
        status: ExpenseStatus.PENDING,
      },
    });

    let registeredExpensesTotal = 0;
    for (const exp of registeredExpenses) {
      registeredExpensesTotal += Number(exp.amount || 0);
    }

    // Gastos manuales adicionales ingresados en el formulario de liquidación
    const manualExpensesList = dto.expenses || [];
    let manualExpensesTotal = 0;
    for (const exp of manualExpensesList) {
      manualExpensesTotal += Math.max(0, Number(exp.amount) || 0);
    }

    const generalExpensesTotal = Number((registeredExpensesTotal + manualExpensesTotal).toFixed(2));

    // Utilidad Neta Real = Utilidad Comercial de Lotes - Gastos Generales (registrados + manuales)
    const netProfit = Number(Math.max(0, commercialProfit - generalExpensesTotal).toFixed(2));

    const p1Name = dto.partner1Name?.trim() || 'Daniel Herrera';
    const p1Percent = dto.partner1Percent !== undefined ? Number(dto.partner1Percent) : 50.0;
    const p1Amount = Number(((netProfit * p1Percent) / 100).toFixed(2));

    const p2Name = dto.partner2Name?.trim() || 'Andres Herrera';
    const p2Percent = dto.partner2Percent !== undefined ? Number(dto.partner2Percent) : 50.0;
    const p2Amount = Number(((netProfit * p2Percent) / 100).toFixed(2));

    const payoutAccount = dto.payoutAccount || PaymentAccount.BANK;
    let payoutCashAmount = dto.payoutCashAmount ? Number(dto.payoutCashAmount) : null;
    let payoutBankAmount = dto.payoutBankAmount ? Number(dto.payoutBankAmount) : null;

    if (payoutAccount === PaymentAccount.MIXED) {
      const cashVal = payoutCashAmount || 0;
      const bankVal = payoutBankAmount || 0;
      if (cashVal + bankVal !== netProfit && cashVal > 0 && bankVal === 0) {
        payoutBankAmount = Math.max(0, Number((netProfit - cashVal).toFixed(2)));
      } else if (cashVal + bankVal !== netProfit && bankVal > 0 && cashVal === 0) {
        payoutCashAmount = Math.max(0, Number((netProfit - bankVal).toFixed(2)));
      }
    } else if (payoutAccount === PaymentAccount.BANK) {
      payoutBankAmount = netProfit;
      payoutCashAmount = 0;
    } else {
      payoutCashAmount = netProfit;
      payoutBankAmount = 0;
    }

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

    // Generar código consecutivo: LIQ-YYYY-MM-XXX por empresa
    const year = storeEnd.getFullYear();
    const month = String(storeEnd.getMonth() + 1).padStart(2, '0');
    const prefix = `LIQ-${year}-${month}-`;

    const count = await this.prisma.monthlySettlement.count({
      where: {
        companyId,
        code: { startsWith: prefix },
      },
    });
    const code = `${prefix}${String(count + 1).padStart(3, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.monthlySettlement.create({
        data: {
          companyId,
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
          payoutAccount,
          payoutCashAmount: payoutCashAmount !== null ? new Prisma.Decimal(payoutCashAmount.toFixed(2)) : null,
          payoutBankAmount: payoutBankAmount !== null ? new Prisma.Decimal(payoutBankAmount.toFixed(2)) : null,
          notes: dto.notes?.trim() || null,
          createdById: validCreatedById,
        },
      });

      // Crear los gastos manuales
      if (manualExpensesList.length > 0) {
        await tx.monthlySettlementExpense.createMany({
          data: manualExpensesList.map((e) => ({
            monthlySettlementId: settlement.id,
            concept: e.concept.trim(),
            amount: new Prisma.Decimal(Number(e.amount).toFixed(2)),
          })),
        });
      }

      // Marcar los gastos del módulo como liquidados y asociarlos a la liquidación
      if (registeredExpenses.length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: registeredExpenses.map((e) => e.id) }, companyId },
          data: {
            status: ExpenseStatus.LIQUIDATED,
            monthlySettlementId: settlement.id,
          },
        });
      }

      // Asociar los lotes liquidados
      if (batchIds.length > 0) {
        await tx.batch.updateMany({
          where: { id: { in: batchIds }, companyId },
          data: { monthlySettlementId: settlement.id },
        });
      }

      // Descontar la utilidad repartida a socios del capital de trabajo para retornar al capital base
      if (netProfit > 0) {
        if (payoutAccount === PaymentAccount.MIXED) {
          if (payoutCashAmount && payoutCashAmount > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.PARTNER_PROFIT_PAYOUT,
              -payoutCashAmount,
              `Distribución utilidades (Efectivo) liquidación ${code} (${p1Name}, ${p2Name})`,
              PaymentAccount.CASH,
              settlement.id,
              tx,
            );
          }
          if (payoutBankAmount && payoutBankAmount > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.PARTNER_PROFIT_PAYOUT,
              -payoutBankAmount,
              `Distribución utilidades (Banco) liquidación ${code} (${p1Name}, ${p2Name})`,
              PaymentAccount.BANK,
              settlement.id,
              tx,
            );
          }
        } else {
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.PARTNER_PROFIT_PAYOUT,
            -netProfit,
            `Distribución utilidades liquidación ${code} (${p1Name}, ${p2Name})`,
            payoutAccount,
            settlement.id,
            tx,
          );
        }
      }

      return tx.monthlySettlement.findUnique({
        where: { id: settlement.id },
        include: {
          expenses: true,
          registeredExpenses: true,
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

  async findAll(companyId: string) {
    return this.prisma.monthlySettlement.findMany({
      where: { companyId },
      orderBy: { settlementDate: 'desc' },
      include: {
        expenses: true,
        registeredExpenses: true,
        _count: {
          select: { batches: true, registeredExpenses: true },
        },
      },
    });
  }

  async findOne(companyId: string, id: string) {
    const settlement = await this.prisma.monthlySettlement.findFirst({
      where: { id, companyId },
      include: {
        expenses: { orderBy: { createdAt: 'asc' } },
        registeredExpenses: { orderBy: { expenseDate: 'asc' } },
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

  async remove(companyId: string, id: string) {
    const settlement = await this.findOne(companyId, id);
    const netProfit = Number(settlement.netProfit || 0);
    const payoutAccount = settlement.payoutAccount;

    return this.prisma.$transaction(async (tx) => {
      // 1. Si se repartieron utilidades, devolverlas al capital para que vuelvan a quedar en la bolsa retenida
      if (netProfit > 0) {
        if (payoutAccount === PaymentAccount.MIXED) {
          const cashVal = Number(settlement.payoutCashAmount || 0);
          const bankVal = Number(settlement.payoutBankAmount || 0);
          if (cashVal > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              cashVal,
              `Reintegro de utilidades por anulación de liquidación ${settlement.code} (Efectivo)`,
              PaymentAccount.CASH,
              settlement.id,
              tx,
            );
          }
          if (bankVal > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              bankVal,
              `Reintegro de utilidades por anulación de liquidación ${settlement.code} (Banco)`,
              PaymentAccount.BANK,
              settlement.id,
              tx,
            );
          }
        } else {
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.MANUAL_ADJUSTMENT,
            netProfit,
            `Reintegro de utilidades por anulación de liquidación ${settlement.code}`,
            payoutAccount,
            settlement.id,
            tx,
          );
        }
      }

      // 2. Liberar gastos registrados para que queden PENDING nuevamente
      await tx.expense.updateMany({
        where: { monthlySettlementId: id, companyId },
        data: {
          status: ExpenseStatus.PENDING,
          monthlySettlementId: null,
        },
      });

      // 3. Desvincular lotes para que puedan ser reliquidados
      await tx.batch.updateMany({
        where: { monthlySettlementId: id, companyId },
        data: { monthlySettlementId: null },
      });

      // 4. Eliminar gastos manuales y liquidación (cascada)
      await tx.monthlySettlement.delete({
        where: { id },
      });

      return { message: `Liquidación ${settlement.code} eliminada exitosamente. Lotes y gastos liberados.`, id };
    });
  }
}
