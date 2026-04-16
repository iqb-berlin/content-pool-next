export const DEFAULT_THEME: Record<string, string> = {
  '--color-primary': '#1a5276',
  '--color-primary-light': '#2980b9',
  '--color-accent': '#e67e22',
  '--color-success': '#27ae60',
  '--color-danger': '#e74c3c',
  '--color-warning': '#f39c12',
  '--color-bg': '#f5f7fa',
  '--color-surface': '#ffffff',
  '--color-text': '#2c3e50',
  '--color-text-secondary': '#7f8c8d',
  '--color-border': '#dfe6e9',
};

export function normalizeTheme(theme: Record<string, unknown> | null | undefined): Record<string, string> {
  const normalized = { ...DEFAULT_THEME };
  if (!theme || typeof theme !== 'object') {
    return normalized;
  }

  for (const [key, value] of Object.entries(theme)) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_THEME, key) && typeof value === 'string' && value.trim()) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function applyTheme(theme: Record<string, unknown> | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const normalized = normalizeTheme(theme);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(normalized)) {
    root.style.setProperty(key, value);
  }
}

export function applyLanguage(language: string | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = language?.trim() || 'de';
}
