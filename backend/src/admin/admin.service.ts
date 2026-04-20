import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../database/entities';
import { DEFAULT_ACP_INDEX_VERSION } from '../acp/acp-index.utils';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async getSettings(): Promise<AppSettings> {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create({
        theme: {},
        language: 'de',
        defaultAcpIndex: {
          version: DEFAULT_ACP_INDEX_VERSION,
          assessmentParts: [],
        },
      });
      settings = await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    const settings = await this.getSettings();
    if (data.theme !== undefined) settings.theme = data.theme;
    if (data.language !== undefined) settings.language = data.language;
    if (data.logoUrl !== undefined) settings.logoUrl = data.logoUrl;
    if (data.landingPageHtml !== undefined) settings.landingPageHtml = data.landingPageHtml;
    if (data.imprintHtml !== undefined) settings.imprintHtml = data.imprintHtml;
    if (data.privacyHtml !== undefined) settings.privacyHtml = data.privacyHtml;
    if (data.accessibilityHtml !== undefined) settings.accessibilityHtml = data.accessibilityHtml;
    if (data.defaultAcpIndex !== undefined) settings.defaultAcpIndex = data.defaultAcpIndex;
    return this.settingsRepository.save(settings);
  }
}
