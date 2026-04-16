import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, AcpUserRole, AcpRole } from '../database/entities';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AcpUserRole)
    private readonly acpUserRoleRepository: Repository<AcpUserRole>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      select: ['id', 'username', 'displayName', 'isAppAdmin', 'oidcSub', 'createdAt', 'updatedAt'],
      order: { username: 'ASC' },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'username', 'displayName', 'isAppAdmin', 'oidcSub', 'createdAt', 'updatedAt'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException(`Username "${dto.username}" already exists`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      username: dto.username,
      passwordHash,
      displayName: dto.displayName,
      isAppAdmin: dto.isAppAdmin ?? false,
    });
    const saved = await this.userRepository.save(user);
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    await this.userRepository.save(user);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Ensure at least one ACP manager remains per ACP.
    const managerRoles = await this.acpUserRoleRepository.find({
      where: { userId: id, role: AcpRole.ACP_MANAGER },
    });
    for (const managerRole of managerRoles) {
      const managerCount = await this.acpUserRoleRepository.count({
        where: { acpId: managerRole.acpId, role: AcpRole.ACP_MANAGER },
      });
      if (managerCount <= 1) {
        throw new BadRequestException(
          `Cannot delete user because ACP ${managerRole.acpId} would have no ACP_MANAGER`,
        );
      }
    }

    await this.userRepository.remove(user);
  }

  async setAppAdmin(id: string, isAppAdmin: boolean): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.isAppAdmin = isAppAdmin;
    await this.userRepository.save(user);
    return this.findById(id);
  }

  /**
   * Seeds the initial admin user if no users exist.
   */
  async seedInitialAdmin(): Promise<void> {
    const shouldSeed =
      process.env.SEED_DEFAULT_ADMIN === 'true' || process.env.NODE_ENV !== 'production';
    if (!shouldSeed) {
      return;
    }

    const count = await this.userRepository.count();
    if (count === 0) {
      const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = this.userRepository.create({
        username,
        passwordHash,
        displayName: 'Administrator',
        isAppAdmin: true,
      });
      await this.userRepository.save(admin);
      console.log(`Initial admin user created (username: ${username})`);
    }
  }
}
