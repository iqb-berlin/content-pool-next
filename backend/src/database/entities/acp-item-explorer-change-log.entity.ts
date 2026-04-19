import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Acp } from './acp.entity';
import { User } from './user.entity';

@Entity('acp_item_explorer_change_log')
export class AcpItemExplorerChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'acp_id', type: 'uuid' })
  acpId!: string;

  @Column({ name: 'change_type', type: 'varchar' })
  changeType!: string;

  @Column({ name: 'before_state', type: 'jsonb', default: {} })
  beforeState!: Record<string, unknown>;

  @Column({ name: 'after_state', type: 'jsonb', default: {} })
  afterState!: Record<string, unknown>;

  @Column({ name: 'diff', type: 'jsonb', default: {} })
  diff!: Record<string, unknown>;

  @Column({ name: 'draft_version', type: 'int', nullable: true })
  draftVersion?: number | null;

  @Column({ name: 'published_version', type: 'int', nullable: true })
  publishedVersion?: number | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null;

  @Column({ name: 'actor_username', type: 'varchar', nullable: true })
  actorUsername?: string | null;

  @Column({ name: 'actor_role', type: 'varchar', nullable: true })
  actorRole?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Acp, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'acp_id' })
  acp!: Acp;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser?: User;
}
