import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment, CommentTargetType, AcpAccessConfig } from '../database/entities';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
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
   * Export comments as a structured data array (for JSON fallback).
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

  async exportCommentsByCredential(acpId: string, username: string): Promise<any[]> {
    const comments = await this.findByCredential(acpId, username);
    return comments.map((c) => ({
      targetType: c.targetType,
      targetId: c.targetId,
      comment: c.commentText,
      author: c.credentialUsername || c.user?.displayName || c.user?.username || 'Unknown',
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /**
   * Export comments as XLSX buffer using exceljs.
   */
  async exportCommentsXlsx(acpId: string, userId?: string): Promise<Buffer> {
    const data = await this.exportComments(acpId, userId);
    return this.buildXlsxBuffer(data);
  }

  async exportCommentsXlsxByCredential(acpId: string, username: string): Promise<Buffer> {
    const data = await this.exportCommentsByCredential(acpId, username);
    return this.buildXlsxBuffer(data);
  }

  private async buildXlsxBuffer(data: any[]): Promise<Buffer> {
    // Dynamic import to avoid startup cost.
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IQB ContentPool';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Kommentare');

    // Headers
    sheet.columns = [
      { header: 'Zieltyp', key: 'targetType', width: 18 },
      { header: 'Ziel-ID', key: 'targetId', width: 25 },
      { header: 'Kommentar', key: 'comment', width: 50 },
      { header: 'Autor', key: 'author', width: 20 },
      { header: 'Erstellt', key: 'createdAt', width: 22 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A5276' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    for (const row of data) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async isCommentingEnabled(acpId: string, targetType: CommentTargetType): Promise<boolean> {
    const config = await this.accessConfigRepository.findOne({ where: { acpId } });
    const featureConfig = (config?.featureConfig || {}) as Record<string, unknown>;

    if (!featureConfig.enableCommenting) {
      return false;
    }

    const targets = Array.isArray(featureConfig.commentTargets)
      ? (featureConfig.commentTargets as string[])
      : [];

    if (targets.length === 0) {
      return true;
    }

    return targets.includes(targetType);
  }
}
