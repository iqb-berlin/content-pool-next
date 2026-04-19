import { describe, expect, it } from 'vitest';
import { getAcpRoleLabel } from './acp-role-label.util';

describe('getAcpRoleLabel', () => {
  it('returns manager label for ACP_MANAGER role', () => {
    expect(getAcpRoleLabel('ACP_MANAGER', false)).toBe('Manager');
  });

  it('returns guest label for READ_ONLY role', () => {
    expect(getAcpRoleLabel('READ_ONLY', false)).toBe('Gast');
  });

  it('returns app-admin label for users without explicit ACP role', () => {
    expect(getAcpRoleLabel(null, true)).toBe('App-Admin');
  });

  it('returns fallback label when no role is assigned', () => {
    expect(getAcpRoleLabel(undefined, false)).toBe('Zugriff gewährt');
  });
});
