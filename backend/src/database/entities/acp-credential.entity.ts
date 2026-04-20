import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { AcpAccessConfig } from "./acp-access-config.entity";

@Entity("acp_credentials")
export class AcpCredential {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "access_config_id" })
  accessConfigId!: string;

  @Column()
  username!: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @ManyToOne(() => AcpAccessConfig, (config) => config.credentials, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "access_config_id" })
  accessConfig!: AcpAccessConfig;
}
