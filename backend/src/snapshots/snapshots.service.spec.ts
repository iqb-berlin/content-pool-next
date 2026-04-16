import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SnapshotsService } from './snapshots.service';
import { AcpSnapshot, AcpSnapshotFile, Acp, AcpFile } from '../database/entities';
import * as fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  copyFile: jest.fn(),
  stat: jest.fn(),
}));

describe('SnapshotsService', () => {
  let service: SnapshotsService;
  let snapshotRepo: any;
  let snapshotFileRepo: any;
  let acpRepo: any;
  let fileRepo: any;
  let configService: any;

  const mockAcp = {
    id: 'acp-1',
    acpIndex: { packageId: 'test', version: '1.0', units: [{ id: 'u1' }] },
  };

  const mockSnapshot = {
    id: 'snap-1',
    acpId: 'acp-1',
    versionNumber: 1,
    acpIndexSnapshot: { packageId: 'test', version: '1.0', units: [{ id: 'u1' }] },
    changelog: 'Initial',
    createdAt: new Date(),
    snapshotFiles: [],
  };

  beforeEach(async () => {
    snapshotRepo = {
      find: jest.fn().mockResolvedValue([mockSnapshot]),
      findOne: jest.fn().mockResolvedValue(mockSnapshot),
      create: jest.fn().mockImplementation(dto => ({ ...dto, id: 'new-snap' })),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
    };
    snapshotFileRepo = {
      create: jest.fn().mockImplementation(dto => dto),
      save: jest.fn().mockImplementation(entities => Promise.resolve(entities)),
    };
    acpRepo = {
      findOne: jest.fn().mockResolvedValue(mockAcp),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
    };
    fileRepo = {
      find: jest.fn().mockResolvedValue([
        { filePath: '/f1.json', originalName: 'f1.json', checksum: 'abc', fileSize: 100 },
      ]),
      create: jest.fn().mockImplementation(dto => dto),
      save: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string, fallback: string) => {
        if (key === 'FILE_STORAGE_PATH') return '/tmp/uploads-test';
        return fallback;
      }),
    };

    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.copyFile as jest.Mock).mockResolvedValue(undefined);
    (fs.stat as jest.Mock).mockResolvedValue({ size: 456 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotsService,
        { provide: getRepositoryToken(AcpSnapshot), useValue: snapshotRepo },
        { provide: getRepositoryToken(AcpSnapshotFile), useValue: snapshotFileRepo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SnapshotsService>(SnapshotsService);
  });

  describe('findByAcp', () => {
    it('should return snapshots ordered by version descending', async () => {
      const result = await service.findByAcp('acp-1');
      expect(result).toHaveLength(1);
      expect(snapshotRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        order: { versionNumber: 'DESC' },
      }));
    });
  });

  describe('create', () => {
    it('should create a new snapshot with incremented version', async () => {
      snapshotRepo.findOne
        .mockResolvedValueOnce({ versionNumber: 2 }) // latest snapshot
        .mockResolvedValueOnce({ ...mockSnapshot, id: 'new-snap', snapshotFiles: [] }); // findById after save

      const result = await service.create('acp-1', 'Test changelog');
      expect(snapshotRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        versionNumber: 3,
        changelog: 'Test changelog',
      }));
    });

    it('should start at version 1 if no snapshots exist', async () => {
      snapshotRepo.findOne
        .mockResolvedValueOnce(null) // no latest snapshot
        .mockResolvedValueOnce({ ...mockSnapshot, snapshotFiles: [] }); // findById after save

      await service.create('acp-1');
      expect(snapshotRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        versionNumber: 1,
      }));
    });

    it('should copy file references to snapshot', async () => {
      snapshotRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockSnapshot, snapshotFiles: [] });

      await service.create('acp-1');
      expect(snapshotFileRepo.create).toHaveBeenCalled();
      expect(snapshotFileRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown ACP', async () => {
      acpRepo.findOne.mockResolvedValue(null);
      await expect(service.create('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore ACP-Index and file references from snapshot', async () => {
      const snapshotWithFiles = {
        ...mockSnapshot,
        snapshotFiles: [
          {
            id: 'sf-1',
            snapshotId: 'snap-1',
            filePath: '/tmp/source/f1.json',
            originalName: 'f1.json',
            checksum: 'abc',
            fileSize: 100,
          },
        ],
      };
      snapshotRepo.findOne.mockResolvedValue(snapshotWithFiles);
      acpRepo.findOne.mockResolvedValue({ ...mockAcp });

      await service.restore('snap-1');
      expect(acpRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        acpIndex: snapshotWithFiles.acpIndexSnapshot,
      }));
      expect(fileRepo.delete).toHaveBeenCalledWith({ acpId: 'acp-1' });
      expect(fileRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        acpId: 'acp-1',
        originalName: 'f1.json',
      }));
      expect(fileRepo.save).toHaveBeenCalled();
    });
  });
});
