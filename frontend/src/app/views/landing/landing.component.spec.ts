import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { LandingComponent } from './landing.component';

function createComponent(options?: {
  settings?: Record<string, unknown>;
  acps?: Record<string, unknown>[];
  auth?: Partial<{
    isAdmin: boolean;
    isLoggedIn: boolean;
    hasAcpRole: (acpId: string, role: string) => boolean;
  }>;
}) {
  const api = {
    getPublicSettings: vi.fn().mockReturnValue(
      of({
        landingPageHtml: '# Willkommen',
        imprintHtml: '## Impressum\n\nAdresse',
        privacyHtml: '**Datenschutz**',
        accessibilityHtml: '<script>alert(1)</script><p>Barrierefrei</p>',
        ...(options?.settings || {}),
      }),
    ),
    getPublicAcps: vi.fn().mockReturnValue(of((options?.acps || []) as any)),
    getAcps: vi.fn().mockReturnValue(of([])),
  };
  const authService = {
    isAdmin: false,
    isLoggedIn: false,
    hasAcpRole: vi.fn(() => false),
    ...(options?.auth || {}),
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  return {
    api,
    component: new LandingComponent(api as any, authService as any, router as any),
  };
}

describe('LandingComponent', () => {
  it('renders markdown and sanitizes legacy html content from public settings', () => {
    const { component } = createComponent();

    component.ngOnInit();

    expect(component.landingHtml).toContain('<h1>Willkommen</h1>');
    expect(component.imprintHtml).toContain('<h2>Impressum</h2>');
    expect(component.privacyHtml).toContain('<strong>Datenschutz</strong>');
    expect(component.accessibilityHtml).toContain('<p>Barrierefrei</p>');
    expect(component.accessibilityHtml).not.toContain('<script>');
  });

  it('opens the requested legal dialog with rendered content', () => {
    const { component } = createComponent();

    component.ngOnInit();
    component.showLegalDialog('privacy');

    expect(component.activeLegalDialog).toBe(true);
    expect(component.activeLegalTitle).toBe('Datenschutz');
    expect(component.activeLegalContent).toContain('<strong>Datenschutz</strong>');
  });

  it('loads only public acps for logged-out visitors', () => {
    const { component, api } = createComponent({ acps: [{ id: 'acp-1', name: 'ACP' }] });

    component.ngOnInit();

    expect(api.getPublicAcps).toHaveBeenCalledTimes(1);
    expect(api.getAcps).not.toHaveBeenCalled();
    expect(component.acps).toEqual([{ id: 'acp-1', name: 'ACP' }]);
  });
});
