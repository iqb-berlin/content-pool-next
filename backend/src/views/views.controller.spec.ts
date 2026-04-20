import { ForbiddenException } from '@nestjs/common';
import { ViewsController } from './views.controller';

describe('ViewsController', () => {
  let controller: ViewsController;
  let viewsService: any;
  let itemExplorerStateService: any;

  beforeEach(() => {
    viewsService = {
      getPublicSettings: jest.fn().mockResolvedValue({ theme: { primary: '#000' } }),
      getPublicAcps: jest.fn().mockResolvedValue([{ id: 'acp-1' }]),
      getAcpStartPage: jest.fn().mockResolvedValue({
        units: [{ id: 'unit-1' }],
        sequences: [{ id: 'seq-1' }],
        featureConfig: {
          allowIndexDownload: true,
          enableUnitView: true,
          enableItemList: true,
          enableSequenceNavigation: true,
          persistUserPreferences: true,
        },
      }),
      getAcpIndex: jest.fn().mockResolvedValue({ packageId: 'pkg-1' }),
      getUnitViewData: jest.fn().mockResolvedValue({ unitId: 'unit-1' }),
      getItemList: jest.fn().mockResolvedValue([{ itemId: 'item-1' }]),
      getItemPreferences: jest.fn().mockResolvedValue({ ui: { q: 1 }, tags: { item1: ['A'] } }),
      saveItemPreferences: jest.fn().mockResolvedValue({ ui: { q: 2 }, tags: { item1: ['B'] } }),
      getTaskSequence: jest.fn().mockResolvedValue({ id: 'seq-1', units: [{ id: 'unit-1' }] }),
    };

    itemExplorerStateService = {
      getStateForViewer: jest.fn().mockResolvedValue({ status: 'CLEAN', canEdit: false }),
    };

    controller = new ViewsController(viewsService, itemExplorerStateService);
  });

  it('returns public settings and ACP list', async () => {
    await expect(controller.getPublicSettings()).resolves.toEqual({
      theme: { primary: '#000' },
    });
    await expect(controller.getPublicAcps()).resolves.toEqual([{ id: 'acp-1' }]);
  });

  it('returns ACP start page and ACP index', async () => {
    await expect(controller.getAcpStartPage('acp-1')).resolves.toEqual(
      expect.objectContaining({ units: [{ id: 'unit-1' }] }),
    );
    await expect(controller.getAcpIndex('acp-1')).resolves.toEqual({ packageId: 'pkg-1' });
  });

  it('exports ACP index for managers and sets response headers', async () => {
    const res = { setHeader: jest.fn(), json: jest.fn() } as any;

    await controller.exportAcpIndex('acp-1', { acpAccessLevel: 'MANAGER' }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="acp-index-acp-1.json"',
    );
    expect(res.json).toHaveBeenCalledWith({ packageId: 'pkg-1' });
  });

  it('blocks ACP index export when feature is disabled for non-managers', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { allowIndexDownload: false },
    });

    await expect(
      controller.exportAcpIndex('acp-1', { acpAccessLevel: 'PUBLIC' }, {} as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns units and supports empty fallback', async () => {
    await expect(controller.getUnits('acp-1')).resolves.toEqual([{ id: 'unit-1' }]);

    viewsService.getAcpStartPage.mockResolvedValueOnce({});
    await expect(controller.getUnits('acp-1')).resolves.toEqual([]);
  });

  it('blocks unit view when feature is disabled for non-managers', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableUnitView: false },
    });

    await expect(
      controller.getUnit('acp-1', 'unit-1', { acpAccessLevel: 'PUBLIC' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('uses default allow=true for unit view when flag is unset', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: {},
    });

    await expect(
      controller.getUnit('acp-1', 'unit-1', { acpAccessLevel: 'PUBLIC' }),
    ).resolves.toEqual({ unitId: 'unit-1' });
  });

  it('returns unit view for managers regardless of feature config', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableUnitView: false },
    });

    await expect(
      controller.getUnit('acp-1', 'unit-1', { acpAccessLevel: 'MANAGER' }),
    ).resolves.toEqual({ unitId: 'unit-1' });
  });

  it('uses default allow=true for item list when flag is unset', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({ featureConfig: {} });

    await expect(controller.getItems('acp-1', { acpAccessLevel: 'PUBLIC' })).resolves.toEqual([
      { itemId: 'item-1' },
    ]);
  });

  it('blocks item list when explicitly disabled', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableItemList: false },
    });

    await expect(
      controller.getItems('acp-1', { acpAccessLevel: 'PUBLIC' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns item explorer state with edit flag derived from access level', async () => {
    await controller.getItemExplorerState('acp-1', { acpAccessLevel: 'MANAGER' });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith('acp-1', true);

    await controller.getItemExplorerState('acp-1', { acpAccessLevel: 'PUBLIC' });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith('acp-1', false);
  });

  it('returns empty preferences when persistence is disabled', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { persistUserPreferences: false },
    });

    const result = await controller.getItemPreferences(
      'acp-1',
      { user: { sub: 'u-1' } },
      'item-list',
    );

    expect(result).toEqual({ ui: {}, tags: {} });
    expect(viewsService.getItemPreferences).not.toHaveBeenCalled();
  });

  it('loads and saves preferences when persistence is enabled', async () => {
    await expect(
      controller.getItemPreferences('acp-1', { user: { sub: 'u-1' } }, 'item-list'),
    ).resolves.toEqual({ ui: { q: 1 }, tags: { item1: ['A'] } });

    await expect(
      controller.saveItemPreferences(
        'acp-1',
        { viewId: 'item-list', ui: { filter: 'x' }, tags: { item2: ['B'] } },
        { user: { sub: 'u-1' } },
      ),
    ).resolves.toEqual({ ui: { q: 2 }, tags: { item1: ['B'] } });
  });

  it('returns empty preferences on save when persistence is disabled', async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { persistUserPreferences: false },
    });

    const result = await controller.saveItemPreferences(
      'acp-1',
      { viewId: 'item-list', ui: { filter: 'x' }, tags: { item2: ['B'] } },
      { user: { sub: 'u-1' } },
    );

    expect(result).toEqual({ ui: {}, tags: {} });
    expect(viewsService.saveItemPreferences).not.toHaveBeenCalled();
  });

  it('returns sequences and sequence details when navigation is enabled', async () => {
    await expect(
      controller.getSequences('acp-1', { acpAccessLevel: 'PUBLIC' }),
    ).resolves.toEqual([{ id: 'seq-1' }]);
    await expect(
      controller.getSequence('acp-1', 'seq-1', { acpAccessLevel: 'PUBLIC' }),
    ).resolves.toEqual({ id: 'seq-1', units: [{ id: 'unit-1' }] });
  });

  it('uses default allow=true for sequence navigation when flag is unset', async () => {
    viewsService.getAcpStartPage
      .mockResolvedValueOnce({
        sequences: [{ id: 'seq-2' }],
        featureConfig: {},
      })
      .mockResolvedValueOnce({
        sequences: [{ id: 'seq-2' }],
        featureConfig: {},
      });

    await expect(
      controller.getSequences('acp-1', { acpAccessLevel: 'PUBLIC' }),
    ).resolves.toEqual([{ id: 'seq-2' }]);
  });

  it('blocks sequence navigation when disabled', async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enableSequenceNavigation: false },
    });

    await expect(
      controller.getSequences('acp-1', { acpAccessLevel: 'PUBLIC' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getSequence('acp-1', 'seq-1', { acpAccessLevel: 'PUBLIC' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
