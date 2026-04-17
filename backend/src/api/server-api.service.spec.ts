import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServerApiService } from './server-api.service';
import { Acp, AcpFile } from '../database/entities';
import { FilesService } from '../files/files.service';
import { SnapshotsService } from '../snapshots/snapshots.service';

describe('ServerApiService', () => {
  let service: ServerApiService;
  let acpRepository: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let fileRepository: { find: jest.Mock; findOne: jest.Mock };
  let filesService: { deleteForAcp: jest.Mock; upload: jest.Mock; downloadForAcp: jest.Mock };
  let snapshotsService: { create: jest.Mock };

  beforeEach(async () => {
    acpRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({ ...value })),
    };

    fileRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    filesService = {
      deleteForAcp: jest.fn(),
      upload: jest.fn(),
      downloadForAcp: jest.fn(),
    };

    snapshotsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServerApiService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        { provide: FilesService, useValue: filesService },
        { provide: SnapshotsService, useValue: snapshotsService },
      ],
    }).compile();

    service = module.get<ServerApiService>(ServerApiService);
  });

  it('rejects import when package exists and conflictStrategy=reject', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });

    await expect(
      service.receiveAcp(
        {
          packageId: 'pkg-1',
          name: 'Demo',
          acpIndex: { version: '0.5.0' },
        },
        'reject',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('merges existing ACP index when conflictStrategy=merge', async () => {
    const existing = {
      id: 'acp-1',
      packageId: 'pkg-1',
      name: 'Old',
      description: 'Old Desc',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {
        header: { a: 1 },
        nested: { x: 1 },
      },
    } as any;

    acpRepository.findOne.mockResolvedValue(existing);
    acpRepository.save.mockImplementation(async (value) => ({
      ...value,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }));

    const result = await service.receiveAcp(
      {
        packageId: 'pkg-1',
        name: 'New Name',
        description: 'New Desc',
        acpIndex: {
          nested: { y: 2 },
          extra: true,
        },
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      'merge',
    );

    expect(result.operation).toBe('updated');
    expect(result.conflictStrategy).toBe('merge');
    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name',
        description: 'New Desc',
        acpIndex: {
          header: { a: 1 },
          nested: { x: 1, y: 2 },
          extra: true,
        },
      }),
    );
  });

  it('throws conflict on index update when expectedUpdatedAt mismatches', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });

    await expect(
      service.updateAcpIndex(
        'acp-1',
        { version: '0.5.0' },
        'overwrite',
        '2026-01-02T00:00:00.000Z',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects file upload when duplicate filename exists and conflictStrategy=reject', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });

    fileRepository.find.mockResolvedValue([
      {
        id: 'file-1',
        acpId: 'acp-1',
        originalName: 'unit.xml',
      },
    ]);

    await expect(
      service.uploadFiles(
        'acp-1',
        [
          {
            originalname: 'unit.xml',
            buffer: Buffer.from('x'),
            size: 1,
            mimetype: 'text/xml',
          } as Express.Multer.File,
        ],
        'reject',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('replaces existing coding schemes and creates a snapshot with changelog', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });

    fileRepository.find.mockResolvedValue([
      {
        id: 'file-1',
        acpId: 'acp-1',
        originalName: 'UNIT-1.VOCS',
      },
    ]);

    filesService.upload.mockResolvedValue({
      id: 'file-2',
      acpId: 'acp-1',
      originalName: 'UNIT-1.VOCS',
      fileType: 'application/json',
      fileSize: 10,
      checksum: 'abc',
      uploadedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    snapshotsService.create.mockResolvedValue({
      id: 'snap-7',
      versionNumber: 7,
      changelog: 'Kodierschema aktualisiert',
      createdAt: new Date('2026-01-02T01:00:00.000Z'),
    });

    const result = await service.replaceCodingSchemeFiles(
      'acp-1',
      [{
        originalname: 'unit-1.vocs',
        buffer: Buffer.from('{}'),
        size: 2,
        mimetype: 'application/json',
      } as Express.Multer.File],
      {
        changelog: 'Kodierschema aktualisiert',
        sourceClientId: 'coding-box',
      },
    );

    expect(filesService.deleteForAcp).toHaveBeenCalledWith('acp-1', 'file-1');
    expect(filesService.upload).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({ originalname: 'UNIT-1.VOCS' }),
    );
    expect(snapshotsService.create).toHaveBeenCalledWith('acp-1', 'Kodierschema aktualisiert');
    expect(result.snapshot.versionNumber).toBe(7);
    expect(result.replacedFiles).toHaveLength(1);
  });

  it('fails replacement if coding scheme does not exist in ACP', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([]);

    await expect(
      service.replaceCodingSchemeFiles(
        'acp-1',
        [{
          originalname: 'unit-1.vocs',
          buffer: Buffer.from('{}'),
          size: 2,
          mimetype: 'application/json',
        } as Express.Multer.File],
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('fails replacement when a non-vocs file is provided', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      packageId: 'pkg-1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([]);

    await expect(
      service.replaceCodingSchemeFiles(
        'acp-1',
        [{
          originalname: 'unit-1.xml',
          buffer: Buffer.from('<xml/>'),
          size: 6,
          mimetype: 'text/xml',
        } as Express.Multer.File],
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
