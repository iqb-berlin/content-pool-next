import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service';
import { AcpFile } from '../database/entities';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('file content')),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('FilesService', () => {
  let service: FilesService;
  let repo: any;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(AcpFile), useValue: repo },
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
});
