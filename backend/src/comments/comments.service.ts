import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment, CommentTargetType } from '../database/entities';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
  ) {}

  async findByAcp(acpId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUser(acpId: string, userId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByCredential(acpId: string, username: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId, credentialUsername: username },
      order: { createdAt: 'DESC' },
    });
  }

  async create(data: {
    acpId: string;
    userId?: string;
    credentialUsername?: string;
    targetType: CommentTargetType;
    targetId: string;
    commentText: string;
  }): Promise<Comment> {
    const comment = this.commentRepository.create(data);
    return this.commentRepository.save(comment);
  }

  async delete(id: string): Promise<void> {
    const comment = await this.commentRepository.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    await this.commentRepository.remove(comment);
  }

  async deleteByAcp(acpId: string): Promise<number> {
    const result = await this.commentRepository.delete({ acpId });
    return result.affected || 0;
  }

  /**
   * Export comments as a structured data array (for XLSX generation).
   */
  async exportComments(acpId: string, userId?: string): Promise<any[]> {
    let comments: Comment[];
    if (userId) {
      comments = await this.findByUser(acpId, userId);
    } else {
      comments = await this.findByAcp(acpId);
    }

    return comments.map((c) => ({
      targetType: c.targetType,
      targetId: c.targetId,
      comment: c.commentText,
      author: c.user?.displayName || c.user?.username || c.credentialUsername || 'Unknown',
      createdAt: c.createdAt.toISOString(),
    }));
  }
}
