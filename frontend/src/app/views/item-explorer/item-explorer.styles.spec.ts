/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import columnManagerStyles from './components/column-manager-dialog/item-explorer-column-manager-dialog.component.css?raw';
import metadataDrawerStyles from './components/metadata-drawer/item-explorer-metadata-drawer.component.css?raw';
import featureStyles from './item-explorer.component.css?raw';
import previewStyles from './components/preview/item-explorer-preview.component.css?raw';
import tableStyles from './components/table/item-explorer-table.component.css?raw';
import headerStyles from './components/header/item-explorer-header.component.css?raw';
import globalStyles from '../../../styles.scss?raw';

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

  it('uses separate table borders so sticky headers keep their stacking order', () => {
    expect(tableStyles).toContain('border-collapse: separate');
    expect(tableStyles).toContain('isolation: isolate');
    expect(tableStyles).toMatch(/\.explorer-table th\.sticky-col\s*\{[^}]*z-index:\s*40/s);
  });

  it('keeps selection and position columns in a non-overlapping sticky chain', () => {
    expect(tableStyles).toMatch(
      /\.explorer-table \.collection-select-col\s*\{[^}]*position:\s*sticky[^}]*left:\s*0[^}]*width:\s*38px/s,
    );
    expect(tableStyles).toMatch(
      /\.explorer-table\.has-collection-selection \.number-col\s*\{[^}]*left:\s*38px/s,
    );
    expect(tableStyles).toMatch(/\.number-col\s*\{[^}]*width:\s*72px/s);
    expect(tableStyles).toMatch(
      /\.explorer-table th\.collection-select-col\s*\{[^}]*z-index:\s*42/s,
    );
  });

  it('uses one opaque selection surface for sticky and scrolling cells', () => {
    expect(tableStyles).toContain('--selected-row-background: color-mix(');
    expect(tableStyles).toMatch(
      /tr\.active \.sticky-col\s*\{[^}]*var\(--selected-row-background\)/s,
    );
    expect(tableStyles).toMatch(/tr\.active td\s*\{[^}]*var\(--selected-row-background\)/s);
    expect(tableStyles).not.toMatch(/tr\.active td\s*\{[^}]*rgba\(/s);
  });

  it.each([
    ['no-preview', '--no-preview-row-background'],
    ['excluded', '--excluded-row-background'],
  ])('uses one opaque status surface for %s rows', (rowClass, backgroundVariable) => {
    expect(tableStyles).toContain(`${backgroundVariable}: color-mix(`);
    expect(tableStyles).toMatch(
      new RegExp(
        `tr\\.${rowClass}:not\\(\\.active\\) td\\s*\\{[^}]*var\\(${backgroundVariable}\\)[^}]*!important`,
        's',
      ),
    );
  });

  it('stacks the table and preview on narrow screens', () => {
    expect(featureStyles).toContain('@media (max-width: 700px)');
    expect(featureStyles).toContain('flex-direction: column');
    expect(featureStyles).toContain('width: 100% !important');
  });

  it('allows preview actions to wrap instead of overflowing', () => {
    expect(previewStyles).toMatch(/\.action-buttons\s*\{[^}]*flex-wrap:\s*wrap/s);
  });

  it('uses WCAG-AA foreground colors for the audited status and player indicators', () => {
    expect(headerStyles).toMatch(/\.status-clean\s*\{[^}]*color:\s*#176b3a/s);
    expect(headerStyles).toMatch(/\.btn-clear-difficulties\s*\{[^}]*color:\s*#c0392b/s);
    expect(featureStyles).toMatch(/\.player-target-badge\.unmapped\s*\{[^}]*color:\s*#7a4a00/s);
  });

  it('styles semantic button states after the outline variant with bold non-color emphasis', () => {
    expect(globalStyles.indexOf(".btn-state[aria-pressed='true']")).toBeGreaterThan(
      globalStyles.indexOf('.btn-outline:hover'),
    );
    expect(globalStyles).toMatch(
      /\.btn-state\[aria-pressed='true'\],[\s\S]*?background:\s*var\(--color-primary\)[\s\S]*?border-color:\s*var\(--color-primary\)[\s\S]*?color:\s*var\(--color-on-primary\)/,
    );
    expect(globalStyles).toMatch(
      /\.btn-state\[aria-expanded='true'\]\s*\{[^}]*font-weight:\s*700/s,
    );
    expect(globalStyles).not.toMatch(/\.btn-state\[aria-expanded='true'\]\s*\{[^}]*outline:/s);
    expect(globalStyles).not.toContain('box-shadow: inset 0 -3px 0 currentColor');
    expect(globalStyles).not.toContain('.btn-state-indicator');
  });
});
