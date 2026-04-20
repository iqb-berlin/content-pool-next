import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Acp } from "./acp.entity";
import { User } from "./user.entity";

@Entity("acp_item_preferences")
export class AcpItemPreference {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "acp_id", type: "uuid" })
  acpId!: string;

  @Column({ name: "view_id", type: "varchar", default: "item-list" })
  viewId!: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId?: string | null;

  @Column({ name: "credential_username", type: "varchar", nullable: true })
  credentialUsername?: string | null;

  @Column({ type: "jsonb", default: {} })
  preferences!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @ManyToOne(() => Acp, { onDelete: "CASCADE" })
  @JoinColumn({ name: "acp_id" })
  acp!: Acp;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User;
}
