import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutiveSummary(companyId: string) {
    // 1. Lotes abiertos
    const openBatches = await this.prisma.batch.findMany({
      where: { companyId, status: 'OPEN' },
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

    let goldActiveGrossGrams = 0;
    let goldActiveFineGrams = 0;
    let goldActiveInvestment = 0;

    let platinumActiveGrossGrams = 0;
    let platinumActiveFineGrams = 0;
    let platinumActiveInvestment = 0;

    for (const b of openBatches) {
      const gross = Number(b.totalGrossGrams);
      const fine = Number(b.totalFineGrams);
      const inv = Number(b.totalInvestment);

      if (b.material === 'PLATINUM') {
        platinumActiveGrossGrams += gross;
        platinumActiveFineGrams += fine;
        platinumActiveInvestment += inv;
      } else {
        goldActiveGrossGrams += gross;
        goldActiveFineGrams += fine;
        goldActiveInvestment += inv;
      }

      activeGrossGrams += gross;
      activeFineGrams += fine;
      activeInvestment += inv;
      activeSales += Number(b.totalSales);
      activeExpenses += Number(b.totalExpenses);
    }

    // 2. Compras normales sin lote (disponibles en bóveda por material)
    const goldUnassignedAgg = await this.prisma.purchase.aggregate({
      where: { companyId, batchId: null, type: 'ACCOUNTING', material: 'GOLD' },
      _sum: { grossGrams: true, fineGrams: true, totalCost: true },
      _count: { id: true },
    });

    const platinumUnassignedAgg = await this.prisma.purchase.aggregate({
      where: { companyId, batchId: null, type: 'ACCOUNTING', material: 'PLATINUM' },
      _sum: { grossGrams: true, fineGrams: true, totalCost: true },
      _count: { id: true },
    });

    const goldVaultGross = Number(goldUnassignedAgg._sum.grossGrams || 0);
    const goldVaultFine = Number(goldUnassignedAgg._sum.fineGrams || 0);
    const goldVaultCost = Number(goldUnassignedAgg._sum.totalCost || 0);

    const platinumVaultGross = Number(platinumUnassignedAgg._sum.grossGrams || 0);
    const platinumVaultFine = Number(platinumUnassignedAgg._sum.fineGrams || 0);
    const platinumVaultCost = Number(platinumUnassignedAgg._sum.totalCost || 0);

    const unassignedGross = goldVaultGross + platinumVaultGross;
    const unassignedFine = goldVaultFine + platinumVaultFine;
    const unassignedCost = goldVaultCost + platinumVaultCost;

    // 3. Totales Históricos (Solo compras contables normales)
    const allPurchasesAgg = await this.prisma.purchase.aggregate({
      where: { companyId, type: 'ACCOUNTING' },
      _sum: { totalCost: true, grossGrams: true, fineGrams: true },
      _count: { id: true },
    });
    const allSalesAgg = await this.prisma.sale.aggregate({
      where: { companyId },
      _sum: { totalAmount: true },
      _count: { id: true },
    });
    const allExpensesAgg = await this.prisma.expense.aggregate({
      where: { companyId },
      _sum: { amount: true },
      _count: { id: true },
    });
    const fourPerThousandAgg = await this.prisma.expense.aggregate({
      where: { companyId, category: 'FOUR_PER_THOUSAND' },
      _sum: { amount: true },
    });

    // 4. Saldo Operativo de Capital y Utilidades Pendientes de Liquidar
    const systemSetting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
    });
    const workingCapital = systemSetting ? Number(systemSetting.currentCapital) : 0;

    const payablesAgg = await this.prisma.purchase.aggregate({
      where: {
        companyId,
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
        pendingAmount: { gt: 0 },
      },
      _sum: { pendingAmount: true },
      _count: { id: true },
    });

    const receivablesAgg = await this.prisma.batch.aggregate({
      where: {
        companyId,
        status: 'CLOSED',
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
        pendingAmount: { gt: 0 },
      },
      _sum: { pendingAmount: true },
      _count: { id: true },
    });

    const unsettledBatches = await this.prisma.batch.findMany({
      where: { companyId, status: 'CLOSED', monthlySettlementId: null },
      select: { id: true, netProfit: true, grossSaleAmount: true, netSaleAmount: true },
    });

    const unsettledProfits = unsettledBatches.reduce(
      (sum, b) => sum + Number(b.netProfit || 0),
      0,
    );

    const lastSettlement = await this.prisma.monthlySettlement.findFirst({
      where: { companyId },
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
      where: { companyId, status: 'CLOSED' },
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
      where: { companyId, purchaseDate: { gte: startOfMonth }, type: 'ACCOUNTING' },
      _sum: { fineGrams: true, totalCost: true, paidAmount: true, pendingAmount: true },
      _count: { id: true },
    });

    const monthlyPurchasesTotal = Number(monthlyPurchasesAgg._sum.totalCost || 0);
    const monthlyPurchasesDebt = Number(monthlyPurchasesAgg._sum.pendingAmount || 0);
    const monthlyPurchasesPaid = monthlyPurchasesTotal - monthlyPurchasesDebt;

    const monthlySalesAgg = await this.prisma.sale.aggregate({
      where: { companyId, saleDate: { gte: startOfMonth } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // Calcular ventas del mes cobradas vs por cobrar según el estado del lote asociado
    const monthlySalesWithBatch = await this.prisma.sale.findMany({
      where: { companyId, saleDate: { gte: startOfMonth } },
      select: {
        totalAmount: true,
        batch: {
          select: {
            paymentStatus: true,
            pendingAmount: true,
            grossSaleAmount: true,
            netSaleAmount: true,
          },
        },
      },
    });

    let monthlySalesCollected = 0;
    let monthlySalesPending = 0;
    for (const sale of monthlySalesWithBatch) {
      const saleAmt = Number(sale.totalAmount || 0);
      if (!sale.batch || sale.batch.paymentStatus === 'PAID') {
        monthlySalesCollected += saleAmt;
      } else {
        const batchPending = Number(sale.batch.pendingAmount || 0);
        // Si el lote tiene deuda pendiente en Cartera
        if (batchPending > 0) {
          monthlySalesPending += saleAmt;
        } else {
          monthlySalesCollected += saleAmt;
        }
      }
    }

    // 6. Actividad Reciente (últimas compras normales y ventas)
    const recentPurchases = await this.prisma.purchase.findMany({
      where: { companyId, type: 'ACCOUNTING' },
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
      where: { companyId },
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
        totalPayable: Number(payablesAgg._sum.pendingAmount || 0),
        payableCount: payablesAgg._count.id || 0,
        totalReceivable: Number(receivablesAgg._sum.pendingAmount || 0),
        receivableCount: receivablesAgg._count.id || 0,
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
        unassignedPurchasesCount: Number(goldUnassignedAgg._count.id + platinumUnassignedAgg._count.id),
        gold: {
          vaultGrossGrams: goldVaultGross,
          vaultFineGrams: goldVaultFine,
          vaultCapital: goldVaultCost,
          inBatchGrossGrams: goldActiveGrossGrams,
          inBatchFineGrams: goldActiveFineGrams,
          inBatchCapital: goldActiveInvestment,
          totalGrossGrams: goldVaultGross + goldActiveGrossGrams,
          totalFineGrams: goldVaultFine + goldActiveFineGrams,
        },
        platinum: {
          vaultGrossGrams: platinumVaultGross,
          vaultFineGrams: platinumVaultFine,
          vaultCapital: platinumVaultCost,
          inBatchGrossGrams: platinumActiveGrossGrams,
          inBatchFineGrams: platinumActiveFineGrams,
          inBatchCapital: platinumActiveInvestment,
          totalGrossGrams: platinumVaultGross + platinumActiveGrossGrams,
          totalFineGrams: platinumVaultFine + platinumActiveFineGrams,
        },
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
        monthlyPurchasesCost: monthlyPurchasesTotal,
        monthlyPurchasesPaid,
        monthlyPurchasesDebt,
        monthlyPurchasesCount: monthlyPurchasesAgg._count.id,
        monthlySalesRevenue: Number(monthlySalesAgg._sum.totalAmount || 0),
        monthlySalesCollected,
        monthlySalesPending,
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
        material: b.material,
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
