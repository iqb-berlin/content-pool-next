import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AcpService } from './acp.service';
import { Acp, AcpUserRole, AcpAccessConfig, AcpCredential, AppSettings, AccessModel, User } from '../database/entities';

describe('AcpService', () => {
  let service: AcpService;
  let acpRepo: any;
  let roleRepo: any;
  let accessConfigRepo: any;
  let credentialRepo: any;
  let settingsRepo: any;
  let userRepo: any;

  const mockAcp = {
    id: 'acp-1',
    packageId: 'test-pkg',
    name: 'Test ACP',
    description: 'A test ACP',
    acpIndex: { packageId: 'test-pkg', version: '0.5.0', units: [] },
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    acpRepo = {
      find: jest.fn().mockResolvedValue([mockAcp]),
      findOne: jest.fn().mockResolvedValue(mockAcp),
      create: jest.fn().mockImplementation(dto => ({ ...dto, id: 'new-acp' })),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    roleRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(dto => dto),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    accessConfigRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(dto => dto),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
    };
    credentialRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn().mockImplementation(dto => dto),
      save: jest.fn().mockImplementation(entities => Promise.resolve(entities)),
    };
    settingsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', isAppAdmin: false }),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpService,
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        { provide: getRepositoryToken(AcpUserRole), useValue: roleRepo },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepo },
        { provide: getRepositoryToken(AcpCredential), useValue: credentialRepo },
        { provide: getRepositoryToken(AppSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<AcpService>(AcpService);
  });

  describe('findAll', () => {
    it('should return all ACPs', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(acpRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });
  });

  describe('findById', () => {
    it('should return ACP by id', async () => {
      const result = await service.findById('acp-1');
      expect(result.name).toBe('Test ACP');
    });

    it('should throw NotFoundException', async () => {
      acpRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new ACP', async () => {
      acpRepo.findOne.mockResolvedValueOnce(null); // packageId check
      const result = await service.create({ packageId: 'new-pkg', name: 'New' });
      expect(acpRepo.create).toHaveBeenCalled();
      expect(acpRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate package ID', async () => {
      acpRepo.findOne.mockResolvedValue(mockAcp);
      await expect(service.create({ packageId: 'test-pkg', name: 'Dup' })).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should delete existing ACP', async () => {
      acpRepo.findOne.mockResolvedValue(mockAcp);
      await service.delete('acp-1');
      expect(acpRepo.remove).toHaveBeenCalledWith(mockAcp);
    });
  });

  describe('updateIndex', () => {
    it('should update ACP-Index', async () => {
      const newIndex = { packageId: 'test-pkg', version: '1.0.0', units: [{ id: 'u1' }] };
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });
      acpRepo.save.mockImplementation((entity: any) => Promise.resolve(entity));
      const result = await service.updateIndex('acp-1', newIndex);
      expect(result).toMatchObject(newIndex);
      expect((result as any).assessmentParts?.[0]?.units).toEqual([{ id: 'u1' }]);
    });

    it('should reject invalid status', async () => {
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });
      await expect(
        service.updateIndex('acp-1', { packageId: 'test-pkg', status: 'DRAFT' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('importIndex', () => {
    it('should fill missing required fields with defaults', async () => {
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });
      acpRepo.save.mockImplementation((entity: any) => Promise.resolve(entity));

      const result = await service.importIndex('acp-1', { assessmentParts: [] });

      expect((result as any).packageId).toBe('test-pkg');
      expect((result as any).version).toBe('0.5.0');
      expect((result as any).status).toBe('IN_DEVELOPMENT');
      expect((result as any).name).toEqual([{ lang: 'de', value: 'Test ACP' }]);
    });

    it('should reject unknown status values', async () => {
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });
      await expect(
        service.importIndex('acp-1', { packageId: 'test-pkg', status: 'INVALID_STATUS' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject packageId mismatch', async () => {
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });
      await expect(
        service.importIndex('acp-1', { packageId: 'other-pkg' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignRole', () => {
    it('should create new role assignment', async () => {
      acpRepo.findOne.mockResolvedValue(mockAcp);
      roleRepo.findOne.mockResolvedValue(null);
      await service.assignRole('acp-1', { userId: 'user-1', role: 'ACP_MANAGER' });
      expect(roleRepo.create).toHaveBeenCalled();
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('should update existing role', async () => {
      const existingRole = { userId: 'user-1', acpId: 'acp-1', role: 'READ_ONLY' };
      acpRepo.findOne.mockResolvedValue(mockAcp);
      roleRepo.findOne.mockResolvedValue(existingRole);
      await service.assignRole('acp-1', { userId: 'user-1', role: 'ACP_MANAGER' });
      expect(roleRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'ACP_MANAGER' }));
    });
  });

  describe('updateAccessConfig', () => {
    it('should create access config if none exists', async () => {
      acpRepo.findOne.mockResolvedValue(mockAcp);
      accessConfigRepo.findOne.mockResolvedValue(null);
      await service.updateAccessConfig('acp-1', { accessModel: 'PUBLIC' });
      expect(accessConfigRepo.create).toHaveBeenCalled();
      expect(accessConfigRepo.save).toHaveBeenCalled();
    });

    it('normalizes legacy metadata column key on update', async () => {
      acpRepo.findOne.mockResolvedValue(mockAcp);
      accessConfigRepo.findOne.mockResolvedValue({
        acpId: 'acp-1',
        accessModel: AccessModel.PUBLIC,
        featureConfig: {},
      });

      await service.updateAccessConfig('acp-1', {
        accessModel: 'PUBLIC',
        featureConfig: {
          itemListMetadataColumns: ['col-1', 'col-2'],
        },
      });

      expect(accessConfigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          featureConfig: expect.objectContaining({
            metadataColumns: {
              visible: ['col-1', 'col-2'],
              order: ['col-1', 'col-2'],
            },
          }),
        }),
      );
    });
  });
});
