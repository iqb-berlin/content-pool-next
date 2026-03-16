import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AcpModule } from './acp/acp.module';
import { FilesModule } from './files/files.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { ViewsModule } from './views/views.module';
import { CommentsModule } from './comments/comments.module';
import { ItemsModule } from './items/items.module';
import { AdminModule } from './admin/admin.module';
import { ValidationModule } from './validation/validation.module';
import { ServerApiModule } from './api/server-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'contentpool'),
        password: configService.get<string>('DB_PASSWORD', 'contentpool_dev'),
        database: configService.get<string>('DB_DATABASE', 'contentpool'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get<string>('NODE_ENV') === 'development',
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
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
  ],
})
export class AppModule {}
