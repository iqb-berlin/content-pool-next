import { MigrationInterface, QueryRunner } from "typeorm";

export class AcpCapabilityGrants1789200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE acp_user_roles ADD COLUMN capabilities jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE acp_credentials ADD COLUMN capabilities jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `UPDATE acp_user_roles SET capabilities = '["review:participate","review:manage","item-explorer:view","item-explorer:edit"]' WHERE role = 'ACP_MANAGER'`,
    );
    for (const [table, join] of [
      ["acp_user_roles", "t.acp_id = c.acp_id AND t.role = 'READ_ONLY'"],
      ["acp_credentials", "t.access_config_id = c.id"],
    ]) {
      await queryRunner.query(`UPDATE ${table} t SET capabilities =
        (CASE WHEN c.feature_config->>'enableCommenting' = 'true' THEN '["review:participate"]'::jsonb ELSE '[]'::jsonb END) ||
        (CASE WHEN COALESCE(c.feature_config->>'enableItemList', 'true') = 'true' THEN '["item-explorer:view"]'::jsonb ELSE '[]'::jsonb END)
        FROM acp_access_configs c WHERE ${join}`);
    }
    await queryRunner.query(
      `UPDATE acp_access_configs SET feature_config = feature_config || '{"enableReview":false}'::jsonb`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE acp_credentials DROP COLUMN capabilities`,
    );
    await queryRunner.query(
      `ALTER TABLE acp_user_roles DROP COLUMN capabilities`,
    );
    // Keep review disabled/configuration explicit on rollback.
  }
}
