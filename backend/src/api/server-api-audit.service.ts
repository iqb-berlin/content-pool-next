import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ServerApiAuditLog } from "../database/entities";

export interface ServerApiAuditEntry {
  clientId: string;
  action: string;
  method: string;
  path: string;
  acpId?: string;
  resourceId?: string;
  success: boolean;
  statusCode?: number;
  details?: Record<string, unknown>;
}

@Injectable()
export class ServerApiAuditService {
  constructor(
    @InjectRepository(ServerApiAuditLog)
    private readonly auditRepository: Repository<ServerApiAuditLog>,
  ) {}

  async log(entry: ServerApiAuditEntry): Promise<void> {
    const record = this.auditRepository.create({
      clientId: entry.clientId,
      action: entry.action,
      method: entry.method,
      path: entry.path,
      acpId: entry.acpId || undefined,
      resourceId: entry.resourceId || undefined,
      success: entry.success,
      statusCode: entry.statusCode,
      details: entry.details || {},
    });

    await this.auditRepository.save(record);
  }

  async list(
    limit = 100,
    action?: string,
    clientId?: string,
  ): Promise<ServerApiAuditLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const qb = this.auditRepository
      .createQueryBuilder("log")
      .orderBy("log.created_at", "DESC")
      .limit(safeLimit);

    if (action) {
      qb.andWhere("log.action = :action", { action });
    }

    if (clientId) {
      qb.andWhere("log.client_id = :clientId", { clientId });
    }

    return qb.getMany();
  }
}
