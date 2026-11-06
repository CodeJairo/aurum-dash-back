import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CapitalActionDto,
  CreateCapitalMovementDto,
  TransferCapitalDto,
} from './dto/create-capital-movement.dto';
import { CapitalMovementType, PaymentAccount, Prisma } from '@prisma/client';

@Injectable()
export class CapitalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async getBalance(companyId: string) {
    let setting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
    });

    if (!setting) {
      setting = await this.prisma.systemSetting.create({
        data: {
          companyId,
          legalName: 'Compraventa de Oro',
          document: '',
          address: '',
          consecutivePrefix: 'DH-',
          currentCapital: new Prisma.Decimal(0.0),
          cashCapital: new Prisma.Decimal(0.0),
          bankCapital: new Prisma.Decimal(0.0),
        },
      });
    }

    const cashCapital = Number(setting.cashCapital || 0);
    const bankCapital = Number(setting.bankCapital || 0);
    const totalCapital = Number((cashCapital + bankCapital).toFixed(2));

    // Si currentCapital no coincide con la suma de caja y banco, sincronizar
    if (Number(setting.currentCapital) !== totalCapital) {
      await this.prisma.systemSetting.update({
        where: { companyId },
        data: { currentCapital: new Prisma.Decimal(totalCapital.toFixed(2)) },
      });
    }

    // Calcular Utilidad Retenida (Lotes cerrados de esta empresa cuya utilidad aún no ha sido liquidada)
    const closedBatches = await this.prisma.batch.findMany({
      where: {
        companyId,
        status: 'CLOSED',
        monthlySettlementId: null,
      },
      select: { netProfit: true },
    });

    let retainedProfits = 0;
    for (const b of closedBatches) {
      retainedProfits += Math.max(0, Number(b.netProfit || 0));
    }
    retainedProfits = Number(retainedProfits.toFixed(2));

    // Capital base de trabajo rotatorio (Total menos utilidades retenidas del periodo)
    const baseCapital = Number(Math.max(0, totalCapital - retainedProfits).toFixed(2));

    return {
      currentCapital: totalCapital,
      cashCapital,
      bankCapital,
      retainedProfits,
      baseCapital,
      updatedAt: setting.updatedAt,
    };
  }

  async getMovements(companyId: string, limit = 100) {
    return this.prisma.capitalMovement.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createManualMovement(companyId: string, dto: CreateCapitalMovementDto) {
    return this.prisma.$transaction(async (tx) => {
      let setting = await tx.systemSetting.findUnique({
        where: { companyId },
      });

      if (!setting) {
        setting = await tx.systemSetting.create({
          data: {
            companyId,
            currentCapital: new Prisma.Decimal(0),
            cashCapital: new Prisma.Decimal(0),
            bankCapital: new Prisma.Decimal(0),
          },
        });
      }

      const targetAccount = dto.account === PaymentAccount.BANK ? PaymentAccount.BANK : PaymentAccount.CASH;
      let cashBal = Number(setting.cashCapital || 0);
      let bankBal = Number(setting.bankCapital || 0);
      const totalBefore = Number((cashBal + bankBal).toFixed(2));

      let delta = 0;
      let movementType: CapitalMovementType;

      if (dto.action === CapitalActionDto.INJECTION) {
        movementType = CapitalMovementType.CAPITAL_INJECTION;
        delta = Number(dto.amount);
      } else if (dto.action === CapitalActionDto.WITHDRAWAL) {
        movementType = CapitalMovementType.CAPITAL_WITHDRAWAL;
        delta = -Math.abs(Number(dto.amount));
      } else if (dto.action === CapitalActionDto.ADJUSTMENT) {
        movementType = CapitalMovementType.MANUAL_ADJUSTMENT;
        const targetValue = Number(dto.amount);
        if (targetAccount === PaymentAccount.BANK) {
          delta = targetValue - bankBal;
        } else {
          delta = targetValue - cashBal;
        }
      } else {
        throw new BadRequestException('Acción de capital no reconocida');
      }

      if (targetAccount === PaymentAccount.BANK) {
        const nextBank = Number((bankBal + delta).toFixed(2));
        if (nextBank < 0) {
          throw new BadRequestException(
            `Fondos insuficientes en Banco. Saldo disponible: $${bankBal.toLocaleString('es-CO')}.`,
          );
        }
        bankBal = nextBank;
      } else {
        const nextCash = Number((cashBal + delta).toFixed(2));
        if (nextCash < 0) {
          throw new BadRequestException(
            `Fondos insuficientes en Efectivo / Caja. Saldo disponible: $${cashBal.toLocaleString('es-CO')}.`,
          );
        }
        cashBal = nextCash;
      }

      const totalAfter = Number((cashBal + bankBal).toFixed(2));

      await tx.systemSetting.update({
        where: { companyId },
        data: {
          cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
          bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
          currentCapital: new Prisma.Decimal(totalAfter.toFixed(2)),
        },
      });

      const movement = await tx.capitalMovement.create({
        data: {
          companyId,
          type: movementType,
          amount: new Prisma.Decimal(delta.toFixed(2)),
          balanceBefore: new Prisma.Decimal(totalBefore.toFixed(2)),
          balanceAfter: new Prisma.Decimal(totalAfter.toFixed(2)),
          account: targetAccount,
          description: dto.description.trim(),
          referenceId: dto.referenceId,
          receiptUrl: dto.receiptUrl?.trim() || null,
          receiptKey: dto.receiptKey?.trim() || null,
        },
      });

      return {
        movement,
        newBalance: totalAfter,
        cashCapital: cashBal,
        bankCapital: bankBal,
      };
    });
  }

  async transferInternal(companyId: string, dto: TransferCapitalDto) {
    if (dto.fromAccount === dto.toAccount) {
      throw new BadRequestException('La cuenta de origen y destino no pueden ser la misma.');
    }
    if (
      (dto.fromAccount !== PaymentAccount.CASH && dto.fromAccount !== PaymentAccount.BANK) ||
      (dto.toAccount !== PaymentAccount.CASH && dto.toAccount !== PaymentAccount.BANK)
    ) {
      throw new BadRequestException('Las transferencias solo pueden realizarse entre Efectivo y Banco.');
    }

    const transferAmount = Math.abs(Number(dto.amount));
    if (transferAmount <= 0) {
      throw new BadRequestException('El monto a transferir debe ser mayor a cero.');
    }

    return this.prisma.$transaction(async (tx) => {
      let setting = await tx.systemSetting.findUnique({
        where: { companyId },
      });

      if (!setting) {
        setting = await tx.systemSetting.create({
          data: {
            companyId,
            currentCapital: new Prisma.Decimal(0),
            cashCapital: new Prisma.Decimal(0),
            bankCapital: new Prisma.Decimal(0),
          },
        });
      }

      let cashBal = Number(setting.cashCapital || 0);
      let bankBal = Number(setting.bankCapital || 0);
      const totalBalance = Number((cashBal + bankBal).toFixed(2));

      if (dto.fromAccount === PaymentAccount.CASH) {
        if (cashBal < transferAmount) {
          throw new BadRequestException(
            `Fondos insuficientes en Efectivo / Caja ($${cashBal.toLocaleString('es-CO')} disponibles) para transferir $${transferAmount.toLocaleString('es-CO')}.`,
          );
        }
        cashBal = Number((cashBal - transferAmount).toFixed(2));
        bankBal = Number((bankBal + transferAmount).toFixed(2));
      } else {
        if (bankBal < transferAmount) {
          throw new BadRequestException(
            `Fondos insuficientes en Banco ($${bankBal.toLocaleString('es-CO')} disponibles) para transferir $${transferAmount.toLocaleString('es-CO')}.`,
          );
        }
        bankBal = Number((bankBal - transferAmount).toFixed(2));
        cashBal = Number((cashBal + transferAmount).toFixed(2));
      }

      await tx.systemSetting.update({
        where: { companyId },
        data: {
          cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
          bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
        },
      });

      const movement = await tx.capitalMovement.create({
        data: {
          companyId,
          type: CapitalMovementType.INTERNAL_TRANSFER,
          amount: new Prisma.Decimal(transferAmount.toFixed(2)),
          balanceBefore: new Prisma.Decimal(totalBalance.toFixed(2)),
          balanceAfter: new Prisma.Decimal(totalBalance.toFixed(2)),
          account: PaymentAccount.INTERNAL_TRANSFER,
          sourceAccount: dto.fromAccount,
          targetAccount: dto.toAccount,
          receiptUrl: dto.receiptUrl?.trim() || null,
          receiptKey: dto.receiptKey?.trim() || null,
          description:
            dto.description?.trim() ||
            `Transferencia de ${dto.fromAccount === PaymentAccount.CASH ? 'Efectivo' : 'Banco'} a ${dto.toAccount === PaymentAccount.CASH ? 'Efectivo' : 'Banco'}`,
        },
      });

      return {
        movement,
        currentCapital: totalBalance,
        cashCapital: cashBal,
        bankCapital: bankBal,
      };
    });
  }

  async recordSystemMovement(
    companyId: string,
    type: CapitalMovementType,
    amountDelta: number,
    description: string,
    accountOrRefId?: PaymentAccount | string,
    referenceIdOrTx?: string | Prisma.TransactionClient,
    txClient?: Prisma.TransactionClient,
  ) {
    let account: PaymentAccount = PaymentAccount.CASH;
    let referenceId: string | undefined = undefined;
    let client: Prisma.TransactionClient | PrismaService = this.prisma;

    if (
      accountOrRefId === PaymentAccount.CASH ||
      accountOrRefId === PaymentAccount.BANK ||
      accountOrRefId === PaymentAccount.MIXED ||
      accountOrRefId === PaymentAccount.INTERNAL_TRANSFER
    ) {
      account = accountOrRefId;
      if (typeof referenceIdOrTx === 'string') {
        referenceId = referenceIdOrTx;
        if (txClient) client = txClient;
      } else if (referenceIdOrTx) {
        client = referenceIdOrTx;
      }
    } else {
      if (typeof accountOrRefId === 'string') {
        referenceId = accountOrRefId;
      }
      if (referenceIdOrTx && typeof referenceIdOrTx !== 'string') {
        client = referenceIdOrTx;
      }
    }

    let setting = await client.systemSetting.findUnique({
      where: { companyId },
    });

    if (!setting) {
      setting = await client.systemSetting.create({
        data: {
          companyId,
          legalName: 'Compraventa de Oro',
          document: '',
          address: '',
          consecutivePrefix: 'DH-',
          currentCapital: new Prisma.Decimal(0.0),
          cashCapital: new Prisma.Decimal(0.0),
          bankCapital: new Prisma.Decimal(0.0),
        },
      });
    }

    let cashBal = Number(setting.cashCapital || 0);
    let bankBal = Number(setting.bankCapital || 0);
    const balanceBefore = Number((cashBal + bankBal).toFixed(2));

    if (account === PaymentAccount.BANK) {
      const nextBank = Number((bankBal + amountDelta).toFixed(2));
      if (nextBank < 0) {
        throw new BadRequestException(
          `Fondos insuficientes en Banco. Saldo disponible: $${bankBal.toLocaleString('es-CO')}. Se intentó descontar: $${Math.abs(amountDelta).toLocaleString('es-CO')}. Registre la operación como 'Pendiente de pago / Cartera' o transfiera fondos primero.`,
        );
      }
      bankBal = nextBank;
    } else {
      const nextCash = Number((cashBal + amountDelta).toFixed(2));
      if (nextCash < 0) {
        throw new BadRequestException(
          `Fondos insuficientes en Efectivo / Caja. Saldo disponible: $${cashBal.toLocaleString('es-CO')}. Se intentó descontar: $${Math.abs(amountDelta).toLocaleString('es-CO')}. Registre la operación como 'Pendiente de pago / Cartera' o transfiera fondos primero.`,
        );
      }
      cashBal = nextCash;
    }

    const balanceAfter = Number((cashBal + bankBal).toFixed(2));

    await client.systemSetting.update({
      where: { companyId },
      data: {
        cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
        bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
        currentCapital: new Prisma.Decimal(balanceAfter.toFixed(2)),
      },
    });

    return client.capitalMovement.create({
      data: {
        companyId,
        type,
        amount: new Prisma.Decimal(amountDelta.toFixed(2)),
        balanceBefore: new Prisma.Decimal(balanceBefore.toFixed(2)),
        balanceAfter: new Prisma.Decimal(balanceAfter.toFixed(2)),
        account,
        description: description.trim(),
        referenceId,
      },
    });
  }

  async uploadReceipt(companyId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún comprobante.');
    }
    const prefix = companyId ? `companies/${companyId}/capital` : 'capital';
    const uploaded = await this.storageService.uploadFile(file, prefix, '/api/capital/receipt/file');
    return {
      fileUrl: uploaded.fileUrl,
      fileKey: uploaded.fileKey,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async getReceiptStream(key: string) {
    return this.storageService.getFileStream(key);
  }
}
