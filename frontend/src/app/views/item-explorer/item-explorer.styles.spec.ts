/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import columnManagerStyles from './components/column-manager-dialog/item-explorer-column-manager-dialog.component.css?raw';
import metadataDrawerStyles from './components/metadata-drawer/item-explorer-metadata-drawer.component.css?raw';
import featureStyles from './item-explorer.component.css?raw';

describe('ItemExplorer shared dialog styles', () => {
  it.each([
    '.drawer-title',
    '.drawer-icon',
    '.column-manager-toolbar',
    '.column-manager-footer',
    '.selection-info',
    '.footer-actions',
  ])('keeps %s in the feature-wide style scope', (selector) => {
    expect(featureStyles).toContain(`app-item-explorer ${selector}`);
  });

  it('does not hide shared primitives behind child emulated encapsulation', () => {
    expect(metadataDrawerStyles).not.toMatch(/^\.drawer-title\s*\{/m);
    expect(metadataDrawerStyles).not.toMatch(/^\.drawer-icon\s*\{/m);
    expect(columnManagerStyles).not.toMatch(/^\.column-manager-toolbar\s*\{/m);
    expect(columnManagerStyles).not.toMatch(/^\.column-manager-footer\s*\{/m);
    expect(columnManagerStyles).not.toMatch(/^\.selection-info\s*\{/m);
    expect(columnManagerStyles).not.toMatch(/^\.footer-actions\s*\{/m);
  });
});
