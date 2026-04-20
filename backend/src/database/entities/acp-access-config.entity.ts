import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { Acp } from "./acp.entity";
import { AcpCredential } from "./acp-credential.entity";

export enum AccessModel {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
  REGISTERED = "REGISTERED",
  CREDENTIALS_LIST = "CREDENTIALS_LIST",
}

@Entity("acp_access_configs")
export class AcpAccessConfig {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "acp_id" })
  acpId!: string;

  @Column({ name: "access_model", type: "enum", enum: AccessModel })
  accessModel!: AccessModel;

  @Column({ name: "allow_registered", type: "boolean", default: false })
  allowRegistered!: boolean;

  @Column({ name: "feature_config", type: "jsonb", default: {} })
  featureConfig!: Record<string, unknown>;

  @Column({ name: "valid_from", type: "timestamptz", nullable: true })
  validFrom?: Date;

  @Column({ name: "valid_until", type: "timestamptz", nullable: true })
  validUntil?: Date;

  @ManyToOne(() => Acp, (acp) => acp.accessConfigs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "acp_id" })
  acp!: Acp;

  @OneToMany(() => AcpCredential, (cred) => cred.accessConfig)
  credentials!: AcpCredential[];
}
