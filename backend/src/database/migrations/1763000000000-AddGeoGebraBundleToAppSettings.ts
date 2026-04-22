import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGeoGebraBundleToAppSettings1763000000000 implements MigrationInterface {
  name = "AddGeoGebraBundleToAppSettings1763000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSettingsTable = await queryRunner.hasTable("app_settings");
    if (!hasSettingsTable) {
      return;
    }

    const hasGeoGebraColumn = await queryRunner.hasColumn(
      "app_settings",
      "geogebra_bundle",
    );
    if (hasGeoGebraColumn) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "app_settings"
      ADD COLUMN "geogebra_bundle" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasSettingsTable = await queryRunner.hasTable("app_settings");
    if (!hasSettingsTable) {
      return;
    }

    const hasGeoGebraColumn = await queryRunner.hasColumn(
      "app_settings",
      "geogebra_bundle",
    );
    if (!hasGeoGebraColumn) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "app_settings"
      DROP COLUMN "geogebra_bundle"
    `);
  }
}
