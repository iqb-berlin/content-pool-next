import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acp, AcpFile, AcpAccessConfig, AccessModel } from '../database/entities';

/**
 * Server-to-server API service.
 * Used by external applications (Studio, Testcenter, Kodierbox) to
 * list and transfer ACP data programmatically.
 */
@Injectable()
export class ServerApiService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
  ) {}

  /**
   * List all ACPs available for server-to-server transfer.
   */
  async listAcps(): Promise<{ id: string; packageId: string; name: string; version: string }[]> {
    const acps = await this.acpRepository.find();
    return acps.map(acp => ({
      id: acp.id,
      packageId: acp.packageId,
      name: acp.name,
      version: (acp.acpIndex as any)?.version || '0.0.0',
    }));
  }

  /**
   * Get full ACP data for transfer (ACP-Index + file list).
   */
  async getAcpTransferData(acpId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const files = await this.fileRepository.find({ where: { acpId } });

    return {
      packageId: acp.packageId,
      name: acp.name,
      acpIndex: acp.acpIndex,
      files: files.map(f => ({
        id: f.id,
        originalName: f.originalName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        checksum: f.checksum,
        downloadUrl: `/api/acp/${acpId}/files/${f.id}/download`,
      })),
    };
  }
}
