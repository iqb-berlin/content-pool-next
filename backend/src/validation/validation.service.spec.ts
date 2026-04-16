import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ValidationService } from './validation.service';
import { AcpFile, Acp } from '../database/entities';
import * as fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

describe('ValidationService', () => {
  let service: ValidationService;
  let fileRepo: any;
  let acpRepo: any;

  beforeEach(async () => {
    fileRepo = {
      find: jest.fn(),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
    };
    acpRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        { provide: getRepositoryToken(AcpFile), useValue: fileRepo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
  });

  describe('validateFile', () => {
    it('should validate valid JSON file', async () => {
      const file = { originalName: 'data.json' } as AcpFile;
      const buffer = Buffer.from('{"key": "value"}');
      const result = await service.validateFile(file, buffer);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should report error for invalid JSON', async () => {
      const file = { originalName: 'bad.json' } as AcpFile;
      const buffer = Buffer.from('not json{');
      const result = await service.validateFile(file, buffer);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.severity === 'error')).toBe(true);
    });

    it('should warn on empty file', async () => {
      const file = { originalName: 'empty.txt' } as AcpFile;
      const buffer = Buffer.alloc(0);
      const result = await service.validateFile(file, buffer);
      expect(result.issues.some(i => i.severity === 'warning' && i.message.includes('empty'))).toBe(true);
    });

    it('should report schema errors for ACP index JSON with invalid required fields', async () => {
      const file = { originalName: 'acp-index.json' } as AcpFile;
      const buffer = Buffer.from(JSON.stringify({
        version: '',
        status: 'INVALID_STATUS',
        assessmentParts: [],
      }));

      const result = await service.validateFile(file, buffer);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.path === 'packageId')).toBe(true);
      expect(result.issues.some(i => i.path === 'status')).toBe(true);
    });
  });

  describe('validateAcpConsistency', () => {
    it('should detect missing file references', async () => {
      acpRepo.findOne.mockResolvedValue({
        id: 'acp-1',
        acpIndex: {
          units: [{ id: 'u1', dependencies: [{ id: 'missing-file.xml', type: 'PLAYER' }] }],
          assessmentParts: [],
        },
      });
      fileRepo.find.mockResolvedValue([]); // no files

      const result = await service.validateAcpConsistency('acp-1');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes('missing-file.xml'))).toBe(true);
    });

    it('should pass when all references exist', async () => {
      acpRepo.findOne.mockResolvedValue({
        id: 'acp-1',
        acpIndex: {
          units: [{ id: 'u1', dependencies: [{ id: 'player.html', type: 'PLAYER' }] }],
          assessmentParts: [
            {
              bookletModules: [{ id: 'mod-1', units: [{ id: 'u1' }] }],
              instruments: [
                {
                  id: 'inst-1',
                  testcenterBooklet: [
                    { definitionId: 'booklet.xml', modules: ['mod-1'] },
                  ],
                },
              ],
            },
          ],
        },
      });
      fileRepo.find.mockResolvedValue([
        { originalName: 'player.html' },
        { originalName: 'booklet.xml' },
      ]);

      const result = await service.validateAcpConsistency('acp-1');
      expect(result.valid).toBe(true);
    });

    it('should return error for unknown ACP', async () => {
      acpRepo.findOne.mockResolvedValue(null);
      const result = await service.validateAcpConsistency('bad');
      expect(result.valid).toBe(false);
    });
  });

  describe('autoValidateUploadedFiles', () => {
    it('should run file and semantic validation and persist merged per-file results', async () => {
      const readFileMock = fs.readFile as jest.Mock;
      readFileMock.mockResolvedValue(
        Buffer.from(JSON.stringify({
          packageId: 'pkg-1',
          version: '0.5.0',
          status: 'RELEASED_PUBLIC',
          assessmentParts: [],
        })),
      );

      acpRepo.findOne.mockResolvedValue({
        id: 'acp-1',
        acpIndex: {
          assessmentParts: [
            {
              units: [{ id: 'u1', dependencies: [{ id: 'missing-player.html', type: 'PLAYER' }] }],
            },
          ],
        },
      });
      fileRepo.find.mockResolvedValue([{ originalName: 'uploaded-acp-index.json' }]);

      const uploadedFile = {
        id: 'file-1',
        acpId: 'acp-1',
        filePath: '/tmp/uploaded-acp-index.json',
        originalName: 'uploaded-acp-index.json',
      } as AcpFile;

      const result = await service.autoValidateUploadedFiles('acp-1', [uploadedFile]);

      expect(result.summary.totalFiles).toBe(1);
      expect(result.summary.semanticValid).toBe(false);
      expect(result.files[0].validationResult).toBeDefined();
      expect((result.files[0].validationResult as any).issues.some((i: any) => i.scope === 'semantic')).toBe(true);
      expect(fileRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 'file-1' }),
      ]));
    });
  });
});
