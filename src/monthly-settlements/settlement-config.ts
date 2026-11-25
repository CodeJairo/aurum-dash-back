import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type SettlementMode = 'NONE' | 'PARTNERS';

export interface SettlementPartner {
  name: string;
  percent: number;
}

export interface SettlementConfig {
  mode: SettlementMode;
  partners: SettlementPartner[];
  /**
   * De dónde salió la configuración:
   * - settings: configurada explícitamente en Ajustes
   * - legacy: empresa existente sin configurar, inferida de su última liquidación
   * - default: sin configuración ni historial (sin reparto)
   */
  source: 'settings' | 'legacy' | 'default';
}

export const MAX_SETTLEMENT_PARTNERS = 10;

type PrismaLike = Pick<Prisma.TransactionClient, 'systemSetting' | 'monthlySettlement'>;

/** Normaliza y valida la lista de socios (nombres no vacíos, % > 0 y suma 100). */
export function normalizeSettlementPartners(raw: unknown): SettlementPartner[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException('La lista de socios no es válida.');
  }
  const partners = raw.map((p: any) => ({
    name: String(p?.name ?? '').trim(),
    percent: Number(p?.percent),
  }));

  if (partners.length === 0) {
    throw new BadRequestException('Debes registrar al menos un socio para el reparto.');
  }
  if (partners.length > MAX_SETTLEMENT_PARTNERS) {
    throw new BadRequestException(`El reparto admite máximo ${MAX_SETTLEMENT_PARTNERS} socios.`);
  }
  for (const p of partners) {
    if (!p.name) {
      throw new BadRequestException('Todos los socios deben tener nombre.');
    }
    if (!isFinite(p.percent) || p.percent <= 0 || p.percent > 100) {
      throw new BadRequestException(`El porcentaje de "${p.name}" debe estar entre 0 y 100.`);
    }
  }
  const total = partners.reduce((acc, p) => acc + p.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new BadRequestException(
      `Los porcentajes de los socios deben sumar 100% (actualmente suman ${Number(total.toFixed(2))}%).`,
    );
  }
  return partners.map((p) => ({ name: p.name, percent: Number(p.percent.toFixed(2)) }));
}

/** Lee la lista guardada en SystemSetting sin lanzar errores (datos ya validados al guardar). */
function parseStoredPartners(raw: unknown): SettlementPartner[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({ name: String(p?.name ?? '').trim(), percent: Number(p?.percent) }))
    .filter((p) => p.name && isFinite(p.percent) && p.percent > 0);
}

/**
 * Resuelve cómo liquida una empresa:
 * 1. Si tiene `settlementMode` en Ajustes, se usa tal cual.
 * 2. Si no (empresas existentes), se infiere de su última liquidación con reparto (socios y %).
 * 3. Si no hay historial, liquidación sin reparto.
 */
export async function resolveSettlementConfig(
  prisma: PrismaLike,
  companyId: string,
): Promise<SettlementConfig> {
  const setting = await prisma.systemSetting.findUnique({
    where: { companyId },
    select: { settlementMode: true, settlementPartners: true },
  });

  if (setting?.settlementMode === 'NONE') {
    return { mode: 'NONE', partners: [], source: 'settings' };
  }
  if (setting?.settlementMode === 'PARTNERS') {
    const partners = parseStoredPartners(setting.settlementPartners);
    if (partners.length > 0) {
      return { mode: 'PARTNERS', partners, source: 'settings' };
    }
  }

  const last = await prisma.monthlySettlement.findFirst({
    where: { companyId },
    orderBy: { settlementDate: 'desc' },
    select: {
      distributionMode: true,
      partner1Name: true,
      partner1Percent: true,
      partner2Name: true,
      partner2Percent: true,
      shares: { orderBy: { sortOrder: 'asc' }, select: { name: true, percent: true } },
    },
  });

  if (last) {
    if (last.shares.length > 0) {
      return {
        mode: 'PARTNERS',
        partners: last.shares.map((s) => ({ name: s.name, percent: Number(s.percent) })),
        source: 'legacy',
      };
    }
    if (last.distributionMode !== 'NONE') {
      const legacy = [
        { name: (last.partner1Name || '').trim(), percent: Number(last.partner1Percent || 0) },
        { name: (last.partner2Name || '').trim(), percent: Number(last.partner2Percent || 0) },
      ].filter((p) => p.name && p.percent > 0);
      if (legacy.length > 0) {
        return { mode: 'PARTNERS', partners: legacy, source: 'legacy' };
      }
    }
  }

  return { mode: 'NONE', partners: [], source: 'default' };
}

/** Calcula el monto de cada socio. El último socio absorbe el redondeo para que la suma sea exacta. */
export function computeShares(netProfit: number, partners: SettlementPartner[]) {
  let assigned = 0;
  return partners.map((p, idx) => {
    const isLast = idx === partners.length - 1;
    const amount = isLast
      ? Number((netProfit - assigned).toFixed(2))
      : Number(((netProfit * p.percent) / 100).toFixed(2));
    assigned = Number((assigned + amount).toFixed(2));
    return { name: p.name, percent: p.percent, amount, sortOrder: idx };
  });
}
