import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Acp,
  AcpAccessConfig,
  AccessModel,
  AcpFile,
  AppSettings,
  AcpItemPreference,
} from '../database/entities';
import {
  findUnitInIndex,
  getAssessmentParts,
  getIndexUnits,
  toRuntimeAcpIndex,
} from '../acp/acp-index.utils';
import { normalizeFeatureConfig } from '../acp/feature-config.utils';

export interface ItemPreferencesPayload {
  [key: string]: unknown;
  ui: Record<string, unknown>;
  tags: Record<string, string[]>;
}

interface PreferenceIdentity {
  userId?: string;
  credentialUsername?: string;
}

@Injectable()
export class ViewsService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(AcpItemPreference)
    private readonly itemPreferenceRepository: Repository<AcpItemPreference>,
  ) {}

  /**
   * Get public-facing app settings (no auth required).
   */
  async getPublicSettings(): Promise<any> {
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      return { theme: {}, language: 'de', logoUrl: null, landingPageHtml: null, imprintHtml: null, privacyHtml: null, accessibilityHtml: null };
    }
    return {
      theme: settings.theme,
      language: settings.language,
      logoUrl: settings.logoUrl,
      landingPageHtml: settings.landingPageHtml,
      imprintHtml: settings.imprintHtml,
      privacyHtml: settings.privacyHtml,
      accessibilityHtml: settings.accessibilityHtml,
    };
  }

  /**
   * Get list of publicly accessible ACPs for the landing page.
   */
  async getPublicAcps(): Promise<any[]> {
    const publicConfigs = await this.accessConfigRepository.find({
      where: { accessModel: AccessModel.PUBLIC },
      relations: ['acp'],
    });
    const credentialConfigs = await this.accessConfigRepository.find({
      where: { accessModel: AccessModel.CREDENTIALS_LIST },
      relations: ['acp'],
    });
    const now = new Date();
    const activeCredentialConfigs = credentialConfigs.filter((cfg) => {
      const startsOk = !cfg.validFrom || cfg.validFrom <= now;
      const endsOk = !cfg.validUntil || cfg.validUntil >= now;
      return startsOk && endsOk;
    });

    console.log('[DEBUG] getPublicAcps - PUBLIC configs:', publicConfigs.length);
    console.log('[DEBUG] getPublicAcps - CREDENTIALS_LIST configs:', credentialConfigs.length);
    console.log('[DEBUG] getPublicAcps - active CREDENTIALS_LIST configs:', activeCredentialConfigs.length);
    for (const cfg of activeCredentialConfigs) {
      console.log('[DEBUG] Credential config:', {
        id: cfg.id,
        acpId: cfg.acpId,
        acpName: cfg.acp?.name,
        accessModel: cfg.accessModel,
        validFrom: cfg.validFrom,
        validUntil: cfg.validUntil,
      });
    }

    const results: any[] = [];
    const seenIds = new Set<string>();

    for (const config of publicConfigs) {
      if (config.acp) {
        results.push({
          id: config.acp.id,
          name: config.acp.name,
          description: config.acp.description,
          accessModel: 'PUBLIC',
        });
        seenIds.add(config.acp.id);
      }
    }

    // Include credential-based ACPs (they are listed on landing page too)
    for (const config of activeCredentialConfigs) {
      if (seenIds.has(config.acpId)) continue;
      if (config.acp) {
        results.push({
          id: config.acp.id,
          name: config.acp.name,
          description: config.acp.description,
          accessModel: 'CREDENTIALS_LIST',
          requiresLogin: true,
        });
        seenIds.add(config.acp.id);
      }
    }

    console.log('[DEBUG] getPublicAcps - final results:', results.length);
    return results;
  }

  /**
   * Get ACP start page data.
   */
  async getAcpStartPage(acpId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });

    const featureConfig = normalizeFeatureConfig(config?.featureConfig || {});
    const index = toRuntimeAcpIndex(acp.acpIndex);

    // Extract units from ACP-Index
    const units = getIndexUnits(index).map((u: any) => ({
      id: u.id,
      name: u.name,
      description: u.description,
    }));

    // Sequence model: one sequence equals one booklet module.
    const sequenceMap = new Map<string, any>();
    const parts = getAssessmentParts(index);
    for (const part of parts) {
      const modulesById = new Map<string, any>();
      for (const module of part.bookletModules || []) {
        if (!module?.id || typeof module.id !== 'string') continue;
        modulesById.set(module.id, module);
        if (!sequenceMap.has(module.id)) {
          sequenceMap.set(module.id, {
            id: module.id,
            name: module.name || module.id,
          });
        }
      }

      for (const instrument of part.instruments || []) {
        for (const booklet of instrument.testcenterBooklet || []) {
          for (const moduleRef of booklet.modules || []) {
            const moduleId = this.getModuleReferenceId(moduleRef);
            if (!moduleId) continue;

            const existing = sequenceMap.get(moduleId) || {};
            const module = modulesById.get(moduleId);

            sequenceMap.set(moduleId, {
              id: moduleId,
              name: module?.name || existing.name || moduleId,
              instrumentName: existing.instrumentName || instrument.name,
              bookletDefinitionId:
                existing.bookletDefinitionId ||
                (typeof booklet.definitionId === 'string'
                  ? booklet.definitionId
                  : undefined),
            });
          }
        }
      }
    }
    const sequences = Array.from(sequenceMap.values());

    return {
      id: acp.id,
      name: acp.name,
      description: acp.description,
      featureConfig,
      units,
      sequences,
    };
  }

  /**
   * Get full ACP-Index for read-only/public view routes.
   */
  async getAcpIndex(acpId: string): Promise<Record<string, unknown> | null> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;
    return toRuntimeAcpIndex(acp.acpIndex);
  }

  /**
   * Get unit view data including player reference.
   */
  async getUnitViewData(acpId: string, unitId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const unit = findUnitInIndex(index, unitId);
    if (!unit) return null;

    // Resolve file references
    const dependencies = unit.dependencies || [];
    const fileRefs: any[] = [];
    for (const dep of dependencies) {
      const file = await this.fileRepository.findOne({
        where: { acpId, originalName: dep.id },
      });
      if (file) {
        fileRefs.push({
          type: dep.type,
          originalName: file.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${file.id}/download`,
          fileId: file.id,
        });
      }
    }

    return {
      id: unit.id,
      name: unit.name,
      description: unit.description,
      lang: unit.lang,
      items: unit.items,
      dependencies: fileRefs,
      codingScheme: unit.codingScheme,
      richText: unit.richText,
    };
  }

  /**
   * Get all items across all units in an ACP.
   */
  async getItemList(acpId: string): Promise<any[]> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return [];

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const items: any[] = [];

    for (const unit of getIndexUnits(index)) {
      for (const item of unit.items || []) {
        const itemId = item.useUnitAliasAsPrefix !== false
          ? `${unit.id}_${item.id}`
          : item.id;

        items.push({
          itemId,
          unitId: unit.id,
          unitName: unit.name,
          name: item.name,
          sourceVariable: item.sourceVariable,
        });
      }
    }

    return items;
  }

  /**
   * Get task sequence (ordered list of units from a booklet module).
   */
  async getTaskSequence(acpId: string, sequenceId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const parts = getAssessmentParts(index);

    // Find the module
    for (const part of parts) {
      for (const module of part.bookletModules || []) {
        if (module.id === sequenceId) {
          const unitIds = (module.units || [])
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((u: any) => u.id);

          const units = unitIds.map((uid: string) => {
            const unit = findUnitInIndex(index, uid);
            return unit
              ? { id: unit.id, name: unit.name }
              : { id: uid, name: uid };
          });

          return {
            id: module.id,
            name: module.name,
            units,
          };
        }
      }
    }

    return null;
  }

  async getItemPreferences(
    acpId: string,
    user: any,
    viewId?: string,
  ): Promise<ItemPreferencesPayload> {
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity) {
      return { ui: {}, tags: {} };
    }

    const normalizedViewId = this.normalizeViewId(viewId);
    const record = await this.findPreferenceRecord(acpId, normalizedViewId, identity);
    return this.normalizeItemPreferences(record?.preferences);
  }

  async saveItemPreferences(
    acpId: string,
    user: any,
    preferences: Partial<ItemPreferencesPayload>,
    viewId?: string,
  ): Promise<ItemPreferencesPayload> {
    const normalized = this.normalizeItemPreferences(preferences);
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity) {
      return normalized;
    }

    const normalizedViewId = this.normalizeViewId(viewId);
    let record = await this.findPreferenceRecord(acpId, normalizedViewId, identity);

    if (!record) {
      record = this.itemPreferenceRepository.create({
        acpId,
        viewId: normalizedViewId,
        userId: identity.userId || null,
        credentialUsername: identity.credentialUsername || null,
      });
    }

    record.preferences = normalized;
    await this.itemPreferenceRepository.save(record);
    return normalized;
  }

  private getModuleReferenceId(moduleRef: unknown): string | null {
    if (typeof moduleRef === 'string' && moduleRef.trim().length > 0) {
      return moduleRef.trim();
    }
    if (moduleRef && typeof moduleRef === 'object') {
      const ref = moduleRef as { moduleId?: unknown; id?: unknown };
      if (typeof ref.moduleId === 'string' && ref.moduleId.trim().length > 0) {
        return ref.moduleId.trim();
      }
      if (typeof ref.id === 'string' && ref.id.trim().length > 0) {
        return ref.id.trim();
      }
    }
    return null;
  }

  private normalizeViewId(viewId?: string): string {
    const normalized = (viewId || '').trim();
    return normalized.length > 0 ? normalized.slice(0, 120) : 'item-list';
  }

  private resolvePreferenceIdentity(user: any): PreferenceIdentity | null {
    if (!user || typeof user !== 'object') {
      return null;
    }

    if (user.type === 'credential' && typeof user.username === 'string') {
      const credentialUsername = user.username.trim();
      if (credentialUsername.length > 0) {
        return { credentialUsername };
      }
    }

    if (typeof user.sub === 'string' && user.sub.trim().length > 0) {
      return { userId: user.sub.trim() };
    }

    return null;
  }

  private async findPreferenceRecord(
    acpId: string,
    viewId: string,
    identity: PreferenceIdentity,
  ): Promise<AcpItemPreference | null> {
    if (identity.userId) {
      return this.itemPreferenceRepository.findOne({
        where: {
          acpId,
          viewId,
          userId: identity.userId,
        },
      });
    }

    if (identity.credentialUsername) {
      return this.itemPreferenceRepository.findOne({
        where: {
          acpId,
          viewId,
          credentialUsername: identity.credentialUsername,
        },
      });
    }

    return null;
  }

  private normalizeItemPreferences(raw: unknown): ItemPreferencesPayload {
    const payload = this.isRecord(raw) ? raw : {};
    const ui = this.isRecord(payload.ui) ? payload.ui : {};
    return {
      ui,
      tags: this.normalizeTags(payload.tags),
    };
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isRecord(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};

    for (const [itemKey, values] of Object.entries(rawTags)) {
      const normalizedItemKey = String(itemKey || '').trim();
      if (!normalizedItemKey) {
        continue;
      }

      if (!Array.isArray(values)) {
        continue;
      }

      const normalizedValues = Array.from(new Set(
        values
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ));

      if (normalizedValues.length) {
        tags[normalizedItemKey] = normalizedValues;
      }
    }

    return tags;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
