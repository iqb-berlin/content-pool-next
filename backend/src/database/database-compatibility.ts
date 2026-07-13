import { DataSource, DataSourceOptions } from "typeorm";
import { AddItemResponseStateRowKey1783900000000 } from "./migrations/1783900000000-AddItemResponseStateRowKey";

/**
 * Prepare schemas that were previously maintained through TypeORM synchronize.
 *
 * Migrations remain the source of truth for deployed environments. Development
 * databases may not have a migration history, though, so changes that require
 * data backfills must run before synchronize attempts to enforce the final
 * entity constraints.
 */
export async function prepareSchemaForSynchronization(
  dataSource: DataSource,
): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    if (await queryRunner.hasTable("item_response_states")) {
      await new AddItemResponseStateRowKey1783900000000().up(queryRunner);
    }
  } finally {
    await queryRunner.release();
  }
}

/**
 * Initialize TypeORM in a deterministic order: migrations first, compatibility
 * backfills second, and schema synchronization last.
 */
export async function createApplicationDataSource(
  options?: DataSourceOptions,
): Promise<DataSource> {
  if (!options) {
    throw new Error("TypeORM data source options are required");
  }

  const shouldRunMigrations = options.migrationsRun === true;
  const shouldSynchronize = options.synchronize === true;
  const dataSource = new DataSource({
    ...options,
    migrationsRun: false,
    synchronize: false,
  });

  await dataSource.initialize();
  try {
    if (shouldRunMigrations) {
      await dataSource.runMigrations();
    }
    if (shouldSynchronize) {
      await prepareSchemaForSynchronization(dataSource);
      await dataSource.synchronize();
    }
    return dataSource;
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}
