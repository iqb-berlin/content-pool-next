import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOidcSubToUser1742650000000 implements MigrationInterface {
  name = 'AddOidcSubToUser1742650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "oidc_sub" character varying UNIQUE
    `);
    
    await queryRunner.query(`
      CREATE INDEX "idx_users_oidc_sub" ON "users" ("oidc_sub")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "idx_users_oidc_sub"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "oidc_sub"
    `);
  }
}
