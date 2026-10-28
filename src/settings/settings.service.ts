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

  async getNextConsecutivePreview() {
    const settings = await this.getSettings();
    const nextNum = settings.lastConsecutiveNum + 1;
    const nextPurchaseNum = (settings.lastPurchaseNum || 0) + 1;
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
    let settings = await client.systemSetting.findUnique({
      where: { id: this.defaultId },
    });

    if (!settings) {
      settings = await client.systemSetting.create({
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
          lastPurchaseNum: 0,
        },
      });
    }

    const nextNumber = settings.lastConsecutiveNum + 1;
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
    let settings = await client.systemSetting.findUnique({
      where: { id: this.defaultId },
    });

    if (!settings) {
      settings = await client.systemSetting.create({
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
          lastPurchaseNum: 0,
        },
      });
    }

    const nextNumber = (settings.lastPurchaseNum || 0) + 1;
    await client.systemSetting.update({
      where: { id: settings.id },
      data: {
        lastPurchaseNum: nextNumber,
      },
    });

    return nextNumber;
  }
}
