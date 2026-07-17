import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemExplorerLoadDiagnostics } from './item-explorer-load-diagnostics.service';

const itemListMeasure = 'item-explorer:item-list';
const responseStateMeasure = 'item-explorer:response-state';

describe('ItemExplorerLoadDiagnostics', () => {
  beforeEach(() => {
    localStorage.clear();
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    localStorage.clear();
    performance.clearMarks();
    performance.clearMeasures();
    vi.restoreAllMocks();
  });

  it('keeps only the latest measure per phase when diagnostics are disabled', () => {
    const diagnostics = new ItemExplorerLoadDiagnostics();

    for (let index = 0; index < 5; index += 1) {
      diagnostics.finish(diagnostics.start('item-list'));
    }
    diagnostics.finish(diagnostics.start('response-state'));

    expect(performance.getEntriesByName(itemListMeasure, 'measure')).toHaveLength(1);
    expect(performance.getEntriesByName(responseStateMeasure, 'measure')).toHaveLength(1);
  });

  it('keeps diagnostic measures bounded per phase', () => {
    localStorage.setItem('cp.itemExplorer.performance', '1');
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const diagnostics = new ItemExplorerLoadDiagnostics();

    for (let index = 0; index < 105; index += 1) {
      diagnostics.finish(diagnostics.start('item-list'));
    }

    const measures = performance.getEntriesByName(itemListMeasure, 'measure');
    expect(measures).toHaveLength(100);
  });
});
