import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService.addPayment', () => {
  function setup(company: any) {
    const tx = {
      subscriptionPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
      company: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      company: { findUnique: jest.fn().mockResolvedValue(company) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    return { service: new SubscriptionsService(prisma), tx };
  }

  it('avanza el próximo cobro un mes en plan mensual', async () => {
    const { service } = setup({
      id: 'c1',
      billingCycle: 'MONTHLY',
      nextBillingDate: new Date('2026-11-30T17:00:00.000Z'),
    });
    const res = await service.addPayment('c1', {
      amount: 500000,
      paidAt: '2026-11-28',
      advanceNextBillingDate: true,
    });
    // 30 nov + 1 mes = 30 dic
    expect(res.nextBillingDate?.toISOString().slice(0, 10)).toBe('2026-12-30');
  });

  it('31 de enero + 1 mes queda en el último día de febrero', async () => {
    const { service } = setup({
      id: 'c1',
      billingCycle: 'MONTHLY',
      nextBillingDate: new Date('2027-01-31T17:00:00.000Z'),
    });
    const res = await service.addPayment('c1', { amount: 1, paidAt: '2027-01-31', advanceNextBillingDate: true });
    expect(res.nextBillingDate?.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('no cambia el próximo cobro si no se pide avanzar', async () => {
    const next = new Date('2026-12-01T17:00:00.000Z');
    const { service, tx } = setup({ id: 'c1', billingCycle: 'YEARLY', nextBillingDate: next });
    const res = await service.addPayment('c1', { amount: 1, paidAt: '2026-11-28' });
    expect(res.nextBillingDate).toBe(next);
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it('plan anual sin próximo cobro definido parte de la fecha de pago', async () => {
    const { service } = setup({ id: 'c1', billingCycle: 'YEARLY', nextBillingDate: null });
    const res = await service.addPayment('c1', { amount: 1, paidAt: '2026-03-15', advanceNextBillingDate: true });
    expect(res.nextBillingDate?.toISOString().slice(0, 10)).toBe('2027-03-15');
  });
});
