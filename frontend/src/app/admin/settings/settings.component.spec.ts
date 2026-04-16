import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { AppSettings } from '../../core/models/api.models';

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 'settings-1',
    theme: { '--color-primary': '#1a5276' },
    language: 'de',
    logoUrl: 'https://example.org/logo.svg',
    landingPageHtml: '<p>Start</p>',
    imprintHtml: '<p>Impressum</p>',
    privacyHtml: '<p>Datenschutz</p>',
    accessibilityHtml: '<p>Barrierefreiheit</p>',
    defaultAcpIndex: { quality: 'baseline' },
    ...overrides,
  };
}

describe('SettingsComponent', () => {
  let api: {
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads settings and initializes JSON/theme on init', () => {
    api.getSettings.mockReturnValue(of(createSettings()));

    const component = new SettingsComponent(api as any);
    component.ngOnInit();

    expect(component.settings?.language).toBe('de');
    expect(component.theme['--color-primary']).toBe('#1a5276');
    expect(component.defaultAcpIndexJson).toContain('"quality": "baseline"');
  });

  it('shows parse error for invalid default index JSON', () => {
    const settings = createSettings();
    api.getSettings.mockReturnValue(of(settings));
    api.updateSettings.mockReturnValue(of(settings));

    const component = new SettingsComponent(api as any);
    component.ngOnInit();
    component.defaultAcpIndexJson = '{invalid json';
    component.save();

    expect(component.error).toContain('gültiges JSON-Objekt');
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('saves settings with theme and default ACP index', () => {
    const settings = createSettings();
    api.getSettings.mockReturnValue(of(settings));
    api.updateSettings.mockReturnValue(of(createSettings({ language: 'en' })));

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const component = new SettingsComponent(api as any);
    component.ngOnInit();

    component.theme['--color-primary'] = '#123456';
    component.defaultAcpIndexJson = JSON.stringify({ custom: true });
    component.settings!.language = 'en';
    component.save();

    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en',
        theme: expect.objectContaining({ '--color-primary': '#123456' }),
        defaultAcpIndex: { custom: true },
      })
    );
    expect(dispatchSpy).toHaveBeenCalled();
    expect(component.saved).toBe(true);
  });

  it('shows load error if API fails', () => {
    api.getSettings.mockReturnValue(throwError(() => ({ error: { message: 'kaputt' } })));

    const component = new SettingsComponent(api as any);
    component.ngOnInit();

    expect(component.error).toBe('kaputt');
  });
});
