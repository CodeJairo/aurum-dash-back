import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(companyId: string) {
    let settings = await this.prisma.systemSetting.findUnique({
      where: { companyId },
    });

    if (!settings) {
      settings = await this.prisma.systemSetting.create({
        data: {
          companyId,
          legalName: 'Compraventa de Oro',
          document: '',
          address: '',
          phone: '',
          city: 'Quibdó',
          country: 'Colombia',
          consecutivePrefix: 'DH-',
          lastConsecutiveNum: 0,
        },
      });
    }

    return settings;
  }

  async updateSettings(companyId: string, dto: UpdateSettingsDto) {
    const current = await this.getSettings(companyId);

    return this.prisma.systemSetting.update({
      where: { companyId },
      data: {
        legalName: dto.legalName !== undefined ? dto.legalName : current.legalName,
        document: dto.document !== undefined ? dto.document : current.document,
        address: dto.address !== undefined ? dto.address : current.address,
        phone: dto.phone !== undefined ? dto.phone : current.phone,
        city: dto.city !== undefined ? dto.city : current.city,
        country: dto.country !== undefined ? dto.country : current.country,
        consecutivePrefix: dto.consecutivePrefix !== undefined ? dto.consecutivePrefix : current.consecutivePrefix,
        lastConsecutiveNum: dto.lastConsecutiveNum !== undefined ? dto.lastConsecutiveNum : current.lastConsecutiveNum,
        siigoActive: dto.siigoActive !== undefined ? dto.siigoActive : current.siigoActive,
        siigoApiUrl: dto.siigoApiUrl !== undefined ? dto.siigoApiUrl : current.siigoApiUrl,
        siigoUsername: dto.siigoUsername !== undefined ? dto.siigoUsername : current.siigoUsername,
        siigoAccessKey: dto.siigoAccessKey !== undefined ? dto.siigoAccessKey : current.siigoAccessKey,
        siigoPartnerId: dto.siigoPartnerId !== undefined ? dto.siigoPartnerId : current.siigoPartnerId,
        siigoDebitAccount: dto.siigoDebitAccount !== undefined ? dto.siigoDebitAccount : current.siigoDebitAccount,
        siigoCreditAccount: dto.siigoCreditAccount !== undefined ? dto.siigoCreditAccount : current.siigoCreditAccount,
        siigoRpDocumentId: dto.siigoRpDocumentId !== undefined ? dto.siigoRpDocumentId : current.siigoRpDocumentId,
        siigoCashPaymentId: dto.siigoCashPaymentId !== undefined ? dto.siigoCashPaymentId : current.siigoCashPaymentId,
      },
    });
  }

  async calculateNextConsecutiveNum(companyId: string, prefix: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const setting = await client.systemSetting.findUnique({ where: { companyId } });
    let maxNum = setting?.lastConsecutiveNum ? Number(setting.lastConsecutiveNum) : 0;

    const purchases = await client.purchase.findMany({
      where: {
        companyId,
        type: 'FORMAL',
        consecutive: {
          not: null,
        },
      },
      select: { consecutive: true },
    });

    const cleanPrefix = (prefix || 'DH-').toUpperCase();
    for (const p of purchases) {
      if (p.consecutive) {
        const upper = p.consecutive.toUpperCase();
        if (upper.startsWith(cleanPrefix)) {
          const numPart = upper.slice(cleanPrefix.length).trim();
          const parsed = parseInt(numPart, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }

    return maxNum + 1;
  }

  async calculateNextPurchaseNum(companyId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const purchases = await client.purchase.findMany({
      where: {
        companyId,
        type: 'ACCOUNTING',
        consecutive: {
          not: null,
        },
      },
      select: { consecutive: true },
    });

    let maxNum = 0;
    for (const p of purchases) {
      if (p.consecutive) {
        const clean = p.consecutive.replace(/\D/g, '');
        const parsed = parseInt(clean, 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }

    return maxNum + 1;
  }

  async getNextConsecutivePreview(companyId: string) {
    const settings = await this.getSettings(companyId);
    const nextNum = await this.calculateNextConsecutiveNum(companyId, settings.consecutivePrefix);
    const nextPurchaseNum = await this.calculateNextPurchaseNum(companyId);
    return {
      prefix: settings.consecutivePrefix,
      nextNumber: nextNum,
      consecutive: `${settings.consecutivePrefix}${nextNum}`,
      nextPurchaseNum,
      legalName: settings.legalName,
      document: settings.document,
      address: settings.address,
      phone: settings.phone,
      city: settings.city,
      country: settings.country,
    };
  }

  async reserveNextConsecutive(companyId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx || this.prisma;
    const settings = await this.getSettings(companyId);
    const nextNumber = await this.calculateNextConsecutiveNum(companyId, settings.consecutivePrefix, client);

    await client.systemSetting.update({
      where: { companyId },
      data: {
        lastConsecutiveNum: nextNumber,
      },
    });

    return `${settings.consecutivePrefix}${nextNumber}`;
  }

  async reserveNextPurchaseNum(companyId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const nextNumber = await this.calculateNextPurchaseNum(companyId, client);

    await client.systemSetting.update({
      where: { companyId },
      data: {
        lastPurchaseNum: nextNumber,
      },
    });

    return nextNumber;
  }
}
