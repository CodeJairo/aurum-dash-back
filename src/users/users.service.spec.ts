import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return list of users for company', async () => {
      const mockUsers = [
        { id: 'u1', name: 'User 1', role: Role.ADMIN },
        { id: 'u2', name: 'User 2', role: Role.BAREQUERO_OPERATOR },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll('comp1');
      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'comp1' } }),
      );
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if role is SUPER_ADMIN', async () => {
      await expect(
        service.create('comp1', {
          name: 'Super',
          username: 'super',
          password: 'password123',
          role: Role.SUPER_ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if username is taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u_exist', username: 'juan' });

      await expect(
        service.create('comp1', {
          name: 'Juan Perez',
          username: 'juan',
          password: 'password123',
          role: Role.BAREQUERO_OPERATOR,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user successfully with hashed password', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) => Promise.resolve({ id: 'u_new', ...data }));

      const res = await service.create('comp1', {
        name: 'Maria Gomez',
        username: 'maria',
        password: 'password123',
        role: Role.VIEWER,
      });

      expect(res.name).toBe('Maria Gomez');
      expect(res.username).toBe('maria');
      expect(res.role).toBe(Role.VIEWER);
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('toggleActive', () => {
    it('should throw BadRequestException when deactivating self', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true });

      await expect(
        service.toggleActive('comp1', 'u1', 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should toggle active status', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2', isActive: true });
      prisma.user.update.mockResolvedValue({ id: 'u2', isActive: false });

      const res = await service.toggleActive('comp1', 'u2', 'u1');
      expect(res.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u2' },
          data: { isActive: false },
        }),
      );
    });
  });
});
