import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { AcpAccessConfig } from "./acp-access-config.entity";

@Entity("acp_credentials")
@Index("IDX_acp_credentials_unique_username", ["accessConfigId", "username"], {
  unique: true,
})
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
