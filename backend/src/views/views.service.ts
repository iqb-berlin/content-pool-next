import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acp, AcpAccessConfig, AccessModel, AcpFile, AppSettings } from '../database/entities';

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

    console.log('[DEBUG] getPublicAcps - PUBLIC configs:', publicConfigs.length);
    console.log('[DEBUG] getPublicAcps - CREDENTIALS_LIST configs:', credentialConfigs.length);
    for (const cfg of credentialConfigs) {
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
    for (const config of credentialConfigs) {
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

    const featureConfig = (config?.featureConfig || {}) as Record<string, unknown>;
    const index = acp.acpIndex as any;

    // Extract units from ACP-Index
    const units = (index.units || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      description: u.description,
    }));

    // Extract task sequences from booklet modules
    const sequences: any[] = [];
    const parts = index.assessmentParts || [];
    for (const part of parts) {
      for (const instrument of part.instruments || []) {
        for (const booklet of instrument.testcenterBooklet || []) {
          sequences.push({
            id: booklet.definitionId,
            instrumentName: instrument.name,
            modules: booklet.modules,
          });
        }
      }
    }

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
   * Get unit view data including player reference.
   */
  async getUnitViewData(acpId: string, unitId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const index = acp.acpIndex as any;
    const unit = (index.units || []).find((u: any) => u.id === unitId);
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

    const index = acp.acpIndex as any;
    const items: any[] = [];

    for (const unit of index.units || []) {
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

    const index = acp.acpIndex as any;
    const parts = index.assessmentParts || [];

    // Find the module
    for (const part of parts) {
      for (const module of part.bookletModules || []) {
        if (module.id === sequenceId) {
          const unitIds = (module.units || [])
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((u: any) => u.id);

          const units = unitIds.map((uid: string) => {
            const unit = (index.units || []).find((u: any) => u.id === uid);
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
}
