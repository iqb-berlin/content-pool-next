import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Acp } from './acp.entity';
import { User } from './user.entity';

export enum CommentTargetType {
  UNIT = 'UNIT',
  ITEM = 'ITEM',
  TASK_SEQUENCE = 'TASK_SEQUENCE',
}

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'acp_id' })
  acpId!: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'credential_username', nullable: true })
  credentialUsername?: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: CommentTargetType,
  })
  targetType!: CommentTargetType;

  @Column({ name: 'target_id' })
  targetId!: string;

  @Column({ name: 'comment_text', type: 'text' })
  commentText!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Acp, (acp) => acp.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'acp_id' })
  acp!: Acp;

  @ManyToOne(() => User, (user) => user.comments, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
