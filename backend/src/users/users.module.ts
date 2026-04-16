import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, AcpUserRole } from '../database/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, AcpUserRole]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule implements OnModuleInit {
  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    await this.usersService.seedInitialAdmin();
  }
}
