import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillingCycle,
  CreateSubscriptionPaymentDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';

/** Meses que cubre cada ciclo de cobro (ONE_TIME = pago único, sin próximo cobro). */
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
  ONE_TIME: 0,
};

/** Fecha 'YYYY-MM-DD' al mediodía de Colombia para evitar desfases de calendario. */
function toColombiaNoon(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00.000-05:00`);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // Si el mes destino tiene menos días (ej. 31 → 30), quedar en el último día del mes
  if (result.getUTCDate() < day) {
    result.setUTCDate(0);
  }
  return result;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, billingCycle: true, nextBillingDate: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }
    return company;
  }

  async updateSubscription(companyId: string, dto: UpdateSubscriptionDto) {
    await this.ensureCompany(companyId);

    const data: Prisma.CompanyUpdateInput = {};
    if (dto.subscriptionPrice !== undefined) {
      data.subscriptionPrice =
        dto.subscriptionPrice === null ? null : new Prisma.Decimal(Number(dto.subscriptionPrice).toFixed(2));
    }
    if (dto.billingCycle !== undefined) data.billingCycle = dto.billingCycle || null;
    if (dto.subscriptionStartDate !== undefined) {
      data.subscriptionStartDate = dto.subscriptionStartDate ? toColombiaNoon(dto.subscriptionStartDate) : null;
    }
    if (dto.nextBillingDate !== undefined) {
      data.nextBillingDate = dto.nextBillingDate ? toColombiaNoon(dto.nextBillingDate) : null;
    }
    if (dto.subscriptionNotes !== undefined) data.subscriptionNotes = dto.subscriptionNotes?.trim() || null;

    return this.prisma.company.update({
      where: { id: companyId },
      data,
      select: {
        id: true,
        subscriptionPrice: true,
        billingCycle: true,
        subscriptionStartDate: true,
        nextBillingDate: true,
        subscriptionNotes: true,
      },
    });
  }

  async listPayments(companyId: string) {
    await this.ensureCompany(companyId);
    return this.prisma.subscriptionPayment.findMany({
      where: { companyId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addPayment(companyId: string, dto: CreateSubscriptionPaymentDto) {
    const company = await this.ensureCompany(companyId);
    const paidAt = toColombiaNoon(dto.paidAt);
    const periodStart = dto.periodStart ? toColombiaNoon(dto.periodStart) : null;
    const periodEnd = dto.periodEnd ? toColombiaNoon(dto.periodEnd) : null;
    if (periodStart && periodEnd && periodStart > periodEnd) {
      throw new BadRequestException('El inicio del periodo no puede ser posterior al fin.');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.subscriptionPayment.create({
        data: {
          companyId,
          amount: new Prisma.Decimal(Number(dto.amount).toFixed(2)),
          paidAt,
          periodStart,
          periodEnd,
          method: dto.method?.trim() || null,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      let nextBillingDate = company.nextBillingDate;
      if (dto.advanceNextBillingDate) {
        const cycle = company.billingCycle as BillingCycle | null;
        const months = cycle ? CYCLE_MONTHS[cycle] : 0;
        if (cycle === 'ONE_TIME') {
          nextBillingDate = null;
        } else if (months > 0) {
          nextBillingDate = addMonths(company.nextBillingDate || paidAt, months);
        }
        await tx.company.update({ where: { id: companyId }, data: { nextBillingDate } });
      }

      return { payment, nextBillingDate };
    });
  }

  async removePayment(companyId: string, paymentId: string) {
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, companyId },
    });
    if (!payment) {
      throw new NotFoundException('Pago no encontrado.');
    }
    await this.prisma.subscriptionPayment.delete({ where: { id: paymentId } });
    return { message: 'Pago eliminado.', id: paymentId };
  }

  /** Resumen de facturación de todas las empresas (para el panel del Super Administrador). */
  async billingSummary() {
    const now = new Date();
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        isActive: true,
        subscriptionPrice: true,
        billingCycle: true,
        nextBillingDate: true,
      },
    });

    let monthlyRecurringRevenue = 0;
    let withPlanCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const c of companies) {
      const price = c.subscriptionPrice !== null ? Number(c.subscriptionPrice) : 0;
      const cycle = c.billingCycle as BillingCycle | null;
      if (!cycle && !price) continue;
      withPlanCount++;
      if (!c.isActive) continue;
      const months = cycle ? CYCLE_MONTHS[cycle] : 0;
      if (months > 0) monthlyRecurringRevenue += price / months;
      if (c.nextBillingDate) {
        if (c.nextBillingDate < now) overdueCount++;
        else if (c.nextBillingDate <= in7Days) dueSoonCount++;
      }
    }

    // Recaudo del mes y del año en curso (hora Colombia)
    const bogotaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const y = bogotaNow.getUTCFullYear();
    const m = String(bogotaNow.getUTCMonth() + 1).padStart(2, '0');
    const monthStart = new Date(`${y}-${m}-01T00:00:00.000-05:00`);
    const yearStart = new Date(`${y}-01-01T00:00:00.000-05:00`);

    const [monthAgg, yearAgg] = await Promise.all([
      this.prisma.subscriptionPayment.aggregate({
        where: { paidAt: { gte: monthStart } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { paidAt: { gte: yearStart } },
        _sum: { amount: true },
      }),
    ]);

    return {
      monthlyRecurringRevenue: Number(monthlyRecurringRevenue.toFixed(2)),
      withPlanCount,
      overdueCount,
      dueSoonCount,
      collectedThisMonth: Number(monthAgg._sum.amount || 0),
      paymentsThisMonth: monthAgg._count.id || 0,
      collectedThisYear: Number(yearAgg._sum.amount || 0),
    };
  }
}
