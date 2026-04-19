export type AcpManagerRole = 'ACP_MANAGER' | 'READ_ONLY' | null | undefined;

export function getAcpRoleLabel(role: AcpManagerRole, isAppAdmin = false): string {
  if (role === 'ACP_MANAGER') return 'Manager';
  if (role === 'READ_ONLY') return 'Gast';
  if (isAppAdmin) return 'App-Admin';
  return 'Zugriff gewährt';
}
