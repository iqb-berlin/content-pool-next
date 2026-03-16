import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ValidationService } from './validation.service';
import { AcpFile, Acp } from '../database/entities';

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
          assessmentParts: [],
        },
      });
      fileRepo.find.mockResolvedValue([{ originalName: 'player.html' }]);

      const result = await service.validateAcpConsistency('acp-1');
      expect(result.valid).toBe(true);
    });

    it('should return error for unknown ACP', async () => {
      acpRepo.findOne.mockResolvedValue(null);
      const result = await service.validateAcpConsistency('bad');
      expect(result.valid).toBe(false);
    });
  });
});
