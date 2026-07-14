import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Acp } from "./acp.entity";

@Entity("acp_item_row_numbers")
@Index(
  "IDX_acp_item_row_numbers_acp_row_key_hash_unique",
  ["acpId", "rowKeyHash"],
  { unique: true },
)
@Index("IDX_acp_item_row_numbers_acp_number_unique", ["acpId", "rowNumber"], {
  unique: true,
})
@Check("CHK_acp_item_row_numbers_positive", '"row_number" > 0')
export class AcpItemRowNumber {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "acp_id", type: "uuid" })
  acpId!: string;

  @Column({ name: "row_key", type: "text" })
  rowKey!: string;

  @Column({ name: "row_key_hash", type: "varchar", length: 64 })
  rowKeyHash!: string;

  @Column({ name: "row_number", type: "integer" })
  rowNumber!: number;

  @ManyToOne(() => Acp, { onDelete: "CASCADE" })
  @JoinColumn({ name: "acp_id" })
  acp!: Acp;
}
