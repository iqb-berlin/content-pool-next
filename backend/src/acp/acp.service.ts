import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Acp,
  AcpUserRole,
  AcpRole,
  AcpAccessConfig,
  AccessModel,
  AcpCredential,
  AppSettings,
} from '../database/entities';
import {
  CreateAcpDto,
  UpdateAcpDto,
  AssignRoleDto,
  UpdateAccessConfigDto,
  CredentialEntryDto,
  UpdateMetadataColumnsDto,
  UpdateItemFocusSettingsDto,
} from './dto/acp.dto';

@Injectable()
export class AcpService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpUserRole)
    private readonly acpUserRoleRepository: Repository<AcpUserRole>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    @InjectRepository(AcpCredential)
    private readonly credentialRepository: Repository<AcpCredential>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async findAll(): Promise<Acp[]> {
    return this.acpRepository.find({ order: { name: 'ASC' } });
  }

  async findByUser(userId: string): Promise<Acp[]> {
    const roles = await this.acpUserRoleRepository.find({
      where: { userId },
      relations: ['acp'],
    });
    return roles.map((r) => r.acp);
  }

  async findById(id: string): Promise<Acp> {
    const acp = await this.acpRepository.findOne({ where: { id } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${id} not found`);
    }
    return acp;
  }

  async create(dto: CreateAcpDto): Promise<Acp> {
    const existing = await this.acpRepository.findOne({
      where: { packageId: dto.packageId },
    });
    if (existing) {
      throw new ConflictException(`Package ID "${dto.packageId}" already exists`);
    }

    // Get default ACP index from settings
    let defaultIndex: Record<string, unknown> = {};
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings?.defaultAcpIndex) {
      defaultIndex = { ...settings.defaultAcpIndex };
    }

    const acp = this.acpRepository.create({
      packageId: dto.packageId,
      name: dto.name,
      description: dto.description,
      acpIndex: {
        ...defaultIndex,
        packageId: dto.packageId,
        version: '0.1.0',
        name: [{ lang: 'de', value: dto.name }],
        description: dto.description
          ? [{ lang: 'de', value: dto.description }]
          : [],
        status: 'IN_DEVELOPMENT',
        units: [],
        assessmentParts: [],
      },
    });

    return this.acpRepository.save(acp);
  }

  async update(id: string, dto: UpdateAcpDto): Promise<Acp> {
    const acp = await this.findById(id);
    if (dto.name !== undefined) acp.name = dto.name;
    if (dto.description !== undefined) acp.description = dto.description;
    return this.acpRepository.save(acp);
  }

  async delete(id: string): Promise<void> {
    const acp = await this.findById(id);
    await this.acpRepository.remove(acp);
  }

  // ACP-Index management
  async getIndex(id: string): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);
    return acp.acpIndex;
  }

  async updateIndex(id: string, index: Record<string, unknown>): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);
    acp.acpIndex = index;
    const saved = await this.acpRepository.save(acp);
    return saved.acpIndex;
  }

  async importIndex(id: string, indexJson: Record<string, unknown>): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);

    // Get default settings for required fields
    let defaultIndex: Record<string, unknown> = {};
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings?.defaultAcpIndex) {
      defaultIndex = { ...settings.defaultAcpIndex };
    }

    // Merge: uploaded index takes priority, defaults fill in missing required fields
    acp.acpIndex = { ...defaultIndex, ...indexJson };
    const saved = await this.acpRepository.save(acp);
    return saved.acpIndex;
  }

  // Role management
  async assignRole(acpId: string, dto: AssignRoleDto): Promise<AcpUserRole> {
    await this.findById(acpId);

    const existing = await this.acpUserRoleRepository.findOne({
      where: { userId: dto.userId, acpId },
    });
    if (existing) {
      existing.role = dto.role as AcpRole;
      return this.acpUserRoleRepository.save(existing);
    }

    const role = this.acpUserRoleRepository.create({
      userId: dto.userId,
      acpId,
      role: dto.role as AcpRole,
    });
    return this.acpUserRoleRepository.save(role);
  }

  async removeRole(acpId: string, userId: string): Promise<void> {
    const role = await this.acpUserRoleRepository.findOne({
      where: { userId, acpId },
    });
    if (role) {
      await this.acpUserRoleRepository.remove(role);
    }
  }

  async getRoles(acpId: string): Promise<AcpUserRole[]> {
    return this.acpUserRoleRepository.find({
      where: { acpId },
      relations: ['user'],
    });
  }

  // Access configuration
  async getAccessConfig(acpId: string): Promise<AcpAccessConfig | null> {
    return this.accessConfigRepository.findOne({
      where: { acpId },
      relations: ['credentials'],
    });
  }

  async updateAccessConfig(acpId: string, dto: UpdateAccessConfigDto): Promise<AcpAccessConfig> {
    await this.findById(acpId);

    // Validate time limit for CREDENTIALS_LIST
    if (dto.accessModel === 'CREDENTIALS_LIST' && dto.validUntil) {
      const validUntil = new Date(dto.validUntil);
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + 3);
      if (validUntil > maxDate) {
        throw new BadRequestException('Credential-based access is limited to 3 months');
      }
    }

    let config = await this.accessConfigRepository.findOne({ where: { acpId } });
    if (config) {
      config.accessModel = dto.accessModel as AccessModel;
      if (dto.allowRegistered !== undefined) config.allowRegistered = dto.allowRegistered;
      if (dto.featureConfig) config.featureConfig = dto.featureConfig;
      if (dto.validFrom) config.validFrom = new Date(dto.validFrom);
      if (dto.validUntil) config.validUntil = new Date(dto.validUntil);
    } else {
      config = this.accessConfigRepository.create({
        acpId,
        accessModel: dto.accessModel as AccessModel,
        allowRegistered: dto.allowRegistered || false,
        featureConfig: dto.featureConfig || {},
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      });
    }

    return this.accessConfigRepository.save(config);
  }

  async updateMetadataColumns(acpId: string, dto: UpdateMetadataColumnsDto): Promise<AcpAccessConfig> {
    const config = await this.accessConfigRepository.findOne({ where: { acpId } });
    if (!config) {
      throw new NotFoundException('Access configuration not found');
    }

    const currentConfig = config.featureConfig || {};

    currentConfig.metadataColumns = {
      visible: dto.visibleColumns,
      order: dto.columnOrder || dto.visibleColumns
    };

    config.featureConfig = currentConfig;
    return this.accessConfigRepository.save(config);
  }

  async updateItemFocusSettings(acpId: string, dto: UpdateItemFocusSettingsDto): Promise<AcpAccessConfig> {
    const config = await this.accessConfigRepository.findOne({ where: { acpId } });
    if (!config) {
      throw new NotFoundException('Access configuration not found');
    }

    const currentConfig = config.featureConfig || {};

    if (dto.unitId && dto.variableId) {
      // Per-item override
      const byItem = (currentConfig.itemFocusSettingsByItem as Record<string, unknown>) || {};
      const key = `${dto.unitId}__${dto.variableId}`;
      byItem[key] = dto.settings;
      currentConfig.itemFocusSettingsByItem = byItem;
    } else if (dto.unitId) {
      // Per-unit override
      const byUnit = (currentConfig.itemFocusSettingsByUnit as Record<string, unknown>) || {};
      byUnit[dto.unitId] = dto.settings;
      currentConfig.itemFocusSettingsByUnit = byUnit;
    } else {
      // Global default
      currentConfig.itemFocusSettings = dto.settings;
    }

    config.featureConfig = currentConfig;
    return this.accessConfigRepository.save(config);
  }

  async uploadCredentials(acpId: string, credentials: CredentialEntryDto[]): Promise<number> {
    const config = await this.accessConfigRepository.findOne({ where: { acpId } });
    if (!config || config.accessModel !== AccessModel.CREDENTIALS_LIST) {
      throw new BadRequestException('ACP must be configured for CREDENTIALS_LIST access');
    }

    // Delete existing credentials
    await this.credentialRepository.delete({ accessConfigId: config.id });

    // Create new credentials
    const entities = await Promise.all(
      credentials.map(async (cred) => {
        const passwordHash = await bcrypt.hash(cred.password, 12);
        return this.credentialRepository.create({
          accessConfigId: config.id,
          username: cred.username,
          passwordHash,
        });
      }),
    );

    await this.credentialRepository.save(entities);
    return entities.length;
  }
}
