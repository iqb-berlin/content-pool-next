import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service';
import { AcpFile, Acp, AcpAccessConfig } from '../database/entities';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(AcpFile), useValue: repo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepo },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
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

  describe('download', () => {
    it('should return file buffer', async () => {
      const result = await service.download('file-1');
      expect(result.buffer).toBeDefined();
      expect(result.file.originalName).toBe('test.json');
    });
  });

  describe('delete', () => {
    it('should delete file from disk and DB', async () => {
      repo.findOne.mockResolvedValue(mockFile);
      await service.delete('file-1');
      expect(repo.remove).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('updateValidationResult', () => {
    it('should update validation result', async () => {
      const result = { valid: true, issues: [], timestamp: new Date().toISOString() };
      repo.findOne.mockResolvedValue({ ...mockFile });
      await service.updateValidationResult('file-1', result);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ validationResult: result }));
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
  });
});
