import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { performance } from "perf_hooks";
import { AcpFile } from "../database/entities";
import { AsyncCacheStatus, AsyncLruCache } from "./async-lru-cache";

export interface FileCatalogSnapshot {
  files: AcpFile[];
  signature: string;
}

export interface FileCatalogResult extends FileCatalogSnapshot {
  cacheStatus: AsyncCacheStatus;
  sourceReadMs: number;
  fileSignatureMs: number;
}

@Injectable()
export class FileCatalogCache {
  private readonly cache = new AsyncLruCache<string, FileCatalogSnapshot>(100);

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
  ) {}

  get size(): number {
    return this.cache.size;
  }

  async get(acpId: string): Promise<FileCatalogResult> {
    const totalStartedAt = performance.now();
    const signatureStartedAt = performance.now();
    const revision = await this.loadRevision(acpId);
    const fileSignatureMs = performance.now() - signatureStartedAt;
    const cacheKey = `${acpId}:${revision.signature}`;

    this.cache.deleteWhere(
      (key) => key.startsWith(`${acpId}:`) && key !== cacheKey,
    );
    const { value, status } = await this.cache.getOrLoad(cacheKey, async () => {
      const files =
        revision.files || (await this.loadFileCatalogRecords(acpId));
      return {
        files: structuredClone(files),
        signature: revision.signature,
      };
    });

    return {
      files: structuredClone(value.files),
      signature: value.signature,
      cacheStatus: status,
      sourceReadMs: performance.now() - totalStartedAt,
      fileSignatureMs,
    };
  }

  invalidate(acpId: string): void {
    this.cache.deleteWhere((key) => key.startsWith(`${acpId}:`));
  }

  private async loadRevision(
    acpId: string,
  ): Promise<{ signature: string; files?: AcpFile[] }> {
    if (typeof this.fileRepository.query !== "function") {
      const files = await this.loadFileCatalogRecords(acpId);
      return {
        signature: buildSourceFileSignature(files),
        files,
      };
    }

    const rows = (await this.fileRepository.query(
      `
        SELECT
          COUNT(*)::text AS count,
          COALESCE(
            md5(
              string_agg(
                concat_ws(
                  chr(31),
                  id::text,
                  original_name,
                  file_path,
                  COALESCE(checksum, ''),
                  file_size::text,
                  uploaded_at::text
                ),
                chr(30) ORDER BY id::text
              )
            ),
            md5('')
          ) AS hash
        FROM acp_files
        WHERE acp_id = $1
      `,
      [acpId],
    )) as Array<{ count?: string; hash?: string }>;
    return {
      signature: `${rows[0]?.count || "0"}:${rows[0]?.hash || ""}`,
    };
  }

  private loadFileCatalogRecords(acpId: string): Promise<AcpFile[]> {
    return this.fileRepository.find({
      where: { acpId },
      select: {
        id: true,
        acpId: true,
        filePath: true,
        originalName: true,
        fileType: true,
        fileSize: true,
        checksum: true,
        uploadedAt: true,
      },
    });
  }
}

export function buildSourceFileSignature(files: AcpFile[]): string {
  return JSON.stringify(
    files
      .map((file) => [
        file.id,
        file.originalName,
        file.filePath,
        file.checksum || "",
        String(file.fileSize || ""),
        file.uploadedAt instanceof Date
          ? file.uploadedAt.toISOString()
          : String(file.uploadedAt || ""),
      ])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}
