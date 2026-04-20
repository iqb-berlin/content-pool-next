import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Acp } from "./acp.entity";

export enum AcpRole {
  ACP_MANAGER = "ACP_MANAGER",
  READ_ONLY = "READ_ONLY",
}

@Entity("acp_user_roles")
export class AcpUserRole {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({ name: "acp_id" })
  acpId!: string;

  @Column({ type: "enum", enum: AcpRole })
  role!: AcpRole;

  @ManyToOne(() => User, (user) => user.acpRoles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => Acp, (acp) => acp.userRoles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "acp_id" })
  acp!: Acp;
}
