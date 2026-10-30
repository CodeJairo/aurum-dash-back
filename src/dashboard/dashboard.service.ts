import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutiveSummary() {
    // 1. Lotes abiertos
    const openBatches = await this.prisma.batch.findMany({
      where: { status: 'OPEN' },
      include: {
        _count: { select: { purchases: true, sales: true, expenses: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let activeGrossGrams = 0;
    let activeFineGrams = 0;
    let activeInvestment = 0;
    let activeSales = 0;
    let activeExpenses = 0;

    for (const b of openBatches) {
      activeGrossGrams += Number(b.totalGrossGrams);
      activeFineGrams += Number(b.totalFineGrams);
      activeInvestment += Number(b.totalInvestment);
      activeSales += Number(b.totalSales);
      activeExpenses += Number(b.totalExpenses);
    }

    // 2. Compras normales sin lote (disponibles en bóveda - excluye compras a barequeros)
    const unassignedPurchasesAgg = await this.prisma.purchase.aggregate({
      where: { batchId: null, type: 'ACCOUNTING' },
      _sum: {
        grossGrams: true,
        fineGrams: true,
        totalCost: true,
      },
      _count: { id: true },
    });

    const unassignedGross = Number(unassignedPurchasesAgg._sum.grossGrams || 0);
    const unassignedFine = Number(unassignedPurchasesAgg._sum.fineGrams || 0);
    const unassignedCost = Number(unassignedPurchasesAgg._sum.totalCost || 0);

    // 3. Totales Históricos
    const allPurchasesAgg = await this.prisma.purchase.aggregate({
      _sum: { totalCost: true, grossGrams: true, fineGrams: true },
      _count: { id: true },
    });
    const allSalesAgg = await this.prisma.sale.aggregate({
      _sum: { totalAmount: true },
      _count: { id: true },
    });
    const allExpensesAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { id: true },
    });
    const fourPerThousandAgg = await this.prisma.expense.aggregate({
      where: { category: 'FOUR_PER_THOUSAND' },
      _sum: { amount: true },
    });

    // 4. Saldo Operativo de Capital y Utilidades Pendientes de Liquidar
    const systemSetting = await this.prisma.systemSetting.findUnique({
      where: { id: 'company_profile' },
    });
    const workingCapital = systemSetting ? Number(systemSetting.currentCapital) : 0;

    const unsettledBatches = await this.prisma.batch.findMany({
      where: { status: 'CLOSED', monthlySettlementId: null },
      select: { id: true, netProfit: true, grossSaleAmount: true, netSaleAmount: true },
    });

    const unsettledProfits = unsettledBatches.reduce(
      (sum, b) => sum + Number(b.netProfit || 0),
      0,
    );

    const lastSettlement = await this.prisma.monthlySettlement.findFirst({
      orderBy: { settlementDate: 'desc' },
      select: { id: true, code: true, settlementDate: true, netProfit: true },
    });

    const totalHistoricalInvestment = Number(allPurchasesAgg._sum.totalCost || 0);
    const totalHistoricalSales = Number(allSalesAgg._sum.totalAmount || 0);
    const totalHistoricalExpenses = Number(allExpensesAgg._sum.amount || 0);
    const totalFourPerThousand = Number(fourPerThousandAgg._sum.amount || 0);

    const totalNetProfit = totalHistoricalSales - totalHistoricalInvestment - totalHistoricalExpenses;

    // Reparto acumulado entre los dos socios administradores
    const partner1Profit = (totalNetProfit * 50) / 100;
    const partner2Profit = (totalNetProfit * 50) / 100;

    // 5. Métricas operativas de lotes cerrados y mes actual
    const closedBatches = await this.prisma.batch.findMany({
      where: { status: 'CLOSED' },
      select: {
        totalFineGrams: true,
        totalInvestment: true,
        grossSaleAmount: true,
        netSaleAmount: true,
        netProfit: true,
      },
    });

    let closedTotalFineGrams = 0;
    let closedTotalSales = 0;
    let closedTotalNetProfit = 0;
    for (const cb of closedBatches) {
      closedTotalFineGrams += Number(cb.totalFineGrams || 0);
      closedTotalSales += Number(cb.netSaleAmount || cb.grossSaleAmount || 0);
      closedTotalNetProfit += Number(cb.netProfit || 0);
    }
    const avgProfitPerGram = closedTotalFineGrams > 0 ? closedTotalNetProfit / closedTotalFineGrams : 0;
    const avgMarginPercent = closedTotalSales > 0 ? (closedTotalNetProfit / closedTotalSales) * 100 : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyPurchasesAgg = await this.prisma.purchase.aggregate({
      where: { purchaseDate: { gte: startOfMonth } },
      _sum: { fineGrams: true, totalCost: true },
      _count: { id: true },
    });

    const monthlySalesAgg = await this.prisma.sale.aggregate({
      where: { saleDate: { gte: startOfMonth } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // 6. Actividad Reciente (últimas compras y ventas)
    const recentPurchases = await this.prisma.purchase.findMany({
      take: 4,
      orderBy: { purchaseDate: 'desc' },
      select: {
        id: true,
        supplier: true,
        fineGrams: true,
        totalCost: true,
        purchaseDate: true,
        batch: { select: { code: true } },
      },
    });

    const recentSales = await this.prisma.sale.findMany({
      take: 4,
      orderBy: { saleDate: 'desc' },
      select: {
        id: true,
        customer: true,
        totalAmount: true,
        saleDate: true,
        batch: { select: { code: true } },
      },
    });

    return {
      financialSummary: {
        workingCapital,
        unsettledProfits,
        unsettledBatchesCount: unsettledBatches.length,
        lastSettlementCode: lastSettlement?.code || null,
        lastSettlementDate: lastSettlement?.settlementDate || null,
        lastSettlementProfit: lastSettlement ? Number(lastSettlement.netProfit) : null,
      },
      activeInventory: {
        openBatchesCount: openBatches.length,
        totalActiveGrossGrams: activeGrossGrams + unassignedGross,
        totalActiveFineGrams: activeFineGrams + unassignedFine,
        vaultGrossGrams: unassignedGross,
        vaultFineGrams: unassignedFine,
        vaultCapital: unassignedCost,
        activeCapitalInBatches: activeInvestment,
        unassignedCapital: unassignedCost,
        unassignedPurchasesCount: unassignedPurchasesAgg._count.id,
      },
      profitability: {
        totalSales: totalHistoricalSales,
        totalInvestment: totalHistoricalInvestment,
        totalExpenses: totalHistoricalExpenses,
        fourPerThousand: totalFourPerThousand,
        netProfit: totalNetProfit,
        profitMarginPercent: totalHistoricalSales > 0 ? (totalNetProfit / totalHistoricalSales) * 100 : 0,
      },
      operationalMetrics: {
        avgProfitPerGram: Math.round(avgProfitPerGram),
        avgMarginPercent: Number(avgMarginPercent.toFixed(1)),
        closedBatchesCount: closedBatches.length,
        monthlyPurchasedFineGrams: Number(monthlyPurchasesAgg._sum.fineGrams || 0),
        monthlyPurchasesCost: Number(monthlyPurchasesAgg._sum.totalCost || 0),
        monthlyPurchasesCount: monthlyPurchasesAgg._count.id,
        monthlySalesRevenue: Number(monthlySalesAgg._sum.totalAmount || 0),
        monthlySalesCount: monthlySalesAgg._count.id,
      },
      partnerDistribution: {
        partner1Name: 'Daniel Herrera',
        partner1Percent: 50,
        partner1Profit,
        partner2Name: 'Andres Herrera',
        partner2Percent: 50,
        partner2Profit,
        clientName: 'Daniel Herrera',
        clientPercent: 50,
        clientProfit: partner1Profit,
        partnerName: 'Andres Herrera',
        partnerPercent: 50,
        partnerProfit: partner2Profit,
      },
      openBatches: openBatches.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        grossGrams: Number(b.totalGrossGrams),
        fineGrams: Number(b.totalFineGrams),
        investment: Number(b.totalInvestment),
        sales: Number(b.totalSales),
        expenses: Number(b.totalExpenses),
        netProfit: Number(b.netProfit),
        averageCost: Number(b.averageCostPerFineGram),
        purchasesCount: b._count.purchases,
      })),
      recentActivity: {
        purchases: recentPurchases.map((p) => ({
          id: p.id,
          title: `Compra a ${p.supplier || 'Proveedor'}`,
          amount: Number(p.totalCost),
          grams: Number(p.fineGrams),
          date: p.purchaseDate,
          batchCode: p.batch?.code,
        })),
        sales: recentSales.map((s) => ({
          id: s.id,
          title: `Venta a ${s.customer || 'Cliente'}`,
          amount: Number(s.totalAmount),
          date: s.saleDate,
          batchCode: s.batch?.code,
        })),
      },
    };
  }
}
