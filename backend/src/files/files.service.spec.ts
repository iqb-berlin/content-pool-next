import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { FilesService } from './files.service';
import { UnitParserService } from './unit-parser.service';
import {
  AcpFile,
  Acp,
  AcpAccessConfig,
  ItemResponseState,
} from '../database/entities';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('file content')),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('FilesService', () => {
  let service: FilesService;
  let repo: any;
  let acpRepo: any;
  let accessConfigRepo: any;
  let stateRepo: any;
  let unitParserService: any;

  const mockFile = {
    id: 'file-1',
    acpId: 'acp-1',
    filePath: '/uploads/acp-1/test.json',
    originalName: 'test.json',
    fileType: 'application/json',
    fileSize: 1024,
    checksum: 'abc123',
    validationResult: null,
    uploadedAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([mockFile]),
      findOne: jest.fn().mockResolvedValue(mockFile),
      create: jest.fn().mockImplementation(dto => ({ ...dto, id: 'new-file' })),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    acpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'acp-1',
        acpIndex: {
          units: [
            {
              id: 'unit-1',
              dependencies: [{ id: 'test.json', type: 'UNIT_DEFINITION' }],
            },
            {
              id: 'unit-2',
              dependencies: [{ id: 'second.json', type: 'UNIT_DEFINITION' }],
            },
          ],
          assessmentParts: [
            {
              bookletModules: [
                {
                  id: 'seq-1',
                  units: [
                    { id: 'unit-1', order: 1 },
                    { id: 'unit-2', order: 2 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    };
    accessConfigRepo = {
      findOne: jest.fn().mockResolvedValue({ featureConfig: {} }),
    };
    stateRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    unitParserService = {
      getItemListFromFiles: jest.fn().mockResolvedValue({
        columns: [],
        items: [],
        unitMetadata: {},
        codingSchemes: {},
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(AcpFile), useValue: repo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepo },
        { provide: getRepositoryToken(ItemResponseState), useValue: stateRepo },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
        { provide: UnitParserService, useValue: unitParserService },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('findByAcp', () => {
    it('should return files for ACP', async () => {
      const result = await service.findByAcp('acp-1');
      expect(result).toHaveLength(1);
      expect(result[0].originalName).toBe('test.json');
    });
  });

  describe('findById', () => {
    it('should return file by id', async () => {
      const result = await service.findById('file-1');
      expect(result.originalName).toBe('test.json');
    });

    it('should throw NotFoundException', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw when ACP-scoped lookup does not match ACP', async () => {
      repo.findOne.mockResolvedValue({ ...mockFile, acpId: 'other-acp' });
      await expect(service.findByIdForAcp('acp-1', 'file-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upload', () => {
    it('should upload file and store metadata', async () => {
      const multerFile = {
        originalname: 'data.json',
        mimetype: 'application/json',
        size: 512,
        buffer: Buffer.from('{"test": true}'),
      } as Express.Multer.File;

      const result = await service.upload('acp-1', multerFile);
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('uploadMultiple', () => {
    const incoming = {
      originalname: 'test.json',
      mimetype: 'application/json',
      size: 128,
      buffer: Buffer.from('{"fresh": true}'),
    } as Express.Multer.File;

    it('should reject conflicts by default', async () => {
      await expect(service.uploadMultiple('acp-1', [incoming])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should overwrite existing files when strategy is overwrite', async () => {
      const deleteSpy = jest
        .spyOn(service, 'deleteForAcp')
        .mockResolvedValue(undefined);
      const uploadSpy = jest.spyOn(service, 'upload').mockResolvedValue({
        ...mockFile,
        id: 'new-file',
        originalName: 'test.json',
      } as unknown as AcpFile);

      const result = await service.uploadMultiple('acp-1', [incoming], 'overwrite');

      expect(deleteSpy).toHaveBeenCalledWith('acp-1', 'file-1');
      expect(uploadSpy).toHaveBeenCalledWith('acp-1', incoming);
      expect(result).toHaveLength(1);
    });

    it('should keep both files when strategy is keep-both', async () => {
      const deleteSpy = jest
        .spyOn(service, 'deleteForAcp')
        .mockResolvedValue(undefined);
      const uploadSpy = jest.spyOn(service, 'upload').mockResolvedValue({
        ...mockFile,
        id: 'new-file',
        originalName: 'test.json',
      } as unknown as AcpFile);

      const result = await service.uploadMultiple('acp-1', [incoming], 'keep-both');

      expect(deleteSpy).not.toHaveBeenCalled();
      expect(uploadSpy).toHaveBeenCalledWith('acp-1', incoming);
      expect(result).toHaveLength(1);
    });

    it('should reject invalid conflict strategy', async () => {
      await expect(
        service.uploadMultiple('acp-1', [incoming], 'invalid-strategy'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require at least one file', async () => {
      await expect(service.uploadMultiple('acp-1', [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject files without filename', async () => {
      const invalidFile = {
        ...incoming,
        originalname: '   ',
      } as Express.Multer.File;

      await expect(service.uploadMultiple('acp-1', [invalidFile])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('download', () => {
    it('should return file buffer', async () => {
      const result = await service.download('file-1');
      expect(result.buffer).toBeDefined();
      expect(result.file.originalName).toBe('test.json');
    });

    it('should fail when file is missing on disk', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('missing'));
      await expect(service.download('file-1')).rejects.toThrow(NotFoundException);
    });

    it('should download ACP-scoped file and fail on missing disk file', async () => {
      await expect(service.downloadForAcp('acp-1', 'file-1')).resolves.toEqual(
        expect.objectContaining({ file: expect.objectContaining({ id: 'file-1' }) }),
      );

      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('missing'));
      await expect(service.downloadForAcp('acp-1', 'file-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete file from disk and DB', async () => {
      repo.findOne.mockResolvedValue(mockFile);
      await service.delete('file-1');
      expect(repo.remove).toHaveBeenCalledWith(mockFile);
    });

    it('should ignore unlink errors during delete operations', async () => {
      (fs.unlink as jest.Mock).mockRejectedValueOnce(new Error('gone'));
      await expect(service.delete('file-1')).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockFile);
    });

    it('should delete by ACP and remove all files', async () => {
      await expect(service.deleteForAcp('acp-1', 'file-1')).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockFile);

      repo.find.mockResolvedValue([
        { ...mockFile, id: 'file-1', filePath: '/x/1' },
        { ...mockFile, id: 'file-2', filePath: '/x/2' },
      ]);
      (fs.unlink as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('missing'));

      await expect(service.deleteAll('acp-1')).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'file-1' }),
        expect.objectContaining({ id: 'file-2' }),
      ]);
    });
  });

  describe('cleanupOrphanedResponseStates', () => {
    it('deletes response states that no longer match any file-backed item', async () => {
      stateRepo.find.mockResolvedValueOnce([
        { id: 'state-1', unitId: 'unit-1', itemId: 'item-a' },
        { id: 'state-2', unitId: 'unit-1', itemId: 'item-b' },
      ]);
      unitParserService.getItemListFromFiles.mockResolvedValueOnce({
        columns: [],
        items: [{ itemId: 'item-a', unitId: 'unit-1' }],
        unitMetadata: {},
        codingSchemes: {},
      });

      const result = await service.cleanupOrphanedResponseStates('acp-1');

      expect(stateRepo.delete).toHaveBeenCalledWith(['state-2']);
      expect(result).toEqual({
        totalStates: 2,
        deletedStates: 1,
        keptStates: 1,
      });
    });

    it('returns zero cleanup when no response states exist', async () => {
      stateRepo.find.mockResolvedValueOnce([]);

      const result = await service.cleanupOrphanedResponseStates('acp-1');

      expect(unitParserService.getItemListFromFiles).not.toHaveBeenCalled();
      expect(stateRepo.delete).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalStates: 0,
        deletedStates: 0,
        keptStates: 0,
      });
    });
  });

  describe('updateValidationResult', () => {
    it('should update validation result', async () => {
      const result = { valid: true, issues: [], timestamp: new Date().toISOString() };
      repo.findOne.mockResolvedValue({ ...mockFile });
      await service.updateValidationResult('file-1', result);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ validationResult: result }));
    });

    it('returns validation results via generic and ACP-scoped APIs', async () => {
      repo.findOne.mockResolvedValue({
        ...mockFile,
        validationResult: { valid: true },
      });

      await expect(service.getValidationResult('file-1')).resolves.toEqual({ valid: true });
      await expect(service.getValidationResultForAcp('acp-1', 'file-1')).resolves.toEqual({ valid: true });
    });
  });

  describe('createUnitZip', () => {
    it('should create a ZIP for a single unit', async () => {
      repo.find.mockResolvedValue([
        { ...mockFile, id: 'f1', originalName: 'test.json' },
        { ...mockFile, id: 'f2', originalName: 'unit-1.xml' },
      ]);
      const result = await service.createUnitZip('acp-1', 'unit-1');
      expect(result.fileName).toBe('acp-acp-1-unit-unit-1.zip');
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('should throw when unit has no files', async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.createUnitZip('acp-1', 'unit-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSequenceZip', () => {
    it('should create a ZIP for all units in a sequence', async () => {
      repo.find.mockResolvedValue([
        { ...mockFile, id: 'f1', originalName: 'test.json' },
        { ...mockFile, id: 'f2', originalName: 'unit-1.xml' },
        { ...mockFile, id: 'f3', originalName: 'second.json' },
        { ...mockFile, id: 'f4', originalName: 'unit-2.xml' },
      ]);
      const result = await service.createSequenceZip('acp-1', 'seq-1');
      expect(result.fileName).toBe('acp-acp-1-sequence-seq-1.zip');
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('should throw when sequence does not exist', async () => {
      await expect(service.createSequenceZip('acp-1', 'unknown-seq')).rejects.toThrow(NotFoundException);
    });

    it('should throw when sequence exists but no files are available', async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.createSequenceZip('acp-1', 'seq-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('feature config and dependency checks', () => {
    it('returns normalized feature config', async () => {
      accessConfigRepo.findOne.mockResolvedValue({
        featureConfig: {
          itemListMetadataColumns: ['metaA'],
        },
      });

      await expect(service.getFeatureConfig('acp-1')).resolves.toEqual(
        expect.objectContaining({
          metadataColumns: {
            visible: ['metaA'],
            order: ['metaA'],
          },
        }),
      );
    });

    it('detects dependency files from ACP index', async () => {
      await expect(service.isUnitDependencyFile('acp-1', 'unit-1.xml')).resolves.toBe(true);
      await expect(service.isUnitDependencyFile('acp-1', 'test.json')).resolves.toBe(true);
      await expect(service.isUnitDependencyFile('acp-1', 'missing.json')).resolves.toBe(false);
    });
  });
});
