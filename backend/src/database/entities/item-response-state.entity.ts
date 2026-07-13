import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("item_response_states")
@Index("IDX_item_response_states_acp_row_key_unique", ["acpId", "rowKey"], {
  unique: true,
})
@Index("IDX_item_response_states_acp_unit", ["acpId", "unitId"])
export class ItemResponseState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "acp_id" })
  acpId!: string;

  @Column({ name: "item_id" })
  itemId!: string;

  @Column({ name: "unit_id" })
  unitId!: string;

  @Column({ name: "row_key" })
  rowKey!: string;

  @Column({ name: "response_data", type: "jsonb", default: {} })
  responseData!: Record<string, any>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
