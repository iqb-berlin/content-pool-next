import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class RemoveUserPasswordHash1784700000000
  implements MigrationInterface
{
  name = "RemoveUserPasswordHash1784700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("users");
    if (table?.findColumnByName("password_hash")) {
      await queryRunner.dropColumn("users", "password_hash");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("users");
    if (!table || table.findColumnByName("password_hash")) {
      return;
    }

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "password_hash",
        type: "character varying",
        isNullable: false,
        default: "''",
      }),
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT',
    );
  }
}
