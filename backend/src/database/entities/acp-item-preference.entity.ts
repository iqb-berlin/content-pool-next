import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Acp } from "./acp.entity";
import { User } from "./user.entity";
import { AcpCredential } from "./acp-credential.entity";

@Entity("acp_item_preferences")
@Index("IDX_acp_item_preferences_unique_user", ["acpId", "viewId", "userId"], {
  unique: true,
  where: '"user_id" IS NOT NULL',
})
@Index(
  "IDX_acp_item_preferences_unique_credential",
  ["acpId", "viewId", "credentialId"],
  { unique: true, where: '"credential_id" IS NOT NULL' },
)
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

  @Column({ name: "credential_id", type: "uuid", nullable: true })
  credentialId?: string | null;

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

  @ManyToOne(() => AcpCredential, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({
    name: "credential_id",
    foreignKeyConstraintName: "FK_acp_item_preferences_credential",
  })
  credential?: AcpCredential;
}
