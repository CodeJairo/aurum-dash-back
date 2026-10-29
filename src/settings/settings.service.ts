import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
  private readonly defaultId = 'company_profile';

  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.systemSetting.findUnique({
      where: { id: this.defaultId },
    });

    if (!settings) {
      settings = await this.prisma.systemSetting.create({
        data: {
          id: this.defaultId,
          legalName: 'DANIEL CAMILO HERRERA RENTERIA',
          document: '1.078.000.069',
          address: 'CR 8 CL 30 8 07',
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

  async updateSettings(dto: UpdateSettingsDto) {
    const current = await this.getSettings();

    return this.prisma.systemSetting.update({
      where: { id: current.id },
      data: {
        legalName: dto.legalName !== undefined ? dto.legalName : current.legalName,
        document: dto.document !== undefined ? dto.document : current.document,
        address: dto.address !== undefined ? dto.address : current.address,
        phone: dto.phone !== undefined ? dto.phone : current.phone,
        city: dto.city !== undefined ? dto.city : current.city,
        country: dto.country !== undefined ? dto.country : current.country,
        consecutivePrefix: dto.consecutivePrefix !== undefined ? dto.consecutivePrefix : current.consecutivePrefix,
      },
    });
  }

  async calculateNextConsecutiveNum(prefix: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const purchases = await client.purchase.findMany({
      where: {
        type: 'FORMAL',
        consecutive: {
          not: null,
        },
      },
      select: { consecutive: true },
    });

    let maxNum = 0;
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

  async calculateNextPurchaseNum(tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const purchases = await client.purchase.findMany({
      where: {
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

  async getNextConsecutivePreview() {
    const settings = await this.getSettings();
    const nextNum = await this.calculateNextConsecutiveNum(settings.consecutivePrefix);
    const nextPurchaseNum = await this.calculateNextPurchaseNum();
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

  async reserveNextConsecutive(tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx || this.prisma;
    const settings = await this.getSettings();
    const nextNumber = await this.calculateNextConsecutiveNum(settings.consecutivePrefix, client);

    await client.systemSetting.update({
      where: { id: settings.id },
      data: {
        lastConsecutiveNum: nextNumber,
      },
    });

    return `${settings.consecutivePrefix}${nextNumber}`;
  }

  async reserveNextPurchaseNum(tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx || this.prisma;
    const settings = await this.getSettings();
    const nextNumber = await this.calculateNextPurchaseNum(client);

    await client.systemSetting.update({
      where: { id: settings.id },
      data: {
        lastPurchaseNum: nextNumber,
      },
    });

    return nextNumber;
  }
}
