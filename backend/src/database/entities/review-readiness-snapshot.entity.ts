import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Acp } from "./acp.entity";
import type { ReviewReadinessResult } from "../../review/review-readiness.service";

@Entity("review_readiness_snapshots")
export class ReviewReadinessSnapshot {
  @PrimaryColumn({ name: "acp_id", type: "uuid" }) acpId!: string;
  @Column({ type: "varchar" }) fingerprint!: string;
  @Column({ type: "jsonb" }) result!: ReviewReadinessResult;
  @ManyToOne(() => Acp, { onDelete: "CASCADE" })
  @JoinColumn({ name: "acp_id" })
  acp!: Acp;
}
