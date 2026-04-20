import { ForbiddenException } from '@nestjs/common';
import { ItemsController } from './items.controller';

describe('ItemsController', () => {
  let controller: ItemsController;
  let itemsService: any;
  let stateService: any;
  let itemExplorerStateService: any;

  beforeEach(() => {
    itemsService = {
      getFilteredItems: jest.fn().mockResolvedValue([{ itemId: 'item-1' }]),
      canUseItemTags: jest.fn().mockResolvedValue(true),
      getItemTags: jest.fn().mockResolvedValue({ item1: ['A'] }),
      saveItemTags: jest.fn().mockResolvedValue({ saved: true }),
      getItem: jest.fn().mockResolvedValue({ itemId: 'item-1' }),
      uploadEmpiricalDifficulties: jest.fn().mockResolvedValue({
        updated: 2,
        failed: ['item-x'],
        successes: ['item-1'],
        nextItemProperties: {
          'item-1': { id: 'item-1', empiricalDifficulty: 0.7 },
        },
      }),
      clearEmpiricalDifficulties: jest.fn().mockResolvedValue({
        nextItemProperties: {
          'item-1': { id: 'item-1' },
        },
      }),
    };

    stateService = {
      getAllStatesForAcp: jest.fn().mockResolvedValue([{ itemId: 'item-1' }]),
      saveResponseState: jest.fn().mockResolvedValue({ success: true }),
      getResponseState: jest.fn().mockResolvedValue({ state: { value: 1 } }),
      getResponseStateWithFallback: jest.fn().mockResolvedValue({ state: {}, isFallback: true }),
      deleteResponseState: jest.fn().mockResolvedValue({ success: true }),
    };

    itemExplorerStateService = {
      getStateForViewer: jest.fn().mockResolvedValue({
        draftState: {
          itemProperties: {
            'item-1': { id: 'item-1' },
          },
        },
      }),
      resolveActor: jest.fn().mockReturnValue({ type: 'user', id: 'u-1' }),
      patchDraft: jest.fn().mockResolvedValue({ status: 'DIRTY', version: 5 }),
    };

    controller = new ItemsController(itemsService, stateService, itemExplorerStateService);
  });

  it('returns filtered items', async () => {
    const result = await controller.getItems('acp-1', 'abc', 'label', 'asc');

    expect(result).toEqual([{ itemId: 'item-1' }]);
    expect(itemsService.getFilteredItems).toHaveBeenCalledWith('acp-1', 'abc', 'label', 'asc');
  });

  it('returns item tags for manager users', async () => {
    const req = { user: { isAppAdmin: false }, acpAccessLevel: 'MANAGER' };
    const result = await controller.getItemTags('acp-1', req);

    expect(result).toEqual({ item1: ['A'] });
    expect(itemsService.canUseItemTags).not.toHaveBeenCalled();
  });

  it('rejects item tags for non-managers when feature disabled', async () => {
    itemsService.canUseItemTags.mockResolvedValueOnce(false);
    const req = { user: { isAppAdmin: false }, acpAccessLevel: 'PUBLIC' };

    await expect(controller.getItemTags('acp-1', req)).rejects.toThrow(ForbiddenException);
  });

  it('returns item tags for non-managers when feature enabled', async () => {
    itemsService.canUseItemTags.mockResolvedValueOnce(true);
    const req = { user: { isAppAdmin: false }, acpAccessLevel: 'PUBLIC' };

    const result = await controller.getItemTags('acp-1', req);

    expect(result).toEqual({ item1: ['A'] });
  });

  it('saves item tags for non-managers when feature enabled', async () => {
    itemsService.canUseItemTags.mockResolvedValueOnce(true);
    const req = { user: { isAppAdmin: false }, acpAccessLevel: 'PUBLIC' };

    await controller.saveItemTags('acp-1', { tags: { item1: ['A'] } } as any, req);

    expect(itemsService.saveItemTags).toHaveBeenCalledWith('acp-1', { item1: ['A'] });
  });

  it('uses empty map when save item tags payload has no tags', async () => {
    const req = { user: { isAppAdmin: true }, acpAccessLevel: 'PUBLIC' };

    await controller.saveItemTags('acp-1', {} as any, req);

    expect(itemsService.saveItemTags).toHaveBeenCalledWith('acp-1', {});
  });

  it('rejects save item tags for non-managers when feature disabled', async () => {
    itemsService.canUseItemTags.mockResolvedValueOnce(false);
    const req = { user: { isAppAdmin: false }, acpAccessLevel: 'PUBLIC' };

    await expect(
      controller.saveItemTags('acp-1', { tags: {} } as any, req),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns single item', async () => {
    await expect(controller.getItem('acp-1', 'item-1')).resolves.toEqual({ itemId: 'item-1' });
  });

  it('uploads empirical difficulties directly when not in draft mode', async () => {
    const file = { buffer: Buffer.from('csv-data') } as Express.Multer.File;
    const result = await controller.uploadEmpiricalDifficulties('acp-1', file, 'false', '7');

    expect(result).toEqual(
      expect.objectContaining({
        updated: 2,
        failed: ['item-x'],
        successes: ['item-1'],
      }),
    );
    expect(itemsService.uploadEmpiricalDifficulties).toHaveBeenCalledWith(
      'acp-1',
      file.buffer,
    );
    expect(itemExplorerStateService.getStateForViewer).not.toHaveBeenCalled();
  });

  it('uploads empirical difficulties in draft mode and patches explorer state', async () => {
    const file = { buffer: Buffer.from('csv-data') } as Express.Multer.File;
    const req = { user: { sub: 'u-1' } };

    const result = await controller.uploadEmpiricalDifficulties(
      'acp-1',
      file,
      'true',
      '11',
      req as any,
    );

    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith('acp-1', true);
    expect(itemsService.uploadEmpiricalDifficulties).toHaveBeenCalledWith(
      'acp-1',
      file.buffer,
      expect.objectContaining({
        persist: false,
        itemPropertiesOverride: { 'item-1': { id: 'item-1' } },
      }),
    );
    expect(itemExplorerStateService.patchDraft).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        itemProperties: { 'item-1': { id: 'item-1', empiricalDifficulty: 0.7 } },
      }),
      expect.objectContaining({
        changeType: 'CSV_UPLOAD_EMPIRICAL_DIFFICULTY',
        baseVersion: 11,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        updated: 2,
        explorerState: { status: 'DIRTY', version: 5 },
      }),
    );
  });

  it('uses undefined baseVersion when draft upload baseVersion is invalid', async () => {
    const file = { buffer: Buffer.from('csv-data') } as Express.Multer.File;

    await controller.uploadEmpiricalDifficulties(
      'acp-1',
      file,
      'true',
      'abc',
      { user: { sub: 'u-1' } } as any,
    );

    expect(itemExplorerStateService.patchDraft).toHaveBeenCalledWith(
      'acp-1',
      expect.any(Object),
      expect.objectContaining({ baseVersion: undefined }),
    );
  });

  it('clears empirical difficulties directly when not in draft mode', async () => {
    await controller.clearEmpiricalDifficulties('acp-1', 'false', '3');

    expect(itemsService.clearEmpiricalDifficulties).toHaveBeenCalledWith('acp-1');
    expect(itemExplorerStateService.patchDraft).not.toHaveBeenCalled();
  });

  it('clears empirical difficulties in draft mode and patches explorer state', async () => {
    const req = { user: { sub: 'u-1' } };

    const result = await controller.clearEmpiricalDifficulties(
      'acp-1',
      'true',
      '4',
      req as any,
    );

    expect(itemsService.clearEmpiricalDifficulties).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        persist: false,
        itemPropertiesOverride: { 'item-1': { id: 'item-1' } },
      }),
    );
    expect(itemExplorerStateService.patchDraft).toHaveBeenCalledWith(
      'acp-1',
      expect.any(Object),
      expect.objectContaining({
        changeType: 'CLEAR_EMPIRICAL_DIFFICULTY',
        baseVersion: 4,
      }),
    );
    expect(result).toEqual({ success: true, explorerState: { status: 'DIRTY', version: 5 } });
  });

  it('uses undefined baseVersion when draft clear baseVersion is invalid', async () => {
    await controller.clearEmpiricalDifficulties(
      'acp-1',
      'true',
      'not-a-number',
      { user: { sub: 'u-1' } } as any,
    );

    expect(itemExplorerStateService.patchDraft).toHaveBeenCalledWith(
      'acp-1',
      expect.any(Object),
      expect.objectContaining({ baseVersion: undefined }),
    );
  });

  it('returns all response states for ACP', async () => {
    await expect(
      controller.getAllResponseStates('acp-1', {} as any),
    ).resolves.toEqual([{ itemId: 'item-1' }]);

    expect(stateService.getAllStatesForAcp).toHaveBeenCalledWith('acp-1', true);
  });

  it('saves response state', async () => {
    await controller.saveResponseState(
      'acp-1',
      'item-1',
      { unitId: 'unit-1', responseData: { answer: 1 } },
      {} as any,
    );

    expect(stateService.saveResponseState).toHaveBeenCalledWith(
      'acp-1',
      'item-1',
      'unit-1',
      { answer: 1 },
      true,
    );
  });

  it('returns existing response state and fallback null when missing', async () => {
    await expect(controller.getResponseState('acp-1', 'item-1', 'unit-1')).resolves.toEqual({
      state: { value: 1 },
    });
    expect(stateService.getResponseState).toHaveBeenCalledWith('acp-1', 'item-1', 'unit-1');

    stateService.getResponseState.mockResolvedValueOnce(null);
    await expect(controller.getResponseState('acp-1', 'item-2', 'unit-1')).resolves.toEqual({
      state: null,
    });
  });

  it('returns response state with fallback', async () => {
    const itemList = [{ itemId: 'item-1', unitId: 'unit-1' }];
    await expect(
      controller.getResponseStateWithFallback('acp-1', 'item-1', {
        unitId: 'unit-1',
        itemList,
      }),
    ).resolves.toEqual({ state: {}, isFallback: true });

    expect(stateService.getResponseStateWithFallback).toHaveBeenCalledWith(
      'acp-1',
      'item-1',
      'unit-1',
      itemList,
    );
  });

  it('rejects direct response-state read without unitId', async () => {
    await expect(controller.getResponseState('acp-1', 'item-1', undefined)).rejects.toThrow(
      'Query parameter "unitId" is required.',
    );
  });

  it('deletes response state', async () => {
    await expect(
      controller.deleteResponseState('acp-1', 'item-1', 'unit-1', {} as any),
    ).resolves.toEqual({ success: true });

    expect(stateService.deleteResponseState).toHaveBeenCalledWith('acp-1', 'item-1', 'unit-1', true);
  });

  it('rejects response-state delete without unitId', async () => {
    await expect(
      controller.deleteResponseState('acp-1', 'item-1', undefined, {} as any),
    ).rejects.toThrow('Query parameter "unitId" is required.');
  });
});
