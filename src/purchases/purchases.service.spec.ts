import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FormalizersService } from '../formalizers/formalizers.service';
import { CapitalService } from '../capital/capital.service';
import { StorageService } from '../storage/storage.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseTypeDto } from './dto/create-purchase.dto';
import { Role } from '@prisma/client';

describe('PurchasesService - Consecutivos y Unicidad', () => {
  let service: PurchasesService;
  let prisma: {
    $transaction: jest.Mock;
    purchase: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    systemSetting: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let settingsService: Partial<SettingsService>;
  let capitalService: Partial<CapitalService>;
  let formalizersService: Partial<FormalizersService>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      purchase: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      systemSetting: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    settingsService = {
      reserveNextConsecutive: jest.fn().mockResolvedValue('DH-100'),
      reserveNextPurchaseNum: jest.fn().mockResolvedValue(10),
      getSettings: jest.fn().mockResolvedValue({ id: 'company_profile', consecutivePrefix: 'DH-' } as any),
      calculateNextConsecutiveNum: jest.fn().mockResolvedValue(100),
      calculateNextPurchaseNum: jest.fn().mockResolvedValue(10),
    };

    capitalService = {
      recordSystemMovement: jest.fn().mockResolvedValue({} as any),
    };

    formalizersService = {
      upsertFromBarequero: jest.fn().mockResolvedValue({} as any),
    };

    const storageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getFileStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settingsService },
        { provide: CapitalService, useValue: capitalService },
        { provide: FormalizersService, useValue: formalizersService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  it('debe rechazar la creación si el usuario ingresa un consecutivo manual duplicado', async () => {
    prisma.purchase.findFirst.mockResolvedValue({ id: 'existing-id', consecutive: 'DH-100' });

    await expect(
      service.create(
        {
          type: PurchaseTypeDto.FORMAL,
          consecutive: 'DH-100',
          supplier: 'Pedro',
          vendorDoc: '12345',
          vendorAddress: 'Calle 1',
          grossGrams: 10,
          pricePerGram: 250000,
          purity: 0.75,
        },
        { id: 'u-1', companyId: 'comp-1', role: Role.ADMIN },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('debe rechazar la eliminación si la compra contable está asignada a un lote', async () => {
    prisma.purchase.findFirst.mockResolvedValue({
      id: 'p-batch',
      companyId: 'comp-1',
      type: 'ACCOUNTING',
      batchId: 'batch-1',
    });

    await expect(service.remove('comp-1', 'p-batch')).rejects.toThrow(BadRequestException);
  });

  it('debe rechazar la eliminación si la compra a barequero ya fue formalizada', async () => {
    prisma.purchase.findFirst.mockResolvedValue({
      id: 'p-formalized',
      companyId: 'comp-1',
      type: 'FORMAL',
      formalizedBatchId: 'batch-formalized-1',
    });

    await expect(service.remove('comp-1', 'p-formalized')).rejects.toThrow(BadRequestException);
  });

  it('al eliminar una compra, debe reintegrar el capital a cartera y borrar el registro', async () => {
    const mockPurchase = {
      id: 'p-1',
      companyId: 'comp-1',
      consecutive: 'DH-100',
      totalCost: 2500000,
      batchId: null,
      batch: null,
      supplier: 'Juan',
      type: 'ACCOUNTING',
      paymentMethod: 'CASH',
    };
    prisma.purchase.findFirst.mockResolvedValue(mockPurchase);
    prisma.purchase.delete.mockResolvedValue(mockPurchase);

    const result = await service.remove('comp-1', 'p-1');

    expect(prisma.purchase.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(capitalService.recordSystemMovement).toHaveBeenCalledWith(
      'comp-1',
      expect.anything(),
      2500000,
      expect.stringContaining('DH-100'),
      'CASH',
      'p-1',
      expect.anything(),
    );
    expect(result.id).toBe('p-1');
  });
});
