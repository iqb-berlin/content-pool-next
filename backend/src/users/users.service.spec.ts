import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { User } from '../database/entities';

describe('UsersService', () => {
  let service: UsersService;
  let repo: any;

  const mockUser = {
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
    isAppAdmin: false,
    passwordHash: 'hashed',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation(dto => ({ ...dto, id: 'new-id' })),
      save: jest.fn().mockImplementation(entity => Promise.resolve({ ...entity, id: entity.id || 'new-id' })),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      repo.find.mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { username: 'ASC' } }));
    });
  });

  describe('findById', () => {
    it('should return user by id', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-1');
      expect(result.username).toBe('john');
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValue({ ...mockUser, id: 'new-id' }); // findById after save
      const result = await service.create({ username: 'jane', password: 'pass1234' });
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate username', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      await expect(service.create({ username: 'john', password: 'pass1234' })).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should delete existing user', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      await service.delete('user-1');
      expect(repo.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw NotFoundException for unknown user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.delete('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setAppAdmin', () => {
    it('should toggle admin status', async () => {
      repo.findOne.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue({ ...mockUser, isAppAdmin: true });
      // Need to mock findById call too
      repo.findOne
        .mockResolvedValueOnce({ ...mockUser }) // first findOne in setAppAdmin
        .mockResolvedValue({ ...mockUser, isAppAdmin: true }); // findById after save
      const result = await service.setAppAdmin('user-1', true);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('seedInitialAdmin', () => {
    it('should create admin user when no users exist', async () => {
      repo.count.mockResolvedValue(0);
      await service.seedInitialAdmin();
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        username: 'admin',
        isAppAdmin: true,
      }));
      expect(repo.save).toHaveBeenCalled();
    });

    it('should skip when users already exist', async () => {
      repo.count.mockResolvedValue(5);
      await service.seedInitialAdmin();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
