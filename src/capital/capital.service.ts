import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapitalActionDto, CreateCapitalMovementDto } from './dto/create-capital-movement.dto';
import { CapitalMovementType, Prisma } from '@prisma/client';

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
          currentCapital: new Prisma.Decimal(0.00),
        },
      });
    }

    return {
      currentCapital: Number(setting.currentCapital),
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
      const setting = await tx.systemSetting.findUnique({
        where: { id: this.defaultSettingsId },
      });

      const currentBalance = setting ? Number(setting.currentCapital) : 0;
      let delta = 0;
      let newBalance = currentBalance;
      let movementType: CapitalMovementType;

      if (dto.action === CapitalActionDto.INJECTION) {
        movementType = CapitalMovementType.CAPITAL_INJECTION;
        delta = Number(dto.amount);
        newBalance = currentBalance + delta;
      } else if (dto.action === CapitalActionDto.WITHDRAWAL) {
        movementType = CapitalMovementType.CAPITAL_WITHDRAWAL;
        delta = -Math.abs(Number(dto.amount));
        newBalance = currentBalance + delta;
      } else if (dto.action === CapitalActionDto.ADJUSTMENT) {
        movementType = CapitalMovementType.MANUAL_ADJUSTMENT;
        newBalance = Number(dto.amount);
        delta = newBalance - currentBalance;
      } else {
        throw new BadRequestException('Acción de capital no reconocida');
      }

      await tx.systemSetting.update({
        where: { id: this.defaultSettingsId },
        data: { currentCapital: new Prisma.Decimal(newBalance.toFixed(2)) },
      });

      const movement = await tx.capitalMovement.create({
        data: {
          type: movementType,
          amount: new Prisma.Decimal(delta.toFixed(2)),
          balanceBefore: new Prisma.Decimal(currentBalance.toFixed(2)),
          balanceAfter: new Prisma.Decimal(newBalance.toFixed(2)),
          description: dto.description.trim(),
          referenceId: dto.referenceId,
        },
      });

      return {
        movement,
        newBalance,
      };
    });
  }

  async recordSystemMovement(
    type: CapitalMovementType,
    amountDelta: number,
    description: string,
    referenceId?: string,
    txClient?: Prisma.TransactionClient,
  ) {
    const client = txClient || this.prisma;

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
          currentCapital: new Prisma.Decimal(0.00),
        },
      });
    }

    const currentBalance = Number(setting.currentCapital);
    const newBalance = currentBalance + amountDelta;

    await client.systemSetting.update({
      where: { id: this.defaultSettingsId },
      data: { currentCapital: new Prisma.Decimal(newBalance.toFixed(2)) },
    });

    return client.capitalMovement.create({
      data: {
        type,
        amount: new Prisma.Decimal(amountDelta.toFixed(2)),
        balanceBefore: new Prisma.Decimal(currentBalance.toFixed(2)),
        balanceAfter: new Prisma.Decimal(newBalance.toFixed(2)),
        description: description.trim(),
        referenceId,
      },
    });
  }
}
