/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import template from './item-explorer.component.html?raw';

describe('ItemExplorer shell template', () => {
  it.each([
    'app-item-explorer-header',
    'app-item-explorer-table',
    'app-item-explorer-preview',
    'app-item-explorer-coding-dialog',
    'app-item-explorer-metadata-drawer',
    'app-item-explorer-upload-dialogs',
    'app-item-explorer-column-manager-dialog',
    'app-item-explorer-response-state-dialogs',
    'app-item-explorer-history-dialog',
    'app-item-explorer-draft-dialogs',
  ])('composes %s exactly once', (selector) => {
    expect(template.match(new RegExp(`<${selector}(?:\\s|/|>)`, 'g'))).toHaveLength(1);
  });

  it('reads shell state through its narrow shell properties', () => {
    expect(template).toContain('isFullscreenActive');
    expect(template).toContain('[items]="breadcrumbs"');
    expect(template).not.toContain('facade.');
  });
});
