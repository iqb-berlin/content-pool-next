import { describe, it, expect, vi } from 'vitest';
import { itemExplorerPendingChangesGuard } from './item-explorer-pending-changes.guard';

describe('itemExplorerPendingChangesGuard', () => {
  it('returns true when component does not expose canDeactivate', async () => {
    const result = itemExplorerPendingChangesGuard({} as any, {} as any, {} as any, {} as any);
    await expect(Promise.resolve(result)).resolves.toBe(true);
  });

  it('delegates to component canDeactivate and returns its value', async () => {
    const canDeactivate = vi.fn().mockResolvedValue(false);
    const component = { canDeactivate };
    const result = itemExplorerPendingChangesGuard(
      component as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(Promise.resolve(result)).resolves.toBe(false);
    expect(canDeactivate).toHaveBeenCalledTimes(1);
  });
});
