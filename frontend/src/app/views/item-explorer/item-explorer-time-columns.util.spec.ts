import { describe, expect, it } from 'vitest';
import {
  normalizeItemExplorerColumnFilters,
  normalizeItemExplorerColumnList,
  normalizeItemExplorerColumnRecord,
  normalizeItemExplorerMetadataColumnId,
  normalizeItemExplorerTableColumnKey,
} from './item-explorer-time-columns.util';

describe('item explorer time column normalization', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'preserves metadata ID %s and its saved settings',
    (id) => {
      expect(normalizeItemExplorerMetadataColumnId(id)).toBe(id);
      expect(normalizeItemExplorerTableColumnKey(`metadata:${id}`)).toBe(`metadata:${id}`);
      expect(normalizeItemExplorerColumnList([id])).toEqual([id]);
      const widths = normalizeItemExplorerColumnRecord({ [id]: 180 });
      expect(Object.entries(widths)).toEqual([[id, 180]]);
      const filters = normalizeItemExplorerColumnFilters({ [id]: 'example' });
      expect(Object.entries(filters)).toEqual([[id, 'example']]);
    },
  );

  it('maps the known VOMD time metadata IDs', () => {
    expect(normalizeItemExplorerMetadataColumnId('iqb_time_item')).toBe('itemTimeSeconds');
    expect(normalizeItemExplorerMetadataColumnId('iqb_item_time')).toBe('itemTimeSeconds');
    expect(normalizeItemExplorerMetadataColumnId('iqb_time_stimulus')).toBe('stimulusTimeSeconds');
    expect(normalizeItemExplorerMetadataColumnId('difficulty')).toBe('difficulty');
  });

  it('maps metadata table keys without changing system or personal keys', () => {
    expect(normalizeItemExplorerTableColumnKey('metadata:iqb_time_item')).toBe(
      'metadata:itemTimeSeconds',
    );
    expect(normalizeItemExplorerTableColumnKey('metadata:iqb_time_stimulus')).toBe(
      'metadata:stimulusTimeSeconds',
    );
    expect(normalizeItemExplorerTableColumnKey('system:itemId')).toBe('system:itemId');
    expect(normalizeItemExplorerTableColumnKey('personal:note')).toBe('personal:note');
  });

  it('deduplicates normalized lists while retaining the first position', () => {
    expect(
      normalizeItemExplorerColumnList([
        'subject',
        'iqb_time_item',
        'difficulty',
        'itemTimeSeconds',
      ]),
    ).toEqual(['subject', 'itemTimeSeconds', 'difficulty']);
  });

  it('lets canonical record entries win independently of property order', () => {
    expect(normalizeItemExplorerColumnRecord({ itemTimeSeconds: 220, iqb_time_item: 180 })).toEqual(
      { itemTimeSeconds: 220 },
    );
    expect(normalizeItemExplorerColumnRecord({ iqb_time_item: 180, itemTimeSeconds: 220 })).toEqual(
      { itemTimeSeconds: 220 },
    );
    expect(normalizeItemExplorerColumnRecord({ iqb_time_item: 180 })).toEqual({
      itemTimeSeconds: 180,
    });
  });

  it('normalizes legacy duration filters and preserves canonical precedence', () => {
    expect(
      normalizeItemExplorerColumnFilters({
        iqb_time_item: '00:30',
        iqb_time_stimulus: '1:02:03',
      }),
    ).toEqual({ itemTimeSeconds: '30', stimulusTimeSeconds: '3723' });
    expect(
      normalizeItemExplorerColumnFilters({ iqb_time_item: '00:30', itemTimeSeconds: '' }),
    ).toEqual({ itemTimeSeconds: '' });
  });

  it('drops ambiguous alias filters and leaves unrelated filters unchanged', () => {
    expect(
      normalizeItemExplorerColumnFilters({
        iqb_time_item: 'minute',
        iqb_item_time: '30',
        iqb_time_stimulus: '>= 30',
        unitLabel: 'Lesen',
      }),
    ).toEqual({ unitLabel: 'Lesen' });
    expect(normalizeItemExplorerColumnFilters({ iqb_time_item: '00:90' })).toEqual({});
  });

  it('is idempotent for already normalized values', () => {
    const list = ['itemTimeSeconds', 'stimulusTimeSeconds'];
    const record = { itemTimeSeconds: 180, stimulusTimeSeconds: 200 };
    const filters = { itemTimeSeconds: '30..60', stimulusTimeSeconds: '>= 90' };
    expect(normalizeItemExplorerColumnList(normalizeItemExplorerColumnList(list))).toEqual(list);
    expect(normalizeItemExplorerColumnRecord(normalizeItemExplorerColumnRecord(record))).toEqual(
      record,
    );
    expect(normalizeItemExplorerColumnFilters(normalizeItemExplorerColumnFilters(filters))).toEqual(
      filters,
    );
  });
});
