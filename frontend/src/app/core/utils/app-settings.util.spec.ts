import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, applyLanguage, applyTheme, normalizeTheme } from './app-settings.util';

describe('app-settings util', () => {
  it('normalizeTheme should merge defaults with known custom values', () => {
    const result = normalizeTheme({
      '--color-primary': '#000000',
      '--unknown': '#ffffff',
      '--color-text': '',
    });

    expect(result['--color-primary']).toBe('#000000');
    expect(result['--color-on-primary']).toBe('#ffffff');
    expect(result['--color-text']).toBe(DEFAULT_THEME['--color-text']);
    expect(result['--color-border']).toBe(DEFAULT_THEME['--color-border']);
    expect((result as Record<string, string>)['--unknown']).toBeUndefined();
  });

  it('derives accessible foreground, link and secondary colors for a light theme', () => {
    const result = normalizeTheme({
      '--color-primary': '#a8cee6',
      '--color-primary-light': '#a8cee6',
      '--color-text-secondary': '#7f8c8d',
    });

    expect(result['--color-on-primary']).toBe('#000000');
    expect(result['--color-link']).toBe(DEFAULT_THEME['--color-primary']);
    expect(result['--color-text-secondary']).toBe(DEFAULT_THEME['--color-text-secondary']);
    expect(result['--color-danger-text']).toBe('#a93226');
  });

  it('applyTheme should set css variables on document root', () => {
    applyTheme({ '--color-primary': '#123456' });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-primary')).toBe('#123456');
    expect(root.style.getPropertyValue('--color-bg')).toBe(DEFAULT_THEME['--color-bg']);
  });

  it('applyLanguage should update html lang attribute', () => {
    applyLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    applyLanguage('');
    expect(document.documentElement.lang).toBe('de');
  });
});
