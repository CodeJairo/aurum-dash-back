import { BadRequestException } from '@nestjs/common';
import {
  computeShares,
  normalizeSettlementPartners,
  resolveSettlementConfig,
} from './settlement-config';

function mockPrisma(setting: any, lastSettlement: any) {
  return {
    systemSetting: { findUnique: jest.fn().mockResolvedValue(setting) },
    monthlySettlement: { findFirst: jest.fn().mockResolvedValue(lastSettlement) },
  } as any;
}

describe('settlement-config', () => {
  describe('normalizeSettlementPartners', () => {
    it('acepta socios cuyos porcentajes suman 100', () => {
      expect(
        normalizeSettlementPartners([
          { name: ' Socio A ', percent: 60 },
          { name: 'Socio B', percent: '40' },
        ]),
      ).toEqual([
        { name: 'Socio A', percent: 60 },
        { name: 'Socio B', percent: 40 },
      ]);
    });

    it('rechaza porcentajes que no suman 100', () => {
      expect(() =>
        normalizeSettlementPartners([
          { name: 'A', percent: 50 },
          { name: 'B', percent: 40 },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rechaza nombres vacíos y listas vacías', () => {
      expect(() => normalizeSettlementPartners([{ name: '', percent: 100 }])).toThrow(BadRequestException);
      expect(() => normalizeSettlementPartners([])).toThrow(BadRequestException);
    });
  });

  describe('computeShares', () => {
    it('reparte y la suma es exacta (el último absorbe el redondeo)', () => {
      const shares = computeShares(100.01, [
        { name: 'A', percent: 33.33 },
        { name: 'B', percent: 33.33 },
        { name: 'C', percent: 33.34 },
      ]);
      const total = shares.reduce((acc, s) => acc + s.amount, 0);
      expect(Number(total.toFixed(2))).toBe(100.01);
    });
  });

  describe('resolveSettlementConfig', () => {
    it('usa la configuración explícita de Ajustes', async () => {
      const prisma = mockPrisma(
        { settlementMode: 'PARTNERS', settlementPartners: [{ name: 'X', percent: 100 }] },
        null,
      );
      await expect(resolveSettlementConfig(prisma, 'c1')).resolves.toEqual({
        mode: 'PARTNERS',
        partners: [{ name: 'X', percent: 100 }],
        source: 'settings',
      });
    });

    it('modo NONE explícito no reparte', async () => {
      const prisma = mockPrisma({ settlementMode: 'NONE', settlementPartners: null }, null);
      const config = await resolveSettlementConfig(prisma, 'c1');
      expect(config.mode).toBe('NONE');
      expect(config.partners).toEqual([]);
    });

    it('empresa existente sin configurar: hereda los socios de su última liquidación', async () => {
      const prisma = mockPrisma(
        { settlementMode: null, settlementPartners: null },
        {
          distributionMode: null,
          partner1Name: 'Socio Uno',
          partner1Percent: 50,
          partner2Name: 'Socio Dos',
          partner2Percent: 50,
          shares: [],
        },
      );
      await expect(resolveSettlementConfig(prisma, 'c1')).resolves.toEqual({
        mode: 'PARTNERS',
        partners: [
          { name: 'Socio Uno', percent: 50 },
          { name: 'Socio Dos', percent: 50 },
        ],
        source: 'legacy',
      });
    });

    it('sin configuración ni historial: sin reparto', async () => {
      const prisma = mockPrisma(null, null);
      const config = await resolveSettlementConfig(prisma, 'c1');
      expect(config).toEqual({ mode: 'NONE', partners: [], source: 'default' });
    });
  });
});
