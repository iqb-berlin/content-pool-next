import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('server_api_audit_logs')
export class ServerApiAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id' })
  clientId!: string;

  @Column({ name: 'action' })
  action!: string;

  @Column({ name: 'method' })
  method!: string;

  @Column({ name: 'path', type: 'text' })
  path!: string;

  @Column({ name: 'acp_id', nullable: true })
  acpId?: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ name: 'success', default: true })
  success!: boolean;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode?: number;

  @Column({ name: 'details', type: 'jsonb', default: {} })
  details!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
