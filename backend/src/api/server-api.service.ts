import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acp, AcpFile } from '../database/entities';
import { FilesService } from '../files/files.service';

export type ConflictStrategy = 'reject' | 'overwrite' | 'merge';
export type IndexUpdateStrategy = 'overwrite' | 'merge';
export type FileConflictStrategy = 'reject' | 'overwrite' | 'keep-both';

export interface ServerImportAcpPayload {
  packageId: string;
  name: string;
  description?: string;
  acpIndex: Record<string, any>;
  expectedUpdatedAt?: string;
}

@Injectable()
export class ServerApiService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    private readonly filesService: FilesService,
  ) {}

  /**
   * List all ACPs available for server-to-server transfer.
   */
  async listAcps(): Promise<{
    id: string;
    packageId: string;
    name: string;
    version: string;
    updatedAt: string;
  }[]> {
    const acps = await this.acpRepository.find({ order: { updatedAt: 'DESC' } });
    return acps.map(acp => ({
      id: acp.id,
      packageId: acp.packageId,
      name: acp.name,
      version: (acp.acpIndex as any)?.version || '0.0.0',
      updatedAt: acp.updatedAt.toISOString(),
    }));
  }

  /**
   * Get full ACP data for transfer (ACP-Index + file list).
   */
  async getAcpTransferData(acpId: string): Promise<any> {
    const acp = await this.getAcpOrFail(acpId);
    const files = await this.listFiles(acpId);

    return {
      id: acp.id,
      packageId: acp.packageId,
      name: acp.name,
      description: acp.description,
      updatedAt: acp.updatedAt.toISOString(),
      acpIndex: acp.acpIndex,
      files,
    };
  }

  async getAcpIndex(acpId: string): Promise<{ acpId: string; packageId: string; updatedAt: string; acpIndex: Record<string, unknown> }> {
    const acp = await this.getAcpOrFail(acpId);
    return {
      acpId: acp.id,
      packageId: acp.packageId,
      updatedAt: acp.updatedAt.toISOString(),
      acpIndex: (acp.acpIndex || {}) as Record<string, unknown>,
    };
  }

  async updateAcpIndex(
    acpId: string,
    acpIndex: Record<string, any>,
    strategyInput?: string,
    expectedUpdatedAt?: string,
  ): Promise<{ acpId: string; packageId: string; updatedAt: string; conflictStrategy: IndexUpdateStrategy }> {
    if (!acpIndex || typeof acpIndex !== 'object' || Array.isArray(acpIndex)) {
      throw new BadRequestException('acpIndex must be an object');
    }

    const acp = await this.getAcpOrFail(acpId);
    this.assertExpectedUpdatedAt(acp, expectedUpdatedAt);

    const strategy = this.resolveIndexUpdateStrategy(strategyInput);
    acp.acpIndex = strategy === 'merge'
      ? this.deepMergeObjects(acp.acpIndex as Record<string, any>, acpIndex)
      : acpIndex;

    const saved = await this.acpRepository.save(acp);
    return {
      acpId: saved.id,
      packageId: saved.packageId,
      updatedAt: saved.updatedAt.toISOString(),
      conflictStrategy: strategy,
    };
  }

  async listFiles(acpId: string): Promise<Array<{ id: string; originalName: string; fileType?: string; fileSize: number; checksum?: string; uploadedAt: string; downloadUrl: string }>> {
    await this.getAcpOrFail(acpId);
    const files = await this.fileRepository.find({ where: { acpId }, order: { originalName: 'ASC' } });
    return files.map(file => this.toTransferFileMeta(file));
  }

  async getFile(acpId: string, fileId: string): Promise<{ id: string; originalName: string; fileType?: string; fileSize: number; checksum?: string; uploadedAt: string; downloadUrl: string }> {
    const file = await this.fileRepository.findOne({ where: { id: fileId, acpId } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return this.toTransferFileMeta(file);
  }

  async downloadFile(acpId: string, fileId: string): Promise<{ buffer: Buffer; file: AcpFile }> {
    await this.getAcpOrFail(acpId);
    return this.filesService.downloadForAcp(acpId, fileId);
  }

  async uploadFiles(
    acpId: string,
    files: Express.Multer.File[],
    conflictStrategyInput?: string,
  ): Promise<Array<{ id: string; originalName: string; fileType?: string; fileSize: number; checksum?: string; uploadedAt: string; downloadUrl: string }>> {
    await this.getAcpOrFail(acpId);

    const conflictStrategy = this.resolveFileConflictStrategy(conflictStrategyInput);
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    const existingFiles = await this.fileRepository.find({ where: { acpId } });
    const byName = new Map<string, AcpFile>();
    for (const existing of existingFiles) {
      byName.set(existing.originalName, existing);
    }

    const uploaded: AcpFile[] = [];

    for (const incoming of files) {
      const existing = byName.get(incoming.originalname);

      if (existing) {
        if (conflictStrategy === 'reject') {
          throw new ConflictException(
            `File conflict: ${incoming.originalname} already exists (use conflictStrategy=overwrite or keep-both)`,
          );
        }

        if (conflictStrategy === 'overwrite') {
          await this.filesService.deleteForAcp(acpId, existing.id);
          byName.delete(incoming.originalname);
        }
      }

      const saved = await this.filesService.upload(acpId, incoming);
      uploaded.push(saved);
      byName.set(saved.originalName, saved);
    }

    return uploaded.map(file => this.toTransferFileMeta(file));
  }

  /**
   * Receive ACP data from an external application.
   * Creates or updates an ACP with configurable conflict strategy.
   */
  async receiveAcp(
    data: ServerImportAcpPayload,
    conflictStrategyInput?: string,
  ): Promise<{ acp: Acp; operation: 'created' | 'updated'; conflictStrategy: ConflictStrategy }> {
    if (!data.packageId || !data.packageId.trim()) {
      throw new BadRequestException('packageId is required');
    }
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!data.acpIndex || typeof data.acpIndex !== 'object' || Array.isArray(data.acpIndex)) {
      throw new BadRequestException('acpIndex must be an object');
    }

    const conflictStrategy = this.resolveConflictStrategy(conflictStrategyInput);

    let acp = await this.acpRepository.findOne({ where: { packageId: data.packageId } });
    if (!acp) {
      acp = this.acpRepository.create({
        packageId: data.packageId,
        name: data.name,
        description: data.description || '',
        acpIndex: data.acpIndex,
        settings: {},
      });
      const saved = await this.acpRepository.save(acp);
      return { acp: saved, operation: 'created', conflictStrategy };
    }

    this.assertExpectedUpdatedAt(acp, data.expectedUpdatedAt);

    if (conflictStrategy === 'reject') {
      throw new ConflictException(
        `ACP with packageId \"${data.packageId}\" already exists. Use conflictStrategy=overwrite or conflictStrategy=merge.`,
      );
    }

    acp.name = data.name;
    if (data.description !== undefined) {
      acp.description = data.description;
    }

    acp.acpIndex = conflictStrategy === 'merge'
      ? this.deepMergeObjects(acp.acpIndex as Record<string, any>, data.acpIndex)
      : data.acpIndex;

    const saved = await this.acpRepository.save(acp);
    return { acp: saved, operation: 'updated', conflictStrategy };
  }

  private async getAcpOrFail(acpId: string): Promise<Acp> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${acpId} not found`);
    }
    return acp;
  }

  private toTransferFileMeta(file: AcpFile): {
    id: string;
    originalName: string;
    fileType?: string;
    fileSize: number;
    checksum?: string;
    uploadedAt: string;
    downloadUrl: string;
  } {
    return {
      id: file.id,
      originalName: file.originalName,
      fileType: file.fileType,
      fileSize: Number(file.fileSize),
      checksum: file.checksum,
      uploadedAt: file.uploadedAt.toISOString(),
      downloadUrl: `/api/server/acp/${file.acpId}/files/${file.id}/download`,
    };
  }

  private assertExpectedUpdatedAt(acp: Acp, expectedUpdatedAt?: string): void {
    if (!expectedUpdatedAt) {
      return;
    }

    const parsed = new Date(expectedUpdatedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('expectedUpdatedAt must be a valid ISO timestamp');
    }

    if (acp.updatedAt.toISOString() !== parsed.toISOString()) {
      throw new ConflictException(
        'ACP was modified since the expected version timestamp',
      );
    }
  }

  private resolveConflictStrategy(value?: string): ConflictStrategy {
    switch ((value || 'reject').trim().toLowerCase()) {
      case 'reject':
        return 'reject';
      case 'overwrite':
        return 'overwrite';
      case 'merge':
        return 'merge';
      default:
        throw new BadRequestException('conflictStrategy must be one of: reject, overwrite, merge');
    }
  }

  private resolveIndexUpdateStrategy(value?: string): IndexUpdateStrategy {
    switch ((value || 'overwrite').trim().toLowerCase()) {
      case 'overwrite':
        return 'overwrite';
      case 'merge':
        return 'merge';
      default:
        throw new BadRequestException('strategy must be one of: overwrite, merge');
    }
  }

  private resolveFileConflictStrategy(value?: string): FileConflictStrategy {
    switch ((value || 'keep-both').trim().toLowerCase()) {
      case 'reject':
        return 'reject';
      case 'overwrite':
        return 'overwrite';
      case 'keep-both':
        return 'keep-both';
      default:
        throw new BadRequestException('conflictStrategy must be one of: reject, overwrite, keep-both');
    }
  }

  private deepMergeObjects(
    base: Record<string, any>,
    incoming: Record<string, any>,
  ): Record<string, any> {
    const result: Record<string, any> = {
      ...(this.isRecord(base) ? base : {}),
    };

    for (const [key, incomingValue] of Object.entries(incoming || {})) {
      const baseValue = result[key];

      if (this.isRecord(baseValue) && this.isRecord(incomingValue)) {
        result[key] = this.deepMergeObjects(baseValue, incomingValue);
      } else {
        result[key] = incomingValue;
      }
    }

    return result;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
