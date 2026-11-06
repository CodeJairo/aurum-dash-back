import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapitalService } from '../capital/capital.service';
import { RegisterDebtMovementDto } from './dto/register-debt-movement.dto';
import { ToggleDebtStatusDto } from './dto/toggle-debt-status.dto';
import { CapitalMovementType, DebtType, PaymentAccount, PaymentStatus, Prisma } from '@prisma/client';

@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capitalService: CapitalService,
  ) {}

  async getSummary(companyId: string) {
    const payables = await this.prisma.purchase.aggregate({
      where: {
        companyId,
        paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        pendingAmount: { gt: 0 },
      },
      _sum: { pendingAmount: true, totalCost: true, paidAmount: true },
      _count: { id: true },
    });

    const receivables = await this.prisma.batch.aggregate({
      where: {
        companyId,
        status: 'CLOSED',
        paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        pendingAmount: { gt: 0 },
      },
      _sum: { pendingAmount: true, netSaleAmount: true, collectedAmount: true },
      _count: { id: true },
    });

    return {
      totalPayable: Number(payables._sum.pendingAmount || 0),
      totalPayableOriginal: Number(payables._sum.totalCost || 0),
      totalPayablePaid: Number(payables._sum.paidAmount || 0),
      payableCount: payables._count.id || 0,

      totalReceivable: Number(receivables._sum.pendingAmount || 0),
      totalReceivableOriginal: Number(receivables._sum.netSaleAmount || 0),
      totalReceivableCollected: Number(receivables._sum.collectedAmount || 0),
      receivableCount: receivables._count.id || 0,
    };
  }

  async getPayables(companyId: string, status?: PaymentStatus) {
    const where: Prisma.PurchaseWhereInput = {
      companyId,
    };

    if (status) {
      where.paymentStatus = status;
    } else {
      where.paymentStatus = { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] };
    }

    return this.prisma.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        batch: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
        },
        debtMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getReceivables(companyId: string, status?: PaymentStatus) {
    const where: Prisma.BatchWhereInput = {
      companyId,
      status: 'CLOSED',
    };

    if (status) {
      where.paymentStatus = status;
    } else {
      where.paymentStatus = { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] };
    }

    return this.prisma.batch.findMany({
      where,
      orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        debtMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async registerPayablePayment(
    companyId: string,
    purchaseId: string,
    dto: RegisterDebtMovementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
      });

      if (!purchase || purchase.companyId !== companyId) {
        throw new NotFoundException('Compra no encontrada');
      }

      const pending = Number(purchase.pendingAmount || 0);
      if (pending <= 0) {
        throw new BadRequestException('Esta compra ya se encuentra 100% saldada');
      }

      const payAmount = Number(dto.amount);
      if (payAmount <= 0) {
        throw new BadRequestException('El monto a abonar debe ser mayor a 0');
      }

      if (payAmount > pending + 0.01) {
        throw new BadRequestException(
          `El monto a pagar ($${payAmount.toLocaleString('es-CO')}) no puede exceder el saldo pendiente ($${pending.toLocaleString('es-CO')})`,
        );
      }

      const effectivePay = Math.min(payAmount, pending);
      const newPaid = Number((Number(purchase.paidAmount || 0) + effectivePay).toFixed(2));
      const newPending = Number((pending - effectivePay).toFixed(2));
      const newStatus = newPending <= 0.001 ? PaymentStatus.PAID : PaymentStatus.PARTIAL;

      // Descontar del bolsillo seleccionado en Capital (valida saldo no negativo)
      const targetAccount = dto.account === PaymentAccount.BANK ? PaymentAccount.BANK : PaymentAccount.CASH;
      await this.capitalService.recordSystemMovement(
        companyId,
        CapitalMovementType.PURCHASE_PAYMENT,
        -effectivePay,
        `Abono/Pago compra Nº ${purchase.consecutive || purchase.id.slice(0, 8)} - ${purchase.supplier || 'Proveedor'}${dto.notes ? ' (' + dto.notes + ')' : ''}`,
        targetAccount,
        purchase.id,
        tx,
      );

      // Registrar movimiento de cartera
      const debtMovement = await tx.debtMovement.create({
        data: {
          companyId,
          type: DebtType.PAYABLE,
          purchaseId: purchase.id,
          amount: new Prisma.Decimal(effectivePay.toFixed(2)),
          account: targetAccount,
          notes: dto.notes?.trim() || null,
          reference: dto.reference?.trim() || null,
        },
      });

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: new Prisma.Decimal(newPaid.toFixed(2)),
          pendingAmount: new Prisma.Decimal(Math.max(0, newPending).toFixed(2)),
          paymentStatus: newStatus,
        },
        include: {
          debtMovements: { orderBy: { createdAt: 'desc' } },
        },
      });

      return {
        purchase: updatedPurchase,
        debtMovement,
      };
    });
  }

  async registerReceivableCollection(
    companyId: string,
    batchId: string,
    dto: RegisterDebtMovementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
      });

      if (!batch || batch.companyId !== companyId) {
        throw new NotFoundException('Lote no encontrado');
      }

      if (batch.status !== 'CLOSED') {
        throw new BadRequestException('Solo se pueden registrar cobros de lotes que ya hayan sido vendidos y cerrados');
      }

      const pending = Number(batch.pendingAmount || 0);
      if (pending <= 0) {
        throw new BadRequestException('Este lote ya se encuentra 100% cobrado');
      }

      const collectAmount = Number(dto.amount);
      if (collectAmount <= 0) {
        throw new BadRequestException('El monto a cobrar debe ser mayor a 0');
      }

      if (collectAmount > pending + 0.01) {
        throw new BadRequestException(
          `El monto a cobrar ($${collectAmount.toLocaleString('es-CO')}) no puede exceder el saldo pendiente ($${pending.toLocaleString('es-CO')})`,
        );
      }

      const effectiveCollect = Math.min(collectAmount, pending);
      const newCollected = Number((Number(batch.collectedAmount || 0) + effectiveCollect).toFixed(2));
      const newPending = Number((pending - effectiveCollect).toFixed(2));
      const newStatus = newPending <= 0.001 ? PaymentStatus.PAID : PaymentStatus.PARTIAL;

      // Ingresar el dinero al bolsillo seleccionado en Capital
      const targetAccount = dto.account === PaymentAccount.BANK ? PaymentAccount.BANK : PaymentAccount.CASH;
      await this.capitalService.recordSystemMovement(
        companyId,
        CapitalMovementType.BATCH_SALE_INCOME,
        effectiveCollect,
        `Cobro/Abono venta lote ${batch.code} (${targetAccount === PaymentAccount.BANK ? 'Banco' : 'Efectivo'})${dto.notes ? ' (' + dto.notes + ')' : ''}`,
        targetAccount,
        batch.id,
        tx,
      );

      // Registrar movimiento de cartera
      const debtMovement = await tx.debtMovement.create({
        data: {
          companyId,
          type: DebtType.RECEIVABLE,
          batchId: batch.id,
          amount: new Prisma.Decimal(effectiveCollect.toFixed(2)),
          account: targetAccount,
          notes: dto.notes?.trim() || null,
          reference: dto.reference?.trim() || null,
        },
      });

      const updatedBatch = await tx.batch.update({
        where: { id: batch.id },
        data: {
          collectedAmount: new Prisma.Decimal(newCollected.toFixed(2)),
          pendingAmount: new Prisma.Decimal(Math.max(0, newPending).toFixed(2)),
          paymentStatus: newStatus,
        },
        include: {
          debtMovements: { orderBy: { createdAt: 'desc' } },
        },
      });

      return {
        batch: updatedBatch,
        debtMovement,
      };
    });
  }

  async togglePayableStatus(
    companyId: string,
    purchaseId: string,
    dto: ToggleDebtStatusDto,
  ) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase || purchase.companyId !== companyId) {
      throw new NotFoundException('Compra no encontrada');
    }

    const totalCost = Number(purchase.totalCost);

    if (dto.paymentStatus === PaymentStatus.PENDING) {
      return this.prisma.purchase.update({
        where: { id: purchaseId },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          paidAmount: new Prisma.Decimal(0),
          pendingAmount: new Prisma.Decimal(totalCost.toFixed(2)),
        },
      });
    } else {
      return this.prisma.purchase.update({
        where: { id: purchaseId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paidAmount: new Prisma.Decimal(totalCost.toFixed(2)),
          pendingAmount: new Prisma.Decimal(0),
        },
      });
    }
  }

  async toggleReceivableStatus(
    companyId: string,
    batchId: string,
    dto: ToggleDebtStatusDto,
  ) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch || batch.companyId !== companyId) {
      throw new NotFoundException('Lote no encontrado');
    }

    const netSale = Number(batch.netSaleAmount || 0);

    if (dto.paymentStatus === PaymentStatus.PENDING) {
      return this.prisma.batch.update({
        where: { id: batchId },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          collectedAmount: new Prisma.Decimal(0),
          pendingAmount: new Prisma.Decimal(netSale.toFixed(2)),
        },
      });
    } else {
      return this.prisma.batch.update({
        where: { id: batchId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          collectedAmount: new Prisma.Decimal(netSale.toFixed(2)),
          pendingAmount: new Prisma.Decimal(0),
        },
      });
    }
  }

  /**
   * Enviar una compra contable pagada a Cartera (CxP) con reintegro estricto
   * del 100% del dinero a la cuenta original (Caja o Banco).
   */
  async sendPurchaseToDebt(
    companyId: string,
    purchaseId: string,
  ) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        batch: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    });

    if (!purchase || purchase.companyId !== companyId) {
      throw new NotFoundException('Compra no encontrada');
    }

    if (purchase.type !== 'ACCOUNTING') {
      throw new BadRequestException(
        'Solo las compras contables pueden transferirse a Cartera (Cuentas por Pagar)',
      );
    }

    if (purchase.paymentStatus === PaymentStatus.PENDING) {
      throw new BadRequestException(
        'La compra ya se encuentra pendiente de pago en Cartera',
      );
    }

    if (purchase.batch && purchase.batch.status === 'CLOSED') {
      throw new BadRequestException(
        `No se puede transferir a Cartera porque pertenece al lote ${purchase.batch.code}, el cual ya fue cerrado y liquidado.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const totalCost = Number(purchase.totalCost);
      const rawPaid = Number(purchase.paidAmount || 0);
      // Si la compra estaba pagada pero tiene paidAmount == 0 (por la migración de schema en producción),
      // el valor pagado original a reintegrar es totalCost:
      const paidToRefund = rawPaid > 0 ? rawPaid : totalCost;
      const consecutiveStr = purchase.consecutive ? ` Nº ${purchase.consecutive}` : '';

      // 1. Reintegrar el dinero a la cuenta original
      if (paidToRefund > 0) {
        if (purchase.paymentMethod === PaymentAccount.BANK) {
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.MANUAL_ADJUSTMENT,
            paidToRefund,
            `Ajuste Cartera: Reintegro por compra${consecutiveStr} enviada a CxP (Banco)`,
            PaymentAccount.BANK,
            purchase.id,
            tx,
          );
        } else if (purchase.paymentMethod === PaymentAccount.MIXED) {
          const cashPortion = Number(purchase.cashAmount || 0);
          const bankPortion = Number(purchase.bankAmount || 0);
          if (cashPortion > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              cashPortion,
              `Ajuste Cartera: Reintegro por compra${consecutiveStr} enviada a CxP (Caja)`,
              PaymentAccount.CASH,
              purchase.id,
              tx,
            );
          }
          if (bankPortion > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              bankPortion,
              `Ajuste Cartera: Reintegro por compra${consecutiveStr} enviada a CxP (Banco)`,
              PaymentAccount.BANK,
              purchase.id,
              tx,
            );
          }
        } else {
          // Default: CASH
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.MANUAL_ADJUSTMENT,
            paidToRefund,
            `Ajuste Cartera: Reintegro por compra${consecutiveStr} enviada a CxP (Efectivo)`,
            PaymentAccount.CASH,
            purchase.id,
            tx,
          );
        }
      }

      // 2. Registrar movimiento en la trazabilidad de cartera
      await tx.debtMovement.create({
        data: {
          companyId,
          type: DebtType.PAYABLE,
          purchaseId: purchase.id,
          amount: new Prisma.Decimal(paidToRefund.toFixed(2)),
          account: purchase.paymentMethod || PaymentAccount.CASH,
          notes: `Transferida a Cartera CxP por Administrador. Reintegro automático de $${paidToRefund.toLocaleString('es-CO')}.`,
        },
      });

      // 3. Actualizar la compra para que quede 100% pendiente en Cartera
      return tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          paidAmount: new Prisma.Decimal(0),
          pendingAmount: new Prisma.Decimal(totalCost.toFixed(2)),
        },
      });
    });
  }

  /**
   * Enviar una venta de lote cerrada a Cartera (CxC) retirando de forma estricta
   * la entrada de dinero que aún no ha ingresado efectivamente a la cuenta original.
   */
  async sendBatchToDebt(
    companyId: string,
    batchId: string,
  ) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch || batch.companyId !== companyId) {
      throw new NotFoundException('Lote no encontrado');
    }

    if (batch.status !== 'CLOSED') {
      throw new BadRequestException(
        'Solo lotes cerrados/vendidos pueden transferirse a Cartera (Cuentas por Cobrar)',
      );
    }

    if (batch.paymentStatus === PaymentStatus.PENDING) {
      throw new BadRequestException(
        'La venta del lote ya se encuentra pendiente de cobro en Cartera',
      );
    }

    const netSale = Number(batch.netSaleAmount || 0);
    if (netSale <= 0) {
      throw new BadRequestException(
        'El lote no tiene un monto de venta neta válido para transferir a Cartera',
      );
    }

    // Buscar el movimiento de capital asociado a la venta del lote para saber la cuenta exacta
    const saleCapitalMovement = await this.prisma.capitalMovement.findFirst({
      where: {
        companyId,
        referenceId: batch.id,
        type: CapitalMovementType.BATCH_SALE_INCOME,
      },
    });

    const targetAccount: PaymentAccount =
      saleCapitalMovement?.account || PaymentAccount.BANK;

    return this.prisma.$transaction(async (tx) => {
      // 1. Deducir la entrada no recibida de la cuenta original (con validación de saldo no negativo)
      await this.capitalService.recordSystemMovement(
        companyId,
        CapitalMovementType.MANUAL_ADJUSTMENT,
        -netSale,
        `Ajuste Cartera: Retiro de venta no cobrada lote ${batch.code} (${targetAccount === PaymentAccount.BANK ? 'Banco' : 'Efectivo'})`,
        targetAccount,
        batch.id,
        tx,
      );

      // 2. Registrar en la trazabilidad de cartera
      await tx.debtMovement.create({
        data: {
          companyId,
          type: DebtType.RECEIVABLE,
          batchId: batch.id,
          amount: new Prisma.Decimal(netSale.toFixed(2)),
          account: targetAccount,
          notes: `Venta transferida a Cartera CxC por Administrador. Saldo neto de $${netSale.toLocaleString('es-CO')} por cobrar.`,
        },
      });

      // 3. Actualizar el lote para que quede 100% pendiente por cobrar
      return tx.batch.update({
        where: { id: batch.id },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          collectedAmount: new Prisma.Decimal(0),
          pendingAmount: new Prisma.Decimal(netSale.toFixed(2)),
        },
      });
    });
  }
}
