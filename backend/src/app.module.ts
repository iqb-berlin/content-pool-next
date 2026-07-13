import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AcpModule } from "./acp/acp.module";
import { FilesModule } from "./files/files.module";
import { SnapshotsModule } from "./snapshots/snapshots.module";
import { ViewsModule } from "./views/views.module";
import { CommentsModule } from "./comments/comments.module";
import { ItemsModule } from "./items/items.module";
import { AdminModule } from "./admin/admin.module";
import { ValidationModule } from "./validation/validation.module";
import { ServerApiModule } from "./api/server-api.module";
import { HealthModule } from "./health/health.module";
import { ItemExplorerModule } from "./item-explorer/item-explorer.module";
import { createApplicationDataSource } from "./database/database-compatibility";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      dataSourceFactory: createApplicationDataSource,
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>("NODE_ENV", "development");
        const synchronizeDefault = nodeEnv === "development" ? "true" : "false";
        const synchronize =
          configService.get<string>("DB_SYNCHRONIZE", synchronizeDefault) ===
          "true";
        const migrationsRun =
          configService.get<string>("DB_RUN_MIGRATIONS", "false") === "true" &&
          !synchronize;

        return {
          type: "postgres",
          host: configService.get<string>("DB_HOST", "localhost"),
          port: configService.get<number>("DB_PORT", 5432),
          username: configService.get<string>("DB_USERNAME", "contentpool"),
          password: configService.get<string>("DB_PASSWORD", "contentpool_dev"),
          database: configService.get<string>("DB_DATABASE", "contentpool"),
          entities: [__dirname + "/**/*.entity{.ts,.js}"],
          migrations: [__dirname + "/database/migrations/**/*{.ts,.js}"],
          synchronize,
          migrationsRun,
          logging: nodeEnv === "development",
        };
      },
    }),
    AuthModule,
    UsersModule,
    AcpModule,
    FilesModule,
    SnapshotsModule,
    ViewsModule,
    CommentsModule,
    ItemsModule,
    AdminModule,
    ValidationModule,
    ServerApiModule,
    HealthModule,
    ItemExplorerModule,
  ],
})
export class AppModule {}
