import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService - Consecutivos Dinámicos', () => {
  let service: SettingsService;
  let prisma: {
    systemSetting: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    purchase: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      purchase: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('debe devolver 1 si no hay compras formales registradas', async () => {
    prisma.purchase.findMany.mockResolvedValue([]);

    const next = await service.calculateNextConsecutiveNum('DH-');
    expect(next).toBe(1);
  });

  it('debe calcular el siguiente consecutivo basado en el máximo existente (ej. DH-100 -> 101)', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      { consecutive: 'DH-1' },
      { consecutive: 'DH-50' },
      { consecutive: 'DH-100' },
      { consecutive: 'DH-20' },
    ]);

    const next = await service.calculateNextConsecutiveNum('DH-');
    expect(next).toBe(101);
  });

  it('si se borra DH-100 y el máximo pasa a ser DH-99, el siguiente consecutivo vuelve a ser 100', async () => {
    // Simula que DH-100 fue borrado y la base de datos ahora contiene hasta DH-99
    prisma.purchase.findMany.mockResolvedValue([
      { consecutive: 'DH-1' },
      { consecutive: 'DH-98' },
      { consecutive: 'DH-99' },
    ]);

    const next = await service.calculateNextConsecutiveNum('DH-');
    expect(next).toBe(100);
  });

  it('debe calcular correctamente el siguiente número para compras contables estándar', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      { consecutive: '1' },
      { consecutive: '2' },
      { consecutive: '5' },
    ]);

    const next = await service.calculateNextPurchaseNum();
    expect(next).toBe(6);
  });
});
