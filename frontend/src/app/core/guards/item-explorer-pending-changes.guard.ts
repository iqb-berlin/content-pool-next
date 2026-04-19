import { CanDeactivateFn } from '@angular/router';

interface PendingChangesAwareComponent {
  canDeactivate?: () => boolean | Promise<boolean>;
}

export const itemExplorerPendingChangesGuard: CanDeactivateFn<PendingChangesAwareComponent> = (
  component,
) => {
  if (!component?.canDeactivate) {
    return true;
  }
  return component.canDeactivate();
};
