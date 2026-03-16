import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../database/entities';

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
        defaultAcpIndex: {},
      });
      settings = await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    let settings = await this.getSettings();
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
