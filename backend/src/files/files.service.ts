import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { AcpFile } from '../database/entities';

@Injectable()
export class FilesService {
  private readonly storagePath: string;

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
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
  ): Promise<AcpFile[]> {
    const results: AcpFile[] = [];
    for (const file of files) {
      results.push(await this.upload(acpId, file));
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

  async delete(id: string): Promise<void> {
    const file = await this.findById(id);
    try {
      await fs.unlink(file.filePath);
    } catch {
      // File may already be deleted from disk
    }
    await this.fileRepository.remove(file);
  }

  async getValidationResult(id: string): Promise<Record<string, unknown> | null> {
    const file = await this.findById(id);
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
}
