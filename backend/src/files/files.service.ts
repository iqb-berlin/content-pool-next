import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { AcpFile, Acp, AcpAccessConfig } from '../database/entities';
import {
  findUnitInIndex,
  getAssessmentParts,
  getIndexUnits,
  toRuntimeAcpIndex,
} from '../acp/acp-index.utils';
import { normalizeFeatureConfig } from '../acp/feature-config.utils';

type UploadConflictStrategy = 'reject' | 'overwrite' | 'keep-both';

@Injectable()
export class FilesService {
  private readonly storagePath: string;

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    private readonly configService: ConfigService,
  ) {
    this.storagePath = this.configService.get<string>(
      'FILE_STORAGE_PATH',
      './uploads',
    );
  }

  async findByAcp(acpId: string): Promise<AcpFile[]> {
    return this.fileRepository.find({
      where: { acpId },
      order: { originalName: 'ASC' },
    });
  }

  async findById(id: string): Promise<AcpFile> {
    const file = await this.fileRepository.findOne({ where: { id } });
    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }
    return file;
  }

  async findByIdForAcp(acpId: string, id: string): Promise<AcpFile> {
    const file = await this.findById(id);
    if (file.acpId !== acpId) {
      throw new NotFoundException(`File with ID ${id} not found for ACP ${acpId}`);
    }
    return file;
  }

  async upload(
    acpId: string,
    uploadedFile: Express.Multer.File,
  ): Promise<AcpFile> {
    // Ensure directory exists
    const acpDir = path.join(this.storagePath, acpId);
    await fs.mkdir(acpDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(uploadedFile.originalname);
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(acpDir, uniqueName);

    // Write file
    await fs.writeFile(filePath, uploadedFile.buffer);

    // Compute checksum
    const checksum = crypto
      .createHash('sha256')
      .update(uploadedFile.buffer)
      .digest('hex');

    // Save metadata
    const file = this.fileRepository.create({
      acpId,
      filePath,
      originalName: uploadedFile.originalname,
      fileType: uploadedFile.mimetype,
      fileSize: uploadedFile.size,
      checksum,
    });

    return this.fileRepository.save(file);
  }

  async uploadMultiple(
    acpId: string,
    files: Express.Multer.File[],
    conflictStrategyInput?: string,
  ): Promise<AcpFile[]> {
    const conflictStrategy = this.resolveUploadConflictStrategy(
      conflictStrategyInput,
    );

    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    const existingFiles = await this.findByAcp(acpId);
    const existingByName = new Map<string, AcpFile[]>();
    for (const existing of existingFiles) {
      const key = this.normalizeFileName(existing.originalName);
      if (!key) {
        continue;
      }
      const bucket = existingByName.get(key) || [];
      bucket.push(existing);
      existingByName.set(key, bucket);
    }

    const seenIncomingNames = new Set<string>();
    const conflicts = new Set<string>();
    for (const incoming of files) {
      const incomingName = String(incoming?.originalname || '').trim();
      const key = this.normalizeFileName(incomingName);
      if (!key) {
        throw new BadRequestException('All files must include a filename');
      }

      if (existingByName.has(key) || seenIncomingNames.has(key)) {
        conflicts.add(incomingName);
      }
      seenIncomingNames.add(key);
    }

    if (conflictStrategy === 'reject' && conflicts.size > 0) {
      throw new ConflictException({
        message:
          'File conflicts detected. Resolve duplicates by skipping or uploading with conflictStrategy=overwrite.',
        conflicts: Array.from(conflicts).sort((a, b) => a.localeCompare(b)),
      });
    }

    const results: AcpFile[] = [];

    for (const file of files) {
      const key = this.normalizeFileName(file.originalname);
      if (!key) {
        throw new BadRequestException('All files must include a filename');
      }

      if (conflictStrategy === 'overwrite') {
        const matches = existingByName.get(key) || [];
        for (const match of matches) {
          await this.deleteForAcp(acpId, match.id);
        }
        existingByName.delete(key);
      }

      results.push(await this.upload(acpId, file));

      if (conflictStrategy === 'keep-both') {
        const bucket = existingByName.get(key) || [];
        bucket.push(results[results.length - 1]);
        existingByName.set(key, bucket);
      } else {
        existingByName.set(key, [results[results.length - 1]]);
      }
    }
    return results;
  }

  async download(id: string): Promise<{ buffer: Buffer; file: AcpFile }> {
    const file = await this.findById(id);
    try {
      const buffer = await fs.readFile(file.filePath);
      return { buffer, file };
    } catch {
      throw new NotFoundException('File not found on disk');
    }
  }

  async downloadForAcp(acpId: string, id: string): Promise<{ buffer: Buffer; file: AcpFile }> {
    const file = await this.findByIdForAcp(acpId, id);
    try {
      const buffer = await fs.readFile(file.filePath);
      return { buffer, file };
    } catch {
      throw new NotFoundException('File not found on disk');
    }
  }

  async delete(id: string): Promise<void> {
    const file = await this.findById(id);
    try {
      await fs.unlink(file.filePath);
    } catch {
      // File may already be deleted from disk
    }
    await this.fileRepository.remove(file);
  }

  async deleteForAcp(acpId: string, id: string): Promise<void> {
    const file = await this.findByIdForAcp(acpId, id);
    try {
      await fs.unlink(file.filePath);
    } catch {
      // File may already be deleted from disk
    }
    await this.fileRepository.remove(file);
  }

  async deleteAll(acpId: string): Promise<void> {
    const files = await this.findByAcp(acpId);
    for (const file of files) {
      try {
        await fs.unlink(file.filePath);
      } catch {
        // File may already be deleted from disk
      }
    }
    await this.fileRepository.remove(files);
  }

  async getValidationResult(id: string): Promise<Record<string, unknown> | null> {
    const file = await this.findById(id);
    return (file.validationResult as Record<string, unknown>) || null;
  }

  async getValidationResultForAcp(
    acpId: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const file = await this.findByIdForAcp(acpId, id);
    return (file.validationResult as Record<string, unknown>) || null;
  }

  async updateValidationResult(
    id: string,
    result: Record<string, unknown>,
  ): Promise<AcpFile> {
    const file = await this.findById(id);
    file.validationResult = result;
    return this.fileRepository.save(file);
  }

  async createUnitZip(acpId: string, unitId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const index = await this.getAcpIndex(acpId);
    const allFiles = await this.findByAcp(acpId);
    const unitFiles = this.collectUnitFiles(index, allFiles, unitId);
    if (!unitFiles.length) {
      throw new NotFoundException(`No files found for unit "${unitId}"`);
    }

    const buffer = await this.createZipBuffer(unitFiles);
    return { buffer, fileName: `acp-${acpId}-unit-${unitId}.zip` };
  }

  async createSequenceZip(acpId: string, sequenceId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const index = await this.getAcpIndex(acpId);
    const allFiles = await this.findByAcp(acpId);
    const unitIds = this.resolveSequenceUnitIds(index, sequenceId);

    if (!unitIds.length) {
      throw new NotFoundException(`Sequence "${sequenceId}" not found`);
    }

    const fileMap = new Map<string, AcpFile>();
    for (const unitId of unitIds) {
      const unitFiles = this.collectUnitFiles(index, allFiles, unitId, false);
      for (const file of unitFiles) {
        fileMap.set(file.id, file);
      }
    }

    const files = Array.from(fileMap.values());
    if (!files.length) {
      throw new NotFoundException(`No files found for sequence "${sequenceId}"`);
    }

    const buffer = await this.createZipBuffer(files);
    return { buffer, fileName: `acp-${acpId}-sequence-${sequenceId}.zip` };
  }

  async getFeatureConfig(acpId: string): Promise<Record<string, any>> {
    const config = await this.accessConfigRepository.findOne({ where: { acpId } });
    return normalizeFeatureConfig(config?.featureConfig || {}) as Record<string, any>;
  }

  async isUnitDependencyFile(acpId: string, fileName: string): Promise<boolean> {
    const index = await this.getAcpIndex(acpId);
    for (const unit of getIndexUnits(index)) {
      if (`${unit.id}.xml` === fileName) {
        return true;
      }

      for (const dep of unit.dependencies || []) {
        if (dep?.id && dep.id === fileName) {
          return true;
        }
      }
    }
    return false;
  }

  private async getAcpIndex(acpId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${acpId} not found`);
    }
    return toRuntimeAcpIndex(acp.acpIndex);
  }

  private resolveSequenceUnitIds(index: any, sequenceId: string): string[] {
    const parts = getAssessmentParts(index);
    for (const part of parts) {
      for (const module of part.bookletModules || []) {
        if (module.id === sequenceId) {
          return (module.units || [])
            .slice()
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((u: any) => u.id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        }
      }
    }
    return [];
  }

  private collectUnitFiles(index: any, allFiles: AcpFile[], unitId: string, throwOnMissingUnit = true): AcpFile[] {
    const unit = findUnitInIndex(index, unitId);
    if (!unit) {
      if (throwOnMissingUnit) {
        throw new NotFoundException(`Unit "${unitId}" not found`);
      }
      return [];
    }

    const dependencyNames = new Set<string>();
    for (const dep of unit.dependencies || []) {
      if (dep?.id && typeof dep.id === 'string') {
        dependencyNames.add(dep.id);
      }
    }

    // Most ACP exports include one XML per unit; include it if available.
    dependencyNames.add(`${unitId}.xml`);

    return allFiles.filter((file) => dependencyNames.has(file.originalName));
  }

  private async createZipBuffer(files: AcpFile[]): Promise<Buffer> {
    // JSZip is already part of the backend dependency tree.
    // Use dynamic require here to avoid TypeScript type dependency friction.
    const JSZip = require('jszip');
    const zip = new JSZip();

    let added = 0;
    for (const file of files) {
      try {
        const data = await fs.readFile(file.filePath);
        zip.file(file.originalName, data);
        added++;
      } catch {
        // Ignore missing on-disk files; we still zip what is available.
      }
    }

    if (added === 0) {
      throw new NotFoundException('None of the selected files are available on disk');
    }

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    return buffer as Buffer;
  }

  private resolveUploadConflictStrategy(
    conflictStrategyInput?: string,
  ): UploadConflictStrategy {
    const strategy = (conflictStrategyInput || 'reject').trim().toLowerCase();
    if (strategy === 'reject' || strategy === 'overwrite' || strategy === 'keep-both') {
      return strategy;
    }
    throw new BadRequestException(
      'Invalid conflictStrategy. Expected one of: reject, overwrite, keep-both',
    );
  }

  private normalizeFileName(fileName: string): string {
    return String(fileName || '').trim().toLowerCase();
  }
}
