import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import {
  Acp,
  AcpUserRole,
  AcpRole,
  AcpAccessConfig,
  AccessModel,
  AcpCredential,
  AppSettings,
  ItemResponseState,
  User,
} from "../database/entities";
import {
  CreateAcpDto,
  UpdateAcpDto,
  AssignRoleDto,
  UpdateAccessConfigDto,
  CredentialEntryDto,
  UpdateMetadataColumnsDto,
  CredentialResponseDto,
  CreateCredentialDto,
  UpdateCredentialDto,
} from "./dto/acp.dto";
import {
  ACP_INDEX_ALLOWED_STATUS_VALUES,
  DEFAULT_ACP_INDEX_VERSION,
  normalizeIndexForStorage,
  toRuntimeAcpIndex,
} from "./acp-index.utils";
import { normalizeFeatureConfig } from "./feature-config.utils";

const PLAYER_FOCUS_HIGHLIGHT_FEATURE_KEY = "enablePlayerFocusHighlight";

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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Acp[]> {
    return this.acpRepository.find({ order: { name: "ASC" } });
  }

  async findByUser(userId: string): Promise<Acp[]> {
    const roles = await this.acpUserRoleRepository.find({
      where: { userId },
      relations: ["acp"],
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
      throw new ConflictException(
        `Package ID "${dto.packageId}" already exists`,
      );
    }

    // Get default ACP index from settings
    let defaultIndex: Record<string, unknown> = {};
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings?.defaultAcpIndex) {
      defaultIndex = { ...settings.defaultAcpIndex };
    }

    const normalizedIndex = normalizeIndexForStorage({
      ...defaultIndex,
      packageId: dto.packageId,
      version: DEFAULT_ACP_INDEX_VERSION,
      name: [{ lang: "de", value: dto.name }],
      description: dto.description
        ? [{ lang: "de", value: dto.description }]
        : [],
      status: "IN_DEVELOPMENT",
      units: [],
      assessmentParts: [],
    });

    const acp = this.acpRepository.create({
      packageId: dto.packageId,
      name: dto.name,
      description: dto.description,
      acpIndex: normalizedIndex,
    });

    const savedAcp = await this.acpRepository.save(acp);
    await this.createDefaultAccessConfig(savedAcp.id, false);
    return savedAcp;
  }

  async update(id: string, dto: UpdateAcpDto): Promise<Acp> {
    const acp = await this.findById(id);
    if (dto.name !== undefined) acp.name = dto.name;
    if (dto.description !== undefined) acp.description = dto.description;
    return this.acpRepository.save(acp);
  }

  async delete(id: string): Promise<void> {
    const acp = await this.findById(id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ItemResponseState).delete({ acpId: id });
      await manager.getRepository(Acp).remove(acp);
    });
  }

  // ACP-Index management
  async getIndex(id: string): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);
    return toRuntimeAcpIndex(acp.acpIndex);
  }

  async updateIndex(
    id: string,
    index: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);
    acp.acpIndex = this.prepareIndexForSave(acp, index, {});
    const saved = await this.acpRepository.save(acp);
    return toRuntimeAcpIndex(saved.acpIndex);
  }

  async importIndex(
    id: string,
    indexJson: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);

    // Get default settings for required fields
    let defaultIndex: Record<string, unknown> = {};
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings?.defaultAcpIndex) {
      defaultIndex = { ...settings.defaultAcpIndex };
    }

    // Merge: uploaded index takes priority, defaults fill in missing required fields
    acp.acpIndex = this.prepareIndexForSave(acp, indexJson, defaultIndex);
    const saved = await this.acpRepository.save(acp);
    return toRuntimeAcpIndex(saved.acpIndex);
  }

  async deleteIndex(id: string): Promise<Record<string, unknown>> {
    const acp = await this.findById(id);

    // Reset to default ACP index shape from settings + ACP fallback fields.
    let defaultIndex: Record<string, unknown> = {};
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings?.defaultAcpIndex) {
      defaultIndex = { ...settings.defaultAcpIndex };
    }

    acp.acpIndex = this.prepareIndexForSave(acp, {}, defaultIndex);
    const saved = await this.acpRepository.save(acp);
    return toRuntimeAcpIndex(saved.acpIndex);
  }

  // Role management
  async assignRole(acpId: string, dto: AssignRoleDto): Promise<AcpUserRole> {
    await this.findById(acpId);
    const targetUser = await this.userRepository.findOne({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    const targetRole = dto.role as AcpRole;

    const existing = await this.acpUserRoleRepository.findOne({
      where: { userId: dto.userId, acpId },
    });
    if (existing) {
      if (
        existing.role === AcpRole.ACP_MANAGER &&
        targetRole !== AcpRole.ACP_MANAGER
      ) {
        const managerCount = await this.countAcpManagers(acpId);
        if (managerCount <= 1) {
          throw new BadRequestException(
            "At least one ACP_MANAGER must remain assigned",
          );
        }
      }
      existing.role = targetRole;
      return this.acpUserRoleRepository.save(existing);
    }

    const role = this.acpUserRoleRepository.create({
      userId: dto.userId,
      acpId,
      role: targetRole,
    });
    return this.acpUserRoleRepository.save(role);
  }

  async removeRole(acpId: string, userId: string): Promise<void> {
    const role = await this.acpUserRoleRepository.findOne({
      where: { userId, acpId },
    });
    if (role) {
      if (role.role === AcpRole.ACP_MANAGER) {
        const managerCount = await this.countAcpManagers(acpId);
        if (managerCount <= 1) {
          throw new BadRequestException(
            "At least one ACP_MANAGER must remain assigned",
          );
        }
      }
      await this.acpUserRoleRepository.remove(role);
    }
  }

  async getRoles(acpId: string): Promise<AcpUserRole[]> {
    return this.acpUserRoleRepository.find({
      where: { acpId },
      relations: ["user"],
    });
  }

  // Access configuration
  async getAccessConfig(acpId: string): Promise<AcpAccessConfig> {
    await this.findById(acpId);

    const existingConfig = await this.accessConfigRepository.findOne({
      where: { acpId },
      relations: ["credentials"],
    });
    const config = await this.ensureAccessConfig(acpId, existingConfig);

    const normalizedFeatureConfig = normalizeFeatureConfig(
      config.featureConfig || {},
    );
    if (
      JSON.stringify(config.featureConfig || {}) !==
      JSON.stringify(normalizedFeatureConfig)
    ) {
      config.featureConfig = normalizedFeatureConfig;
      return this.accessConfigRepository.save(config);
    }

    return config;
  }

  async updateAccessConfig(
    acpId: string,
    dto: UpdateAccessConfigDto,
  ): Promise<AcpAccessConfig> {
    await this.findById(acpId);

    let config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    const canRetainCredentialValidity =
      config?.accessModel === AccessModel.CREDENTIALS_LIST &&
      dto.accessModel === AccessModel.CREDENTIALS_LIST;
    const existingValidFrom = canRetainCredentialValidity
      ? config?.validFrom
      : undefined;
    const existingValidUntil = canRetainCredentialValidity
      ? config?.validUntil
      : undefined;
    const validFrom = dto.validFrom
      ? new Date(dto.validFrom)
      : existingValidFrom;
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : existingValidUntil;

    // Validate time limit for CREDENTIALS_LIST
    if (dto.accessModel === "CREDENTIALS_LIST") {
      if (!validFrom || !validUntil) {
        throw new BadRequestException(
          "Credential-based access requires validFrom and validUntil",
        );
      }

      if (
        Number.isNaN(validFrom.getTime()) ||
        Number.isNaN(validUntil.getTime())
      ) {
        throw new BadRequestException(
          "validFrom and validUntil must be valid ISO date strings",
        );
      }
      if (validUntil <= validFrom) {
        throw new BadRequestException("validUntil must be after validFrom");
      }

      const maxEnd = new Date(validFrom);
      maxEnd.setMonth(maxEnd.getMonth() + 3);
      if (validUntil > maxEnd) {
        throw new BadRequestException(
          "Credential-based access is limited to 3 months",
        );
      }
    }

    if (config) {
      config.accessModel = dto.accessModel as AccessModel;
      if (dto.allowRegistered !== undefined)
        config.allowRegistered = dto.allowRegistered;
      if (dto.featureConfig)
        config.featureConfig = normalizeFeatureConfig(dto.featureConfig);
      config.validFrom =
        dto.accessModel === "CREDENTIALS_LIST" ? validFrom : null;
      config.validUntil =
        dto.accessModel === "CREDENTIALS_LIST" ? validUntil : null;
    } else {
      config = this.accessConfigRepository.create({
        acpId,
        accessModel: dto.accessModel as AccessModel,
        allowRegistered: dto.allowRegistered || false,
        featureConfig: normalizeFeatureConfig({
          [PLAYER_FOCUS_HIGHLIGHT_FEATURE_KEY]: false,
          ...(dto.featureConfig || {}),
        }),
        validFrom: dto.accessModel === "CREDENTIALS_LIST" ? validFrom : null,
        validUntil: dto.accessModel === "CREDENTIALS_LIST" ? validUntil : null,
      });
    }

    return this.accessConfigRepository.save(config);
  }

  async updateMetadataColumns(
    acpId: string,
    dto: UpdateMetadataColumnsDto,
  ): Promise<AcpAccessConfig> {
    await this.findById(acpId);

    const existingConfig = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    const config = await this.ensureAccessConfig(acpId, existingConfig);

    const currentConfig = config.featureConfig || {};
    const normalizedConfig = normalizeFeatureConfig(currentConfig);
    normalizedConfig.metadataColumns = {
      visible: dto.visibleColumns,
      order: dto.columnOrder || dto.visibleColumns,
    };

    config.featureConfig = normalizedConfig;
    return this.accessConfigRepository.save(config);
  }

  async uploadCredentials(
    acpId: string,
    credentials: CredentialEntryDto[],
    mode: "replace" | "append" | "upsert" = "replace",
  ): Promise<{
    added: number;
    updated: number;
    skipped: number;
    duplicates: string[];
  }> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config || config.accessModel !== AccessModel.CREDENTIALS_LIST) {
      throw new BadRequestException(
        "ACP must be configured for CREDENTIALS_LIST access",
      );
    }

    const duplicates: string[] = [];
    const seenInUpload = new Set<string>();
    const uniqueCredentials = credentials.filter((cred) => {
      if (seenInUpload.has(cred.username)) {
        if (!duplicates.includes(cred.username)) duplicates.push(cred.username);
        return false;
      }
      seenInUpload.add(cred.username);
      return true;
    });
    const existingAppendUsernames =
      mode === "append"
        ? new Set(
            (
              await this.credentialRepository.find({
                where: { accessConfigId: config.id },
                select: ["username"],
              })
            ).map((credential) => credential.username),
          )
        : new Set<string>();
    const credentialsToHash =
      mode === "append"
        ? uniqueCredentials.filter(
            (credential) => !existingAppendUsernames.has(credential.username),
          )
        : uniqueCredentials;
    const passwordHashes = await this.hashCredentials(credentialsToHash);

    return this.credentialRepository.manager.transaction(async (manager) => {
      const credentialRepository = manager.getRepository(AcpCredential);
      const existingCredentials = await credentialRepository.find({
        where: { accessConfigId: config.id },
        order: { id: "ASC" },
      });
      const existingByUsername = new Map<string, AcpCredential>();
      const duplicateCredentials: AcpCredential[] = [];
      for (const credential of existingCredentials) {
        if (existingByUsername.has(credential.username)) {
          duplicateCredentials.push(credential);
        } else {
          existingByUsername.set(credential.username, credential);
        }
      }
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const credentialsToSave: AcpCredential[] = [];

      for (const credential of uniqueCredentials) {
        const existing = existingByUsername.get(credential.username);
        if (existing && mode === "append") {
          skipped += 1;
          continue;
        }

        const passwordHash =
          passwordHashes.get(credential.username) ||
          (await bcrypt.hash(credential.password, 12));

        if (existing) {
          existing.passwordHash = passwordHash;
          credentialsToSave.push(existing);
          updated += 1;
          continue;
        }

        credentialsToSave.push(
          credentialRepository.create({
            accessConfigId: config.id,
            username: credential.username,
            passwordHash,
          }),
        );
        added += 1;
      }

      if (credentialsToSave.length) {
        await credentialRepository.save(credentialsToSave);
      }

      if (mode === "replace") {
        const incomingUsernames = new Set(
          uniqueCredentials.map((credential) => credential.username),
        );
        const removedCredentials = existingCredentials.filter(
          (credential) =>
            duplicateCredentials.includes(credential) ||
            !incomingUsernames.has(credential.username),
        );
        if (removedCredentials.length) {
          await credentialRepository.remove(removedCredentials);
        }
      } else if (duplicateCredentials.length) {
        await credentialRepository.remove(duplicateCredentials);
      }

      return { added, updated, skipped, duplicates };
    });
  }

  private async hashCredentials(
    credentials: CredentialEntryDto[],
  ): Promise<Map<string, string>> {
    const passwordHashes = new Map<string, string>();
    let nextIndex = 0;
    const workerCount = Math.min(4, credentials.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < credentials.length) {
        const credential = credentials[nextIndex];
        nextIndex += 1;
        passwordHashes.set(
          credential.username,
          await bcrypt.hash(credential.password, 12),
        );
      }
    });
    await Promise.all(workers);
    return passwordHashes;
  }

  async getCredentials(acpId: string): Promise<CredentialResponseDto[]> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config) {
      return [];
    }
    const credentials = await this.credentialRepository.find({
      where: { accessConfigId: config.id },
      select: ["id", "username"],
    });
    return credentials.map((c) => ({ id: c.id, username: c.username }));
  }

  async getAssignableUsers(
    acpId: string,
  ): Promise<Pick<User, "id" | "username" | "displayName">[]> {
    await this.findById(acpId);
    return this.userRepository.find({
      where: { isAppAdmin: false },
      select: ["id", "username", "displayName"],
      order: { username: "ASC" },
    });
  }

  async deleteCredential(acpId: string, credentialId: string): Promise<void> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config) {
      throw new NotFoundException("Access configuration not found");
    }
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, accessConfigId: config.id },
    });
    if (!credential) {
      throw new NotFoundException("Credential not found");
    }
    await this.credentialRepository.remove(credential);
  }

  async createCredential(
    acpId: string,
    dto: CreateCredentialDto,
  ): Promise<CredentialResponseDto> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config || config.accessModel !== AccessModel.CREDENTIALS_LIST) {
      throw new BadRequestException(
        "ACP must be configured for CREDENTIALS_LIST access",
      );
    }

    // Check for duplicate username
    const existing = await this.credentialRepository.findOne({
      where: { accessConfigId: config.id, username: dto.username },
    });
    if (existing) {
      throw new ConflictException(`Username "${dto.username}" already exists`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const credential = this.credentialRepository.create({
      accessConfigId: config.id,
      username: dto.username,
      passwordHash,
    });

    const saved = await this.credentialRepository.save(credential);
    return { id: saved.id, username: saved.username };
  }

  async updateCredential(
    acpId: string,
    credentialId: string,
    dto: UpdateCredentialDto,
  ): Promise<CredentialResponseDto> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config || config.accessModel !== AccessModel.CREDENTIALS_LIST) {
      throw new BadRequestException(
        "ACP must be configured for CREDENTIALS_LIST access",
      );
    }

    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, accessConfigId: config.id },
    });
    if (!credential) {
      throw new NotFoundException("Credential not found");
    }

    // Check for duplicate username if changing username
    if (dto.username && dto.username !== credential.username) {
      const existing = await this.credentialRepository.findOne({
        where: { accessConfigId: config.id, username: dto.username },
      });
      if (existing) {
        throw new ConflictException(
          `Username "${dto.username}" already exists`,
        );
      }
      credential.username = dto.username;
    }

    // Update password if provided
    if (dto.password) {
      credential.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const saved = await this.credentialRepository.save(credential);
    return { id: saved.id, username: saved.username };
  }

  private async countAcpManagers(acpId: string): Promise<number> {
    return this.acpUserRoleRepository.count({
      where: { acpId, role: AcpRole.ACP_MANAGER },
    });
  }

  private async ensureAccessConfig(
    acpId: string,
    existingConfig: AcpAccessConfig | null,
  ): Promise<AcpAccessConfig> {
    if (existingConfig) {
      return existingConfig;
    }

    return this.createDefaultAccessConfig(acpId, false);
  }

  private async createDefaultAccessConfig(
    acpId: string,
    enablePlayerFocusHighlight: boolean,
  ): Promise<AcpAccessConfig> {
    const config = this.accessConfigRepository.create({
      acpId,
      accessModel: AccessModel.PRIVATE,
      allowRegistered: false,
      featureConfig: normalizeFeatureConfig({
        [PLAYER_FOCUS_HIGHLIGHT_FEATURE_KEY]: enablePlayerFocusHighlight,
      }),
    });
    return this.accessConfigRepository.save(config);
  }

  private prepareIndexForSave(
    acp: Acp,
    inputIndex: Record<string, unknown>,
    defaultIndex: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      !inputIndex ||
      typeof inputIndex !== "object" ||
      Array.isArray(inputIndex)
    ) {
      throw new BadRequestException("ACP-Index muss ein JSON-Objekt sein.");
    }

    const merged = { ...defaultIndex, ...inputIndex } as Record<
      string,
      unknown
    >;
    const packageId = this.resolvePackageId(acp, merged.packageId);
    const version = this.resolveVersion(merged.version);
    const status = this.resolveStatus(merged.status);
    const name = this.resolveLanguageTextArray(
      merged.name,
      [{ lang: "de", value: acp.name || acp.packageId }],
      "name",
    );
    const description = this.resolveLanguageTextArray(
      merged.description,
      acp.description ? [{ lang: "de", value: acp.description }] : [],
      "description",
      true,
    );

    const sanitizedIndex = {
      ...merged,
      packageId,
      version,
      status,
      name,
      description,
    };

    return normalizeIndexForStorage(sanitizedIndex);
  }

  private resolvePackageId(acp: Acp, rawPackageId: unknown): string {
    if (
      rawPackageId === undefined ||
      rawPackageId === null ||
      rawPackageId === ""
    ) {
      return acp.packageId;
    }

    if (typeof rawPackageId !== "string") {
      throw new BadRequestException(
        'Ungültiges Feld "packageId": Muss ein Text sein.',
      );
    }

    if (rawPackageId !== acp.packageId) {
      throw new BadRequestException(
        `Ungültiges Feld "packageId": Erwartet "${acp.packageId}", erhalten "${rawPackageId}".`,
      );
    }

    return rawPackageId;
  }

  private resolveVersion(rawVersion: unknown): string {
    if (rawVersion === undefined || rawVersion === null || rawVersion === "") {
      return DEFAULT_ACP_INDEX_VERSION;
    }

    if (typeof rawVersion !== "string") {
      throw new BadRequestException(
        'Ungültiges Feld "version": Muss ein Text sein.',
      );
    }

    return rawVersion;
  }

  private resolveStatus(rawStatus: unknown): string {
    if (rawStatus === undefined || rawStatus === null || rawStatus === "") {
      return "IN_DEVELOPMENT";
    }

    if (typeof rawStatus !== "string") {
      throw new BadRequestException(
        'Ungültiges Feld "status": Muss ein Text sein.',
      );
    }

    if (!ACP_INDEX_ALLOWED_STATUS_VALUES.includes(rawStatus as any)) {
      throw new BadRequestException(
        `Ungültiges Feld "status": "${rawStatus}". Erlaubte Werte: ${ACP_INDEX_ALLOWED_STATUS_VALUES.join(", ")}`,
      );
    }

    return rawStatus;
  }

  private resolveLanguageTextArray(
    rawValue: unknown,
    fallback: Array<{ lang: string; value: string }>,
    fieldName: string,
    optional = false,
  ): Array<{ lang: string; value: string }> {
    if (rawValue === undefined || rawValue === null) {
      return optional ? fallback : [...fallback];
    }

    if (!Array.isArray(rawValue)) {
      throw new BadRequestException(
        `Ungültiges Feld "${fieldName}": Muss ein Array sein.`,
      );
    }

    if (rawValue.length === 0) {
      return optional ? [] : [...fallback];
    }

    const parsed = rawValue.map((entry: any, idx) => {
      const lang = entry?.lang;
      const value = entry?.value;

      if (typeof lang !== "string" || !/^[a-z]{2}$/.test(lang)) {
        throw new BadRequestException(
          `Ungültiges Feld "${fieldName}[${idx}].lang": Muss ein ISO-Sprachcode mit 2 Kleinbuchstaben sein.`,
        );
      }
      if (typeof value !== "string" || !value.trim()) {
        throw new BadRequestException(
          `Ungültiges Feld "${fieldName}[${idx}].value": Muss ein nicht-leerer Text sein.`,
        );
      }

      return { lang, value };
    });

    return parsed;
  }
}
