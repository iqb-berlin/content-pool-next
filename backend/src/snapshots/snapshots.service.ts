import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Acp, AcpSnapshot, AcpSnapshotFile, AcpFile } from '../database/entities';

@Injectable()
export class SnapshotsService {
  private readonly storagePath: string;

  constructor(
    @InjectRepository(AcpSnapshot)
    private readonly snapshotRepository: Repository<AcpSnapshot>,
    @InjectRepository(AcpSnapshotFile)
    private readonly snapshotFileRepository: Repository<AcpSnapshotFile>,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    private readonly configService: ConfigService,
  ) {
    this.storagePath = this.configService.get<string>('FILE_STORAGE_PATH', './uploads');
  }

  async findByAcp(acpId: string): Promise<AcpSnapshot[]> {
    return this.snapshotRepository.find({
      where: { acpId },
      order: { versionNumber: 'DESC' },
    });
  }

  async findById(id: string): Promise<AcpSnapshot> {
    const snapshot = await this.snapshotRepository.findOne({
      where: { id },
      relations: ['snapshotFiles'],
    });
    if (!snapshot) {
      throw new NotFoundException(`Snapshot with ID ${id} not found`);
    }
    return snapshot;
  }

  async create(acpId: string, changelog?: string): Promise<AcpSnapshot> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${acpId} not found`);
    }

    // Determine next version number
    const latestSnapshot = await this.snapshotRepository.findOne({
      where: { acpId },
      order: { versionNumber: 'DESC' },
    });
    const nextVersion = latestSnapshot ? latestSnapshot.versionNumber + 1 : 1;

    // Create snapshot
    const snapshot = this.snapshotRepository.create({
      acpId,
      versionNumber: nextVersion,
      acpIndexSnapshot: { ...acp.acpIndex },
      changelog,
    });
    const savedSnapshot = await this.snapshotRepository.save(snapshot);

    // Copy file references
    const files = await this.fileRepository.find({ where: { acpId } });
    const snapshotFiles = files.map((file) =>
      this.snapshotFileRepository.create({
        snapshotId: savedSnapshot.id,
        filePath: file.filePath,
        originalName: file.originalName,
        checksum: file.checksum,
        fileSize: file.fileSize,
      }),
    );
    if (snapshotFiles.length > 0) {
      await this.snapshotFileRepository.save(snapshotFiles);
    }

    return this.findById(savedSnapshot.id);
  }

  async restore(snapshotId: string): Promise<Acp> {
    const snapshot = await this.findById(snapshotId);
    const acp = await this.acpRepository.findOne({
      where: { id: snapshot.acpId },
    });
    if (!acp) {
      throw new NotFoundException('ACP not found');
    }

    // Restore ACP-Index
    acp.acpIndex = { ...snapshot.acpIndexSnapshot };
    await this.acpRepository.save(acp);

    // Restore file reference state from snapshot.
    await this.fileRepository.delete({ acpId: snapshot.acpId });
    if (snapshot.snapshotFiles?.length) {
      const restoredFiles: AcpFile[] = [];
      for (const sf of snapshot.snapshotFiles) {
        const { filePath, fileSize } = await this.resolveRestoredFilePath(acp.id, snapshot.id, sf);
        restoredFiles.push(
          this.fileRepository.create({
            acpId: acp.id,
            filePath,
            originalName: sf.originalName,
            fileSize: fileSize ?? sf.fileSize,
            checksum: sf.checksum,
          }),
        );
      }
      await this.fileRepository.save(restoredFiles);
    }

    return acp;
  }

  private async resolveRestoredFilePath(
    acpId: string,
    snapshotId: string,
    snapshotFile: AcpSnapshotFile,
  ): Promise<{ filePath: string; fileSize?: number }> {
    try {
      await fs.access(snapshotFile.filePath);
    } catch {
      // Source file missing; fall back to stored reference path.
      return { filePath: snapshotFile.filePath, fileSize: snapshotFile.fileSize };
    }

    try {
      const targetDir = path.join(this.storagePath, acpId, 'snapshot-restore', snapshotId);
      await fs.mkdir(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, snapshotFile.originalName);
      await fs.copyFile(snapshotFile.filePath, targetPath);
      const stats = await fs.stat(targetPath);
      return { filePath: targetPath, fileSize: Number(stats.size) };
    } catch {
      // Copy failed; keep path reference to source file.
      return { filePath: snapshotFile.filePath, fileSize: snapshotFile.fileSize };
    }
  }

  async diff(snapshotId: string): Promise<Record<string, unknown>> {
    const snapshot = await this.findById(snapshotId);

    // Find previous snapshot
    const previousSnapshot = await this.snapshotRepository.findOne({
      where: { acpId: snapshot.acpId },
      order: { versionNumber: 'DESC' },
      relations: ['snapshotFiles'],
    });

    if (!previousSnapshot || previousSnapshot.id === snapshotId) {
      return { message: 'No previous snapshot to compare with' };
    }

    // Compare file lists
    const currentFiles = snapshot.snapshotFiles || [];
    const previousFiles = previousSnapshot.snapshotFiles || [];

    const currentChecksums = new Map(
      currentFiles.map((f) => [f.originalName, f.checksum]),
    );
    const previousChecksums = new Map(
      previousFiles.map((f) => [f.originalName, f.checksum]),
    );

    const added = currentFiles
      .filter((f) => !previousChecksums.has(f.originalName))
      .map((f) => f.originalName);
    const removed = previousFiles
      .filter((f) => !currentChecksums.has(f.originalName))
      .map((f) => f.originalName);
    const modified = currentFiles
      .filter(
        (f) =>
          previousChecksums.has(f.originalName) &&
          previousChecksums.get(f.originalName) !== f.checksum,
      )
      .map((f) => f.originalName);

    return {
      snapshotId,
      comparedWith: previousSnapshot.id,
      added,
      removed,
      modified,
      unchanged: currentFiles.length - added.length - modified.length,
    };
  }
}
