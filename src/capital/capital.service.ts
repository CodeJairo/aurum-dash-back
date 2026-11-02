import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapitalActionDto,
  CreateCapitalMovementDto,
  TransferCapitalDto,
} from './dto/create-capital-movement.dto';
import { CapitalMovementType, PaymentAccount, Prisma } from '@prisma/client';

@Injectable()
export class CapitalService {
  private readonly defaultSettingsId = 'company_profile';

  constructor(private readonly prisma: PrismaService) {}

  async getBalance() {
    let setting = await this.prisma.systemSetting.findUnique({
      where: { id: this.defaultSettingsId },
    });

    if (!setting) {
      setting = await this.prisma.systemSetting.create({
        data: {
          id: this.defaultSettingsId,
          legalName: 'DANIEL CAMILO HERRERA RENTERIA',
          document: '1.078.000.069',
          address: 'CR 8 CL 30 8 07',
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
        where: { id: this.defaultSettingsId },
        data: { currentCapital: new Prisma.Decimal(totalCapital.toFixed(2)) },
      });
    }

    // Calcular Utilidad Retenida (Lotes cerrados cuya utilidad aún no ha sido liquidada)
    const closedBatches = await this.prisma.batch.findMany({
      where: {
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

  async getMovements(limit = 100) {
    return this.prisma.capitalMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createManualMovement(dto: CreateCapitalMovementDto) {
    return this.prisma.$transaction(async (tx) => {
      let setting = await tx.systemSetting.findUnique({
        where: { id: this.defaultSettingsId },
      });

      if (!setting) {
        setting = await tx.systemSetting.create({
          data: {
            id: this.defaultSettingsId,
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
        bankBal = Number((bankBal + delta).toFixed(2));
      } else {
        cashBal = Number((cashBal + delta).toFixed(2));
      }

      const totalAfter = Number((cashBal + bankBal).toFixed(2));

      await tx.systemSetting.update({
        where: { id: this.defaultSettingsId },
        data: {
          cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
          bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
          currentCapital: new Prisma.Decimal(totalAfter.toFixed(2)),
        },
      });

      const movement = await tx.capitalMovement.create({
        data: {
          type: movementType,
          amount: new Prisma.Decimal(delta.toFixed(2)),
          balanceBefore: new Prisma.Decimal(totalBefore.toFixed(2)),
          balanceAfter: new Prisma.Decimal(totalAfter.toFixed(2)),
          account: targetAccount,
          description: dto.description.trim(),
          referenceId: dto.referenceId,
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

  async transferInternal(dto: TransferCapitalDto) {
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
        where: { id: this.defaultSettingsId },
      });

      if (!setting) {
        setting = await tx.systemSetting.create({
          data: {
            id: this.defaultSettingsId,
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
        cashBal = Number((cashBal - transferAmount).toFixed(2));
        bankBal = Number((bankBal + transferAmount).toFixed(2));
      } else {
        bankBal = Number((bankBal - transferAmount).toFixed(2));
        cashBal = Number((cashBal + transferAmount).toFixed(2));
      }

      await tx.systemSetting.update({
        where: { id: this.defaultSettingsId },
        data: {
          cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
          bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
        },
      });

      const movement = await tx.capitalMovement.create({
        data: {
          type: CapitalMovementType.INTERNAL_TRANSFER,
          amount: new Prisma.Decimal(transferAmount.toFixed(2)),
          balanceBefore: new Prisma.Decimal(totalBalance.toFixed(2)),
          balanceAfter: new Prisma.Decimal(totalBalance.toFixed(2)),
          account: PaymentAccount.INTERNAL_TRANSFER,
          sourceAccount: dto.fromAccount,
          targetAccount: dto.toAccount,
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
    type: CapitalMovementType,
    amountDelta: number,
    description: string,
    accountOrRefId?: PaymentAccount | string,
    referenceIdOrTx?: string | Prisma.TransactionClient,
    txClient?: Prisma.TransactionClient,
  ) {
    // Normalizar argumentos para soportar firmas flexiblemente
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
      where: { id: this.defaultSettingsId },
    });

    if (!setting) {
      setting = await client.systemSetting.create({
        data: {
          id: this.defaultSettingsId,
          legalName: 'DANIEL CAMILO HERRERA RENTERIA',
          document: '1.078.000.069',
          address: 'CR 8 CL 30 8 07',
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
      bankBal = Number((bankBal + amountDelta).toFixed(2));
    } else {
      cashBal = Number((cashBal + amountDelta).toFixed(2));
    }

    const balanceAfter = Number((cashBal + bankBal).toFixed(2));

    await client.systemSetting.update({
      where: { id: this.defaultSettingsId },
      data: {
        cashCapital: new Prisma.Decimal(cashBal.toFixed(2)),
        bankCapital: new Prisma.Decimal(bankBal.toFixed(2)),
        currentCapital: new Prisma.Decimal(balanceAfter.toFixed(2)),
      },
    });

    return client.capitalMovement.create({
      data: {
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
}
