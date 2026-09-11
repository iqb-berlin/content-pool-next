import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Check,
} from "typeorm";
import { Comment } from "./comment.entity";

export type CommentVoteValue = "UP" | "DOWN";

@Entity("comment_votes")
@Index("IDX_comment_votes_comment", ["commentId"])
@Check(
  "CHK_comment_votes_identity",
  `(user_id IS NOT NULL) <> (credential_id IS NOT NULL)`,
)
@Check("CHK_comment_votes_value", `value IN ('UP', 'DOWN')`)
@Index("IDX_comment_votes_user", ["commentId", "userId"], {
  unique: true,
  where: "user_id IS NOT NULL",
})
@Index("IDX_comment_votes_credential", ["commentId", "credentialId"], {
  unique: true,
  where: "credential_id IS NOT NULL",
})
export class CommentVote {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "comment_id", type: "uuid" }) commentId!: string;
  @Column({ name: "user_id", type: "uuid", nullable: true }) userId!:
    | string
    | null;
  @Column({ name: "credential_id", type: "uuid", nullable: true })
  credentialId!: string | null;
  @Column({ type: "varchar" }) value!: CommentVoteValue;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToOne(() => Comment, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "comment_id",
    foreignKeyConstraintName: "FK_comment_votes_comment",
  })
  comment!: Comment;
}
