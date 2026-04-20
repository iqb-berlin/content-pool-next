import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOidcSubToUser1742650000000 implements MigrationInterface {
  name = "AddOidcSubToUser1742650000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUsersTable = await queryRunner.hasTable("users");
    if (!hasUsersTable) {
      return;
    }

    const hasOidcSubColumn = await queryRunner.hasColumn("users", "oidc_sub");
    if (!hasOidcSubColumn) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "oidc_sub" character varying UNIQUE
      `);
    }

    const hasOidcSubIndex = await this.indexExists(
      queryRunner,
      "idx_users_oidc_sub",
    );
    if (!hasOidcSubIndex) {
      await queryRunner.query(`
        CREATE INDEX "idx_users_oidc_sub" ON "users" ("oidc_sub")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUsersTable = await queryRunner.hasTable("users");
    if (!hasUsersTable) {
      return;
    }

    const hasOidcSubIndex = await this.indexExists(
      queryRunner,
      "idx_users_oidc_sub",
    );
    if (hasOidcSubIndex) {
      await queryRunner.query(`
        DROP INDEX "idx_users_oidc_sub"
      `);
    }

    const hasOidcSubColumn = await queryRunner.hasColumn("users", "oidc_sub");
    if (hasOidcSubColumn) {
      await queryRunner.query(`
        ALTER TABLE "users"
        DROP COLUMN "oidc_sub"
      `);
    }
  }

  private async indexExists(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT to_regclass('public."${indexName}"') AS index_name`,
    );
    return !!result?.[0]?.index_name;
  }
}
