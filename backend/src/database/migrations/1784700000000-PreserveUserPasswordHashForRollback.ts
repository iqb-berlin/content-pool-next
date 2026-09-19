import { MigrationInterface, QueryRunner } from "typeorm";

export class PreserveUserPasswordHashForRollback1784700000000 implements MigrationInterface {
  name = "PreserveUserPasswordHashForRollback1784700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("users");
    if (table?.findColumnByName("password_hash")) {
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "password_hash" SET DEFAULT ''`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("users");
    if (table?.findColumnByName("password_hash")) {
      await queryRunner.query(
        'ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT',
      );
    }
  }
}
