import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServerApiService } from './server-api.service';
import { Acp, AcpFile } from '../database/entities';
import { FilesService } from '../files/files.service';

describe('ServerApiService', () => {
  let service: ServerApiService;
  let acpRepository: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let fileRepository: { find: jest.Mock; findOne: jest.Mock };
  let filesService: { deleteForAcp: jest.Mock; upload: jest.Mock; downloadForAcp: jest.Mock };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServerApiService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        { provide: FilesService, useValue: filesService },
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
});
